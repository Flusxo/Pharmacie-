/**
 * Shared canvas wrapper for every 3D scene.
 * - ACES filmic tone mapping, sRGB output, antialiasing, local procedural HDR (public/hdr/studio.hdr)
 * - key light with soft shadows + rim light; ContactShadows under objects (set by each scene)
 * - tier high: post-processing (subtle bloom, ambient occlusion, vignette, optional depth of field), DPR up to 2
 *   tier medium: no post-processing, DPR up to 1.5
 * - pauses when off-screen (IntersectionObserver); reduced motion renders ONE still frame
 * - frame-rate sampler: one sample per second (stalls and hidden time ignored) -> onFps (root canvas
 *   only; the provider's TierGovernor decides, with hysteresis)
 * - WebGL context loss: the canvas fades to its fallback and comes back when the browser restores it
 * - hidden tab: rendering stops and resumes without a reload
 * - textures released when the last canvas unmounts; R3F disposes geometries/materials of unmounted meshes
 */
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { releaseTextures, setLabelResolution } from './textures';
import { frameloopFor } from '../lib/graphics';

let liveCanvases = 0;

export interface Scene3DProps {
  tier: 'high' | 'medium';
  reduced: boolean;
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number };
  className?: string;
  label: string;
  onSlow?: () => void;
  /** one frame-rate sample per second of visible rendering */
  onFps?: (fps: number) => void;
  onReady?: () => void;
  /** Background scenes keep the CPU/GPU light: capped DPR, no shadows, no post-processing. */
  light?: boolean;
  dof?: { focusDistance: number; focalLength: number; bokehScale: number };
  exposure?: number;
  environmentIntensity?: number;
  /** Keep rendering every frame (scroll/pointer driven scenes) even with no animation of their own. */
  alwaysRender?: boolean;
  /** Stop drawing (keeps the last frame), e.g. the background behind a full-screen hero. */
  paused?: boolean;
  /** Cap the frame rate (background scenes). */
  maxFps?: number;
  /** Device-pixel-ratio range (full-screen layers render below native on Medium: fill-rate bound GPUs). */
  dprRange?: [number, number];
  /** Ambient occlusion on High (off for full-screen layers: too costly over a whole viewport). */
  ao?: boolean;
  /** Bloom threshold/strength (full-screen light backgrounds need a high threshold or everything glows). */
  bloom?: { threshold: number; intensity: number };
  /** Orthographic camera fitted to a world box (like an SVG viewBox, "meet"), so HTML overlays line up. */
  ortho?: { width: number; height: number };
}

/**
 * One frame-rate sample per second. A frame longer than 250 ms (tab switch, heavy page load, a paused
 * loop resuming) resets the window instead of counting as slow; 3 s of warm-up after mount.
 */
function FpsSampler({ onFps }: { onFps: (fps: number) => void }) {
  const acc = useRef({ t: 0, frames: 0, warm: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    if (delta > 0.25) {
      a.t = 0;
      a.frames = 0;
      return;
    }
    if (a.warm < 3) {
      a.warm += delta;
      return;
    }
    a.t += delta;
    a.frames += 1;
    if (a.t >= 1) {
      onFps(a.frames / a.t);
      a.t = 0;
      a.frames = 0;
    }
  });
  return null;
}

/** Hidden tab → stop drawing (resumes by itself when visible again). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** Renders a single frame once everything has loaded (reduced motion), then tells the page it is ready. */
function FirstFrame({ reduced, onReady }: { reduced: boolean; onReady?: () => void }) {
  const { invalidate } = useThree();
  const done = useRef(false);
  useEffect(() => {
    invalidate();
    const id = requestAnimationFrame(() => {
      if (!done.current) {
        done.current = true;
        onReady?.();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [invalidate, onReady, reduced]);
  return null;
}

/** Keeps an orthographic camera's zoom so the whole box stays visible at any canvas size. */
function FitOrtho({ width, height }: { width: number; height: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.width / width, size.height / height);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, width, height]);
  return null;
}

/** Drives a "demand" canvas at a fixed rate. */
function Ticker({ fps }: { fps: number }) {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

export function Scene3D({
  tier,
  reduced,
  children,
  camera = { position: [0, 1.2, 5], fov: 35 },
  className,
  label,
  onFps,
  onReady,
  light = false,
  dof,
  exposure = 1,
  environmentIntensity = 1,
  alwaysRender = false,
  paused = false,
  maxFps,
  ortho,
  ao = true,
  dprRange,
  bloom = { threshold: 0.85, intensity: 0.35 },
}: Scene3DProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const pageVisible = usePageVisible();
  const [lost, setLost] = useState(false);
  const high = tier === 'high' && !light;
  // 4096 px labels on High (hero objects), 2048 otherwise.
  setLabelResolution(high ? 4096 : 2048);

  useEffect(() => {
    liveCanvases += 1;
    return () => {
      liveCanvases -= 1;
      if (liveCanvases === 0) releaseTextures();
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  void alwaysRender;
  const loop = frameloopFor({ visible: visible && pageVisible && !lost, paused, reduced });
  // A capped scene renders on demand, ticked by a timer.
  const frameloop = loop === 'always' && maxFps ? 'demand' : loop;
  const dpr: [number, number] = dprRange ?? (light ? [1, 1] : tier === 'high' ? [1, 2] : [1, 1.5]);

  return (
    <div
      ref={wrap}
      className={`${className ?? ''} ${lost ? 'gl-lost' : ''}`}
      data-gl={lost ? 'lost' : 'ok'}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        shadows={high ? 'soft' : false}
        orthographic={!!ortho}
        camera={
          ortho
            ? { position: camera.position, near: 0.1, far: 100, zoom: 100 }
            : { position: camera.position, fov: camera.fov ?? 35, near: 0.1, far: 100 }
        }
        gl={{ antialias: !high, alpha: true, powerPreference: light ? 'low-power' : 'high-performance' }}
        onCreated={({ gl, invalidate }) => {
          // Context loss (GPU reset, too many contexts, driver update): keep the canvas and wait for the
          // browser to restore it; three.js re-uploads textures and geometry by itself.
          const el = gl.domElement;
          el.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setLost(true);
          });
          el.addEventListener('webglcontextrestored', () => {
            setLost(false);
            invalidate();
          });
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = exposure;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <Environment files="/hdr/studio.hdr" environmentIntensity={environmentIntensity} />
          <directionalLight
            position={[-3, 5, 4]}
            intensity={1.6}
            castShadow={high}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
            shadow-radius={6}
          />
          <directionalLight position={[4, 2.5, -4]} intensity={1.1} color="#e6fff5" />
          {ortho && <FitOrtho width={ortho.width} height={ortho.height} />}
          {children}
          {high && (
            <EffectComposer multisampling={4}>
              {ao ? <N8AO halfRes aoRadius={0.4} intensity={1.6} distanceFalloff={0.6} /> : <></>}
              <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={0.15} mipmapBlur />
              {dof ? <DepthOfField focusDistance={dof.focusDistance} focalLength={dof.focalLength} bokehScale={dof.bokehScale} /> : <></>}
              <Vignette offset={0.3} darkness={0.35} />
              {/* Subtle film grain: breaks gradient banding and adds a photographic texture. */}
              <Noise premultiply opacity={0.035} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
          )}
          <FirstFrame reduced={reduced} onReady={onReady} />
        </Suspense>
        {!reduced && onFps && <FpsSampler onFps={onFps} />}
        {loop === 'always' && maxFps ? <Ticker fps={maxFps} /> : null}
      </Canvas>
    </div>
  );
}

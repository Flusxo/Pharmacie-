/**
 * Shared canvas wrapper for every 3D scene.
 * - ACES filmic tone mapping, sRGB output, antialiasing, local procedural HDR (public/hdr/studio.hdr)
 * - key light with soft shadows + rim light; ContactShadows under objects (set by each scene)
 * - tier high: post-processing (subtle bloom, ambient occlusion, vignette, optional depth of field), DPR up to 2
 *   tier medium: no post-processing, DPR up to 1.5
 * - pauses when off-screen (IntersectionObserver); reduced motion renders ONE still frame
 * - frame-rate guard: under 30 fps for 2 s -> reportSlow() (the provider steps the tier down in "auto")
 * - textures released when the last canvas unmounts; R3F disposes geometries/materials of unmounted meshes
 */
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { releaseTextures } from './textures';
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
  /** Orthographic camera fitted to a world box (like an SVG viewBox, "meet"), so HTML overlays line up. */
  ortho?: { width: number; height: number };
}

/** Counts frames; if the average stays under 30 fps for 2 s (after a 1 s warm-up), reports once. */
function FpsGuard({ onSlow }: { onSlow?: () => void }) {
  const acc = useRef({ t: 0, frames: 0, warm: 0, done: false });
  useFrame((_, delta) => {
    const a = acc.current;
    if (a.done || !onSlow) return;
    if (a.warm < 1) {
      a.warm += delta;
      return;
    }
    a.t += delta;
    a.frames += 1;
    if (a.t >= 2) {
      if (a.frames / a.t < 30) {
        a.done = true;
        onSlow();
      }
      a.t = 0;
      a.frames = 0;
    }
  });
  return null;
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
  onSlow,
  onReady,
  light = false,
  dof,
  exposure = 1,
  environmentIntensity = 1,
  alwaysRender = false,
  paused = false,
  maxFps,
  ortho,
}: Scene3DProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const high = tier === 'high' && !light;

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
  const loop = frameloopFor({ visible, paused, reduced });
  // A capped scene renders on demand, ticked by a timer.
  const frameloop = loop === 'always' && maxFps ? 'demand' : loop;
  const dpr: [number, number] = light ? [1, 1] : tier === 'high' ? [1, 2] : [1, 1.5];

  return (
    <div ref={wrap} className={className} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
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
        onCreated={({ gl }) => {
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
              <N8AO halfRes aoRadius={0.4} intensity={1.6} distanceFalloff={0.6} />
              <Bloom intensity={0.35} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
              {dof ? <DepthOfField focusDistance={dof.focusDistance} focalLength={dof.focalLength} bokehScale={dof.bokehScale} /> : <></>}
              <Vignette offset={0.28} darkness={0.42} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
          )}
          <FirstFrame reduced={reduced} onReady={onReady} />
        </Suspense>
        {!reduced && <FpsGuard onSlow={onSlow} />}
        {loop === 'always' && maxFps ? <Ticker fps={maxFps} /> : null}
      </Canvas>
    </div>
  );
}

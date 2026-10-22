/**
 * Development-only page that draws ONE picture of the render library (or one medicine pack) at the
 * size of the browser window, for scripts/render-assets.ts to screenshot. Not part of the production
 * build (the route exists only when import.meta.env.DEV).
 * /render?shot=<id>
 */
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Model } from '../three/PageScene';
import { shotById, type Shot } from './library';

/** Opaque shots: the gradient is the scene background (so post-processing keeps it in the pixels). */
function GradientBackground({ top, bottom }: { top: string; bottom: string }) {
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene, top, bottom]);
  return null;
}

/** Waits a number of frames after everything loaded, then flags the page as ready to shoot. */
function Ready({ frames = 24 }: { frames?: number }) {
  const n = useRef(0);
  const setFrameloop = useThree((st) => st.setFrameloop);
  useFrame(() => {
    n.current += 1;
    if (n.current === frames) {
      // Keep the last frame (preserveDrawingBuffer) and stop drawing so the screenshot is quick.
      setFrameloop('never');
      (window as unknown as { __renderReady: boolean }).__renderReady = true;
    }
  });
  return null;
}

/**
 * Frames the objects: keeps the shot's viewing direction and moves the camera so the bounding box of the
 * items fills `fit` of the frame (cut-outs ≈ 0.8, full-bleed heroes > 1). Runs on the second frame,
 * once every model has its geometry.
 */
function Frame({ shot, items }: { shot: Shot; items: RefObject<THREE.Group> }) {
  const { camera, size } = useThree();
  const done = useRef(0);
  useFrame(() => {
    done.current += 1;
    if (done.current !== 2 || !items.current) return;
    const box = new THREE.Box3().setFromObject(items.current);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const pos = new THREE.Vector3(...shot.camera.pos);
    const dir = pos.sub(new THREE.Vector3(...shot.camera.target)).normalize();
    const cam = camera as THREE.PerspectiveCamera;
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const need = Math.max(dims.y, dims.x / (size.width / size.height));
    const dist = need / 2 / Math.tan(half) / (shot.fit ?? 0.8) + dims.z / 2;
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
  });
  return null;
}

function ShotScene({ shot }: { shot: Shot }) {
  const transparent = shot.bg === 'transparent';
  const items = useRef<THREE.Group>(null);
  return (
    <>
      {!transparent && <GradientBackground top={(shot.bg as [string, string])[0]} bottom={(shot.bg as [string, string])[1]} />}
      <Environment files="/hdr/studio.hdr" environmentIntensity={1.05} />
      <directionalLight
        position={[-3, 5, 4]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-radius={8}
      />
      <directionalLight position={[4, 2.5, -4]} intensity={1.1} color="#e6fff5" />
      <ambientLight intensity={0.25} />
      <Frame shot={shot} items={items} />
      <group ref={items}>
        {shot.items.map((it, i) => (
          <group key={i} position={it.pos} rotation={it.rot ?? [0, 0, 0]} scale={it.scale ?? 1}>
            <Model it={it} split={it.split ? 0.6 : 0} quality="high" />
          </group>
        ))}
      </group>
      {shot.shadowY !== undefined && (
        <ContactShadows
          position={[0, shot.shadowY, 0]}
          opacity={transparent ? 0.42 : 0.5}
          scale={10}
          blur={2.6}
          far={2.5}
          resolution={1024}
        />
      )}
      {/* Post-processing only on opaque backgrounds (keeps the alpha of cut-outs clean). */}
      {!transparent && (
        <EffectComposer multisampling={8}>
          <N8AO aoRadius={0.5} intensity={1.4} distanceFalloff={0.6} />
          <Bloom intensity={0.25} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      <Ready />
    </>
  );
}

export default function RenderStudio() {
  // Cut-outs are shot with a transparent background: nothing behind the canvas.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const shot = useMemo(() => shotById(params.get('shot') ?? ''), [params]);
  if (!shot) return <p data-testid="render-missing" />;
  const bg = shot.bg === 'transparent' ? 'transparent' : `linear-gradient(180deg, ${shot.bg[0]}, ${shot.bg[1]})`;
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }} data-testid="render-stage">
      <Canvas
        dpr={1}
        shadows="soft"
        frameloop="always"
        camera={{ position: shot.camera.pos, fov: shot.camera.fov, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <ShotScene shot={shot} />
        </Suspense>
      </Canvas>
    </div>
  );
}

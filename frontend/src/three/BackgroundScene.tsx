/**
 * Persistent full-page background: a soft pharmacy atmosphere behind every page.
 * Floating glass bottles, split capsules, tablets and a glowing green cross at different depths,
 * fog for depth of field, gentle float, parallax with scroll and pointer. Deliberately light:
 * DPR 1, no shadows, no post-processing (Scene3D "light" mode).
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Scene3D } from './Scene3D';
import { Capsule, GreenCross, Tablet } from './models';

const CAPSULE_COLORS: [string, string][] = [
  ['#065F46', '#F8FAFC'],
  ['#3B82F6', '#F8FAFC'],
  ['#F59E0B', '#FDE68A'],
  ['#10B981', '#A7F3D0'],
];

/** Glass look without a transmission pass (keeps the background cheap). */
function MiniBottle() {
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#dff3ec',
        transparent: true,
        opacity: 0.38,
        roughness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.6,
        depthWrite: false,
      }),
    [],
  );
  const geo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.001, 0],
          [0.28, 0],
          [0.32, 0.06],
          [0.32, 0.62],
          [0.18, 0.78],
          [0.13, 0.82],
          [0.13, 0.95],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        48,
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={geo} material={glass} />
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.12, 32]} />
        <meshPhysicalMaterial color="#e2f7ef" clearcoat={1} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Camera follows the page scroll and the pointer (smoothed). */
function Parallax({ reduced }: { reduced: boolean }) {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3());
  useFrame(() => {
    if (reduced) return;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = window.scrollY / max;
    target.current.set(pointer.x * 0.5, 0.4 - p * 2.2 + pointer.y * 0.3, 9);
    camera.position.lerp(target.current, 0.05);
    camera.lookAt(0, -p * 2.2, 0);
  });
  return null;
}

/** Deterministic layout so the scene looks identical on every load. */
function layout(n: number, seed: number) {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: n }, () => ({
    // Mostly at the sides so page content in the middle stays readable.
    pos: [(r() < 0.5 ? -1 : 1) * (3.2 + r() * 4.5), (r() - 0.5) * 11, -0.5 - r() * 6] as [number, number, number],
    rot: [r() * Math.PI, r() * Math.PI, r() * Math.PI] as [number, number, number],
    speed: 0.6 + r() * 1.2,
    pick: r(),
  }));
}

function Objects({ reduced, dark }: { reduced: boolean; dark: boolean }) {
  const { size } = useThree();
  // Narrow screens: bring the side objects closer to the centre so phones see them too.
  const spread = THREE.MathUtils.clamp(size.width / size.height / 1.6, 0.42, 1);
  const items = useMemo(() => layout(20, 42), []);
  const fogColor = dark ? '#07130f' : '#f6fbf9';
  return (
    <>
      <fog attach="fog" args={[fogColor, 9, 22]} />
      <ambientLight intensity={dark ? 0.25 : 0.5} />
      <Float speed={reduced ? 0 : 1} rotationIntensity={0.3} floatIntensity={0.6}>
        <GreenCross position={[5.2, 2.4, -2.5]} scale={0.9} rotation={[0.2, -0.5, 0]} glow={dark ? 1.4 : 0.9} />
      </Float>
      {items.map((it, i) => (
        <Float key={i} speed={reduced ? 0 : it.speed} rotationIntensity={0.8} floatIntensity={0.8}>
          <group position={[it.pos[0] * spread, it.pos[1], it.pos[2]]} rotation={it.rot}>
            {it.pick < 0.45 ? (
              <Capsule colorA={CAPSULE_COLORS[i % 4][0]} colorB={CAPSULE_COLORS[i % 4][1]} scale={2.4} cheap />
            ) : it.pick < 0.8 ? (
              <Tablet scale={2.6} />
            ) : (
              <group scale={1.5}>
                <MiniBottle />
              </group>
            )}
          </group>
        </Float>
      ))}
      <Parallax reduced={reduced} />
    </>
  );
}

export default function BackgroundScene({
  reduced,
  dark,
  onSlow,
  onReady,
  paused = false,
}: {
  paused?: boolean;
  tier: 'high' | 'medium';
  reduced: boolean;
  dark: boolean;
  onSlow?: () => void;
  onReady?: () => void;
}) {
  return (
    <Scene3D
      tier="medium"
      light
      reduced={reduced}
      label=""
      className="site-bg-canvas"
      camera={{ position: [0, 0.4, 9], fov: 45 }}
      exposure={dark ? 0.75 : 1}
      environmentIntensity={dark ? 0.5 : 1}
      onSlow={onSlow}
      onReady={onReady}
      alwaysRender
      paused={paused}
      maxFps={30}
    >
      <Objects reduced={reduced} dark={dark} />
    </Scene3D>
  );
}

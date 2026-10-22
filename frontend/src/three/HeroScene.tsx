/**
 * Home hero: a realistic pharmacy counter. White marble counter, softly blurred shelf of boxes
 * (fictional brands, instanced layout), glossy green cross sign glowing softly, hero amber glass
 * bottle with a crisp label, capsules and tablets resting on the counter with contact shadows.
 * Camera driven by scroll progress (bottle -> capsules -> pull back to the shelf) + pointer parallax (max 6°).
 */
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Float, RoundedBox } from '@react-three/drei';
import { Scene3D } from './Scene3D';
import { AmberBottle, Capsule, Counter, GreenCross, PharmaBox, Tablet } from './models';
import { useI18n } from '../i18n';

// Fictional brands only (no real trademarks on props).
const BRANDS: [string, string][] = [
  ['Calmora', '#065F46'],
  ['Nasivia', '#0369A1'],
  ['Dermalis', '#BE185D'],
  ['Vitaléa', '#C2410C'],
  ['Apaisa', '#7C3AED'],
  ['Respira+', '#4338CA'],
  ['Gastrel', '#B45309'],
  ['Allerga', '#0F766E'],
];

// Camera keyframes [position, lookAt] along the scroll.
// The search panel covers the left of the screen, so subjects are framed to the right.
const KEYS: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-0.35, 1.2, 2.5), new THREE.Vector3(-0.3, 0.8, 0)],
  [new THREE.Vector3(-1.55, 0.95, 1.9), new THREE.Vector3(-1.45, 0.5, 0.1)],
  [new THREE.Vector3(-0.2, 1.75, 5.6), new THREE.Vector3(-0.5, 1.35, -1)],
];

// Portrait screens: the search panel covers the top, so subjects are framed in the lower part.
const KEYS_PORTRAIT: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(0.35, 1.9, 3.9), new THREE.Vector3(0.35, 1.55, 0)],
  [new THREE.Vector3(-0.95, 1.55, 2.9), new THREE.Vector3(-0.95, 1.2, 0.1)],
  [new THREE.Vector3(0, 2.7, 7.6), new THREE.Vector3(0, 2.3, -1)],
];

function CameraRig({ progress, reduced }: { progress: MutableRefObject<number>; reduced: boolean }) {
  const { camera, pointer, size } = useThree();
  const keys = size.width / size.height < 0.9 ? KEYS_PORTRAIT : KEYS;
  const pos = useRef(new THREE.Vector3().copy(keys[0][0]));
  const look = useRef(new THREE.Vector3().copy(keys[0][1]));
  const tmpP = new THREE.Vector3();
  const tmpL = new THREE.Vector3();
  useFrame((_, dt) => {
    const p = THREE.MathUtils.clamp(progress.current, 0, 1) * (keys.length - 1);
    const i = Math.min(Math.floor(p), keys.length - 2);
    const f = THREE.MathUtils.smoothstep(p - i, 0, 1);
    tmpP.lerpVectors(keys[i][0], keys[i + 1][0], f);
    tmpL.lerpVectors(keys[i][1], keys[i + 1][1], f);
    if (!reduced) {
      // Pointer parallax, at most 6 degrees around the look-at point.
      const max = THREE.MathUtils.degToRad(6);
      const off = tmpP.clone().sub(tmpL);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -pointer.x * max);
      off.applyAxisAngle(new THREE.Vector3(1, 0, 0), pointer.y * max * 0.6);
      tmpP.copy(tmpL).add(off);
    }
    // Time-based smoothing: same feel at 30 or 144 fps, and it still converges on slow devices.
    const k = reduced ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.25));
    pos.current.lerp(tmpP, k);
    look.current.lerp(tmpL, k);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
  });
  return null;
}

function Shelf() {
  const boxes = useMemo(() => {
    const out: { brand: string; color: string; pos: [number, number, number]; size: [number, number, number]; rot: number }[] = [];
    let k = 0;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 9; col++) {
        const [brand, color] = BRANDS[k++ % BRANDS.length];
        const h = 0.42 + ((col * 7 + row * 3) % 4) * 0.06;
        out.push({
          brand,
          color,
          pos: [-2.4 + col * 0.6, 1.0 + row * 0.85 + h / 2, -1.6],
          size: [0.42, h, 0.22],
          rot: ((col + row) % 3) * 0.06 - 0.06,
        });
      }
    return out;
  }, []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9c7ab', roughness: 0.6 }), []);
  return (
    <group>
      {[0, 1, 2].map((r) => (
        <RoundedBox key={r} args={[5.8, 0.06, 0.5]} radius={0.02} position={[0, 0.97 + r * 0.85, -1.6]} material={wood} receiveShadow />
      ))}
      <mesh position={[0, 1.9, -1.88]} receiveShadow>
        <planeGeometry args={[6.4, 3.2]} />
        <meshStandardMaterial color="#eef5f1" roughness={0.9} />
      </mesh>
      {boxes.map((b, i) => (
        <PharmaBox key={i} brand={b.brand} color={b.color} size={b.size} position={b.pos} rotation={[0, b.rot, 0]} />
      ))}
    </group>
  );
}

function Props({ reduced }: { reduced: boolean }) {
  return (
    <group position={[0, 0.44, 0]}>
      <Float speed={reduced ? 0 : 1.2} rotationIntensity={0.15} floatIntensity={0.12} floatingRange={[0, 0.05]}>
        <group position={[0.35, 0, 0.1]} scale={0.55}>
          <AmberBottle
            label={{ name: 'Apaisa', dosage: '150 ml', color: '#065F46', light: '#A7F3D0', cip: '3400930001234' }}
            quality="high"
            open={0}
          />
        </group>
      </Float>
      <Capsule position={[-0.85, 0.105, 0.25]} rotation={[0, 0.4, Math.PI / 2]} />
      <Capsule position={[-1.15, 0.105, 0.05]} rotation={[0, -0.6, Math.PI / 2]} colorA="#3B82F6" />
      <Capsule position={[-0.6, 0.105, -0.12]} rotation={[0, 1.4, Math.PI / 2]} colorA="#F59E0B" colorB="#FDE68A" />
      <Tablet position={[-1.35, 0.052, 0.35]} rotation={[-Math.PI / 2, 0, 0.3]} />
      <Tablet position={[-1.05, 0.052, 0.5]} rotation={[-Math.PI / 2, 0, 1.2]} />
      <Tablet position={[-0.4, 0.052, 0.42]} rotation={[-Math.PI / 2, 0, 2.1]} />
      <PharmaBox brand="Calmora" color="#065F46" size={[0.36, 0.5, 0.16]} position={[1.2, 0.25, -0.2]} rotation={[0, -0.4, 0]} />
      <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={5} blur={2.2} far={1.2} resolution={512} />
    </group>
  );
}

export default function HeroScene({
  tier,
  reduced,
  progress,
  onSlow,
  onReady,
}: {
  tier: 'high' | 'medium';
  reduced: boolean;
  progress: MutableRefObject<number>;
  onSlow?: () => void;
  onReady?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Scene3D
      tier={tier}
      reduced={reduced}
      label={t('three.heroLabel')}
      className="hero-canvas"
      camera={{ position: [0.6, 1.25, 2.6], fov: 38 }}
      // Focus on the counter (~2.5 units of a 100-unit depth range); the shelf behind falls softly out of focus.
      dof={{ focusDistance: 0.025, focalLength: 0.02, bokehScale: 1.5 }}
      exposure={0.95}
      onSlow={onSlow}
      onReady={onReady}
      alwaysRender
    >
      <color attach="background" args={['#eef6f2']} />
      <fog attach="fog" args={['#eef6f2', 8, 18]} />
      <CameraRig progress={progress} reduced={reduced} />
      <Counter />
      <Shelf />
      <Float speed={reduced ? 0 : 1} rotationIntensity={0.05} floatIntensity={0.1}>
        <GreenCross position={[2.4, 2.75, -1.5]} scale={0.32} glow={1.6} />
      </Float>
      <pointLight position={[2.4, 2.75, -1.1]} color="#34d399" intensity={3} distance={3} />
      <Props reduced={reduced} />
    </Scene3D>
  );
}

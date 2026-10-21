/**
 * Smaller scenes: simulated delivery (order tracking), pharmacy stock shelf, "request sent" check,
 * spinning capsule. All share Scene3D (tiers, fallbacks, pausing, disposal).
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Float, Html, RoundedBox } from '@react-three/drei';
import { Scene3D } from './Scene3D';
import { Capsule, GreenCross, Tablet, plastic } from './models';

type Tier = 'high' | 'medium';
const rngFrom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

// ---------------- Simulated delivery ----------------

function Scooter() {
  const body = useMemo(() => plastic('#10B981', { clearcoat: 1, roughness: 0.25 }), []);
  const bag = useMemo(() => plastic('#F8FAFC', { clearcoat: 0.5, roughness: 0.5 }), []);
  return (
    <group scale={0.55}>
      <RoundedBox args={[1.1, 0.25, 0.4]} radius={0.1} position={[0, 0.45, 0]} material={body} castShadow />
      <RoundedBox args={[0.3, 0.7, 0.3]} radius={0.1} position={[0.45, 0.75, 0]} rotation={[0, 0, -0.3]} material={body} castShadow />
      <RoundedBox args={[0.6, 0.55, 0.55]} radius={0.08} position={[-0.35, 0.9, 0]} material={bag} castShadow />
      <GreenCross position={[-0.35, 0.92, 0.29]} scale={0.12} glow={1.2} />
      {[-0.45, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.18, 0.07, 12, 24]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Confetti({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const start = useRef<number | null>(null);
  const parts = useMemo(() => {
    const r = rngFrom(9);
    return Array.from({ length: count }, () => ({
      v: new THREE.Vector3((r() - 0.5) * 3, 2.5 + r() * 2.5, (r() - 0.5) * 3),
      spin: new THREE.Vector3(r() * 6, r() * 6, r() * 6),
      color: ['#10B981', '#A7F3D0', '#3B82F6', '#F59E0B', '#065F46'][Math.floor(r() * 5)],
    }));
  }, [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((s) => {
    const m = ref.current;
    if (!m) return;
    if (start.current === null) {
      start.current = s.clock.elapsedTime;
      parts.forEach((p, i) => m.setColorAt(i, new THREE.Color(p.color)));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const t = Math.min(s.clock.elapsedTime - start.current, 3);
    parts.forEach((p, i) => {
      dummy.position.set(p.v.x * t, Math.max(0.02, 0.5 + p.v.y * t - 2.8 * t * t), p.v.z * t);
      dummy.rotation.set(p.spin.x * t, p.spin.y * t, p.spin.z * t);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.08, 0.14]} />
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.6} />
    </instancedMesh>
  );
}

function City() {
  const blocks = useMemo(() => {
    const r = rngFrom(3);
    const out: { p: [number, number, number]; h: number }[] = [];
    for (let x = -5; x <= 5; x++)
      for (let z = -4; z <= 4; z++) {
        if (Math.abs(z) <= 0 || (x % 3 === 0 && Math.abs(x) <= 3)) continue; // keep the streets free
        if (r() < 0.25) continue;
        out.push({ p: [x * 1.1, 0, z * 1.1], h: 0.3 + r() * 1.4 });
      }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e7efeb', roughness: 0.85 }), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#d6e2dc" roughness={0.95} />
      </mesh>
      {blocks.map((b, i) => (
        <RoundedBox
          key={i}
          args={[0.8, b.h, 0.8]}
          radius={0.04}
          position={[b.p[0], b.h / 2, b.p[2]]}
          material={mat}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

function Route({ progress, reduced, confetti }: { progress: number; reduced: boolean; confetti: number }) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-4.4, 0.05, 0),
        new THREE.Vector3(-1.5, 0.05, 0),
        new THREE.Vector3(0, 0.05, 0.6),
        new THREE.Vector3(1.6, 0.05, 0),
        new THREE.Vector3(3.3, 0.05, 0),
        new THREE.Vector3(3.3, 0.05, 2.2),
      ]),
    [],
  );
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.06, 10, false), [curve]);
  const glow = useRef<THREE.Mesh>(null);
  const scooter = useRef<THREE.Group>(null);
  const shown = useRef(0);
  const camera = useThree((st) => st.camera);
  useFrame((_, dt) => {
    shown.current = reduced ? progress : THREE.MathUtils.damp(shown.current, progress, 2.5, dt);
    const p = Math.min(0.999, Math.max(0.001, shown.current));
    // The glowing path fills as the order progresses.
    const idx = tube.index ? tube.index.count : 0;
    glow.current?.geometry.setDrawRange(0, Math.floor(idx * p));
    const pos = curve.getPointAt(p);
    const tan = curve.getTangentAt(p);
    if (scooter.current) {
      scooter.current.position.copy(pos);
      scooter.current.rotation.y = Math.atan2(-tan.z, tan.x);
    }
    // Gently follow the courier.
    const target = new THREE.Vector3(pos.x - 1.2, 3.2, pos.z + 4.2);
    camera.position.lerp(target, reduced ? 1 : 1 - Math.exp(-2 * dt));
    camera.lookAt(pos.x, 0, pos.z);
  });
  const end = curve.getPointAt(1);
  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
      </mesh>
      <mesh ref={glow} geometry={tube.clone()} scale={[1, 1.4, 1.4]}>
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <GreenCross position={[-4.4, 0.6, 0]} scale={0.22} glow={1.4} />
      <group position={[end.x, 0, end.z]}>
        <RoundedBox args={[0.7, 0.6, 0.7]} radius={0.06} position={[0, 0.3, 0]} castShadow>
          <meshStandardMaterial color="#3B82F6" roughness={0.5} />
        </RoundedBox>
        {confetti > 0 && <Confetti count={confetti} />}
      </group>
      <group ref={scooter}>
        <Scooter />
      </group>
    </group>
  );
}

export function DeliveryScene({
  tier,
  reduced,
  progress,
  delivered,
  mobile,
  onSlow,
  onReady,
}: {
  tier: Tier;
  reduced: boolean;
  progress: number;
  delivered: boolean;
  mobile: boolean;
  onSlow?: () => void;
  onReady?: () => void;
}) {
  return (
    <Scene3D
      tier={tier}
      reduced={reduced}
      label="Suivi simulé : livreur en scooter sur le trajet entre la pharmacie et l’adresse de livraison."
      className="delivery-canvas"
      camera={{ position: [-5, 3.2, 4.5], fov: 40 }}
      onSlow={onSlow}
      onReady={onReady}
    >
      <color attach="background" args={['#eef5f1']} />
      <fog attach="fog" args={['#eef5f1', 8, 18]} />
      <City />
      <Route progress={progress} reduced={reduced} confetti={delivered && !reduced ? (mobile ? 60 : 150) : 0} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.35} scale={14} blur={2} far={2} resolution={512} />
    </Scene3D>
  );
}

// ---------------- Pharmacy stock shelf ----------------

export interface ShelfItem {
  id: string;
  name: string;
  quantity: number;
  low: boolean;
}

function ShelfBoxes({ items }: { items: ShelfItem[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const perRow = 10;
  const max = Math.max(1, ...items.map((i) => i.quantity));
  return (
    <group position={[-((Math.min(perRow, items.length) - 1) * 0.55) / 2, 0, 0]}>
      {Array.from({ length: Math.ceil(items.length / perRow) }, (_, r) => (
        <RoundedBox
          key={r}
          args={[perRow * 0.55 + 0.4, 0.06, 0.7]}
          radius={0.02}
          position={[((perRow - 1) * 0.55) / 2, r * 1.5 - 0.03, 0]}
          receiveShadow
        >
          <meshStandardMaterial color="#d9c7ab" roughness={0.6} />
        </RoundedBox>
      ))}
      {items.map((it, i) => {
        const h = 0.08 + (Math.min(it.quantity, max) / max) * 1.1;
        const x = (i % perRow) * 0.55;
        const y = Math.floor(i / perRow) * 1.5;
        return (
          <group key={it.id} position={[x, y + h / 2, 0]}>
            <RoundedBox
              args={[0.42, h, 0.42]}
              radius={0.03}
              castShadow
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(i);
              }}
              onPointerOut={() => setHover(null)}
            >
              <meshStandardMaterial color={it.quantity === 0 ? '#94a3b8' : it.low ? '#EF4444' : '#10B981'} roughness={0.45} />
            </RoundedBox>
            {hover === i && (
              <Html position={[0, h / 2 + 0.25, 0]} center distanceFactor={6}>
                <div className="shelf-tip">
                  <strong>{it.name}</strong>
                  <span>{it.quantity}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function ShelfScene({
  tier,
  reduced,
  items,
  onSlow,
  onReady,
}: {
  tier: Tier;
  reduced: boolean;
  items: ShelfItem[];
  onSlow?: () => void;
  onReady?: () => void;
}) {
  const rows = Math.ceil(items.length / 10);
  return (
    <Scene3D
      tier={tier}
      reduced={reduced}
      label="Étagère de stock : la hauteur de chaque boîte correspond à la quantité, rouge quand le stock est faible."
      className="shelf-canvas"
      camera={{ position: [0, 1 + rows * 0.75, 4.5 + rows * 1.2], fov: 40 }}
      onSlow={onSlow}
      onReady={onReady}
    >
      <color attach="background" args={['#f3f7f5']} />
      <group position={[0, -rows * 0.5, 0]}>
        <ShelfBoxes items={items} />
      </group>
    </Scene3D>
  );
}

// ---------------- "Request sent" check + capsule ----------------

function DrawnCheck({ reduced }: { reduced: boolean }) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [new THREE.Vector3(-0.7, 0.05, 0), new THREE.Vector3(-0.2, -0.45, 0), new THREE.Vector3(0.8, 0.6, 0)],
        false,
        'catmullrom',
        0.05,
      ),
    [],
  );
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.11, 16, false), [curve]);
  const mesh = useRef<THREE.Mesh>(null);
  const t = useRef(reduced ? 1 : 0);
  const [burst, setBurst] = useState(reduced);
  useFrame((_, dt) => {
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / 0.55);
      if (t.current === 1) setBurst(true);
    }
    const count = geo.index ? geo.index.count : 0;
    mesh.current?.geometry.setDrawRange(0, Math.floor(count * THREE.MathUtils.smootherstep(t.current, 0, 1)));
  });
  return (
    <group>
      <mesh ref={mesh} geometry={geo}>
        <meshPhysicalMaterial color="#10B981" clearcoat={1} roughness={0.2} emissive="#065F46" emissiveIntensity={0.3} />
      </mesh>
      {burst && !reduced && <MintBurst />}
    </group>
  );
}

function MintBurst() {
  const ref = useRef<THREE.Points>(null);
  const start = useRef<number | null>(null);
  const v = useMemo(() => {
    const r = rngFrom(21);
    return Array.from({ length: 50 }, () => new THREE.Vector3((r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 1));
  }, []);
  const pos = useMemo(() => new Float32Array(v.length * 3), [v]);
  useFrame((s) => {
    if (!ref.current) return;
    if (start.current === null) start.current = s.clock.elapsedTime;
    const t = s.clock.elapsedTime - start.current;
    const a = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    v.forEach((d, i) => a.setXYZ(i, 0.3 + d.x * t, 0.2 + d.y * t, d.z * t));
    a.needsUpdate = true;
    (ref.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t / 0.8);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color="#A7F3D0" transparent depthWrite={false} />
    </points>
  );
}

export function CheckScene({ tier, reduced, onReady }: { tier: Tier; reduced: boolean; onReady?: () => void }) {
  return (
    <Scene3D
      tier={tier}
      reduced={reduced}
      label="Demande envoyée"
      className="check-canvas"
      camera={{ position: [0, 0, 3.2], fov: 35 }}
      onReady={onReady}
    >
      <DrawnCheck reduced={reduced} />
    </Scene3D>
  );
}

function Spinner({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current && !reduced) g.current.rotation.z -= dt * 2.4;
  });
  return (
    <group ref={g}>
      <Capsule scale={3.2} rotation={[0.4, 0.3, 0]} />
    </group>
  );
}

export function CapsuleScene({ tier, reduced, onReady }: { tier: Tier; reduced: boolean; onReady?: () => void }) {
  return (
    <Scene3D
      tier={tier}
      reduced={reduced}
      label="Gélule en 3D"
      className="capsule-canvas"
      camera={{ position: [0, 0.3, 3.4], fov: 35 }}
      onReady={onReady}
    >
      <Float speed={reduced ? 0 : 1.5} floatIntensity={0.4}>
        <Spinner reduced={reduced} />
      </Float>
      <Tablet position={[0.9, -0.75, 0.3]} rotation={[-1.1, 0, 0.4]} scale={2.2} />
      <Tablet position={[-1, -0.8, 0]} rotation={[-1.3, 0, 1.2]} scale={2.2} />
      <ContactShadows position={[0, -0.95, 0]} opacity={0.4} scale={5} blur={2.4} far={2} />
    </Scene3D>
  );
}

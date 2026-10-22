/**
 * Larger set pieces for the root stage and the renders (add-on 3D upgrade):
 * - PharmacyInterior: floor, back wall of stocked shelves, marble counter, a lit green cross sign
 * - LightBeams: soft cones from ceiling lamps with dust drifting in them
 * - DeliveryRoute: a glowing path with light pulses running along it and a scooter riding it
 * All procedural (own work, CC0). Animation stops with reduced motion.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Counter, GreenCross, MapPin, Scooter, plastic } from './models';
import { marbleTexture } from './textures';

const BRANDS: [string, string][] = [
  ['Calmora', '#065F46'],
  ['Rhinova', '#7C3AED'],
  ['Gastrel', '#B45309'],
  ['Vitalis', '#C2410C'],
  ['Dermalis', '#BE185D'],
  ['Pulmo', '#4338CA'],
  ['Glucora', '#0F766E'],
  ['Cardia', '#B91C1C'],
  ['Apaisa', '#047857'],
  ['Nasivia', '#0369A1'],
];

/** Far shelves: wood planks + ONE instanced mesh for all boxes (they sit deep in the fog). */
function Shelves({ units }: { units: number[] }) {
  const wood = useMemo(() => new THREE.MeshLambertMaterial({ color: '#f4efe6' }), []);
  const rows = [0.15, 1.05, 1.95];
  const boxes = useRef<THREE.InstancedMesh>(null);
  const count = units.length * rows.length * 4;
  const geo = useMemo(() => new THREE.BoxGeometry(0.42, 0.62, 0.26), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial(), []);
  useLayoutEffect(() => {
    const m = boxes.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    let k = 0;
    units.forEach((x, u) =>
      rows.forEach((y, r) =>
        [0, 1, 2, 3].forEach((i) => {
          o.position.set(x - 0.78 + i * 0.52, y + 0.31, 0.02);
          o.rotation.set(0, (((i + r) % 3) - 1) * 0.05, 0);
          o.updateMatrix();
          m.setMatrixAt(k, o.matrix);
          // Mostly white cartons with the brand colour mixed in.
          m.setColorAt(k, c.set(BRANDS[(u * 3 + r * 4 + i) % BRANDS.length][1]).lerp(new THREE.Color('#ffffff'), 0.55));
          k += 1;
        }),
      ),
    );
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [units]);
  return (
    <group>
      {units.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh material={wood} position={[0, 1.3, -0.3]}>
            <boxGeometry args={[2.2, 2.9, 0.06]} />
          </mesh>
          {rows.map((y) => (
            <mesh key={y} material={wood} position={[0, y - 0.05, 0]}>
              <boxGeometry args={[2.2, 0.06, 0.55]} />
            </mesh>
          ))}
        </group>
      ))}
      <instancedMesh ref={boxes} args={[geo, mat, count]} />
    </group>
  );
}

/** Lit pharmacy cross sign on an arm, with its own green glow. */
function CrossSign(props: JSX.IntrinsicElements['group']) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 2.2 + Math.sin(clock.elapsedTime * 1.4) * 0.25;
  });
  return (
    <group {...props}>
      <mesh position={[0, 0.5, -0.2]}>
        <boxGeometry args={[0.06, 1.2, 0.06]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
      </mesh>
      <GreenCross glow={2.2} scale={0.38} />
      <pointLight ref={ref} color="#10b981" intensity={2.2} distance={4} decay={2} position={[0, 0, 0.4]} />
    </group>
  );
}

/**
 * Baked lighting for the big surfaces: the light pools under the three ceiling lamps, the green glow of the
 * sign and soft occlusion under the shelves and the counter are painted once into the textures, so the
 * floor and the wall are unlit (MeshBasic) — a fraction of the cost of shading them every frame.
 */
function bakedTexture(kind: 'floor' | 'wall'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = kind === 'floor' ? 640 : 336;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  if (kind === 'floor') {
    g.drawImage(marbleTexture().image as HTMLCanvasElement, 0, 0, W, H);
    g.fillStyle = 'rgba(214, 226, 222, 0.55)';
    g.fillRect(0, 0, W, H);
  } else {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#dfeeea');
    grad.addColorStop(1, '#eef6f3');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  // Light pools under the lamps (beams at x = -3, 0, 3 world on a 16-unit-wide surface).
  for (const lx of [-3, 0, 3]) {
    const x = ((lx + 8) / 16) * W;
    const y = kind === 'floor' ? H * 0.35 : H * 0.15;
    const r = kind === 'floor' ? W * 0.12 : W * 0.1;
    const pool = g.createRadialGradient(x, y, 0, x, y, r);
    pool.addColorStop(0, 'rgba(255, 252, 235, 0.55)');
    pool.addColorStop(1, 'rgba(255, 252, 235, 0)');
    g.fillStyle = pool;
    g.fillRect(0, 0, W, H);
  }
  // Green glow of the cross sign (x = 3.4) on the wall.
  if (kind === 'wall') {
    const x = ((3.4 + 8) / 16) * W;
    const glow = g.createRadialGradient(x, H * 0.12, 0, x, H * 0.12, W * 0.08);
    glow.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    // Soft contact shade behind the shelves.
    const sh = g.createLinearGradient(0, H * 0.45, 0, H);
    sh.addColorStop(0, 'rgba(11, 37, 48, 0)');
    sh.addColorStop(1, 'rgba(11, 37, 48, 0.12)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
  } else {
    // Occlusion: darker along the back wall and under the counter.
    const back = g.createLinearGradient(0, 0, 0, H * 0.25);
    back.addColorStop(0, 'rgba(11, 37, 48, 0.22)');
    back.addColorStop(1, 'rgba(11, 37, 48, 0)');
    g.fillStyle = back;
    g.fillRect(0, 0, W, H);
    const counter = g.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, W * 0.22);
    counter.addColorStop(0, 'rgba(11, 37, 48, 0.18)');
    counter.addColorStop(1, 'rgba(11, 37, 48, 0)');
    g.fillStyle = counter;
    g.fillRect(0, 0, W, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function PharmacyInterior(props: JSX.IntrinsicElements['group']) {
  const floor = useMemo(() => new THREE.MeshBasicMaterial({ map: bakedTexture('floor') }), []);
  const wall = useMemo(() => new THREE.MeshBasicMaterial({ map: bakedTexture('wall') }), []);
  return (
    <group {...props}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={floor} receiveShadow>
        <planeGeometry args={[16, 10]} />
      </mesh>
      <mesh position={[0, 2.6, -2.4]} material={wall}>
        <planeGeometry args={[16, 5.2]} />
      </mesh>
      <group position={[0, 0, -1.95]}>
        <Shelves units={[-4.6, -2.3, 0, 2.3, 4.6]} />
      </group>
      <group position={[0, 0.84, 0.9]} scale={1.15}>
        <Counter />
      </group>
      <CrossSign position={[3.4, 3.3, -1.6]} />
    </group>
  );
}

/** Ceiling lamp beams (additive cones) with slowly drifting dust. */
export function LightBeams({
  count = 3,
  reduced = false,
  ...props
}: { count?: number; reduced?: boolean } & JSX.IntrinsicElements['group']) {
  const beamMat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,240,0.55)');
    grad.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.35,
    });
  }, []);
  const dust = useRef<THREE.Points>(null);
  const N = 420;
  const { positions, speeds } = useMemo(() => {
    const p = new Float32Array(N * 3);
    const v = new Float32Array(N);
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const beam = i % count;
      const x = (beam - (count - 1) / 2) * 3;
      const y = r() * 5;
      const spread = 0.15 + (5 - y) * 0.16;
      p.set([x + (r() - 0.5) * spread * 2, y, (r() - 0.5) * spread * 2], i * 3);
      v[i] = 0.02 + r() * 0.05;
    }
    return { positions: p, speeds: v };
  }, [count]);
  useFrame((_, dt) => {
    if (reduced || !dust.current) return;
    const pos = dust.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = pos.getY(i) - speeds[i] * dt;
      if (y < 0) y = 5;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(y * 3 + i) * 0.0008);
    }
    pos.needsUpdate = true;
  });
  return (
    <group {...props}>
      {Array.from({ length: count }, (_, b) => (
        <mesh key={b} position={[(b - (count - 1) / 2) * 3, 2.5, 0]} material={beamMat}>
          <coneGeometry args={[1.0, 5, 32, 1, true]} />
        </mesh>
      ))}
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.025} color="#fffbea" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

/** Glowing delivery path from the pharmacy to a home pin, light pulses and a scooter riding it. */
export function DeliveryRoute({ reduced = false, ...props }: { reduced?: boolean } & JSX.IntrinsicElements['group']) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          [-3.2, 0, 0.8],
          [-1.6, 0, -0.6],
          [0, 0, 0.6],
          [1.6, 0, -0.4],
          [3.2, 0, 0.6],
        ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      ),
    [],
  );
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 200, 0.05, 12, false), [curve]);
  const glow = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0d9488', emissive: '#2dd4bf', emissiveIntensity: 1.4, roughness: 0.3 }),
    [],
  );
  const ground = useMemo(() => plastic('#eef6f3', { roughness: 0.8, clearcoat: 0 }), []);
  const pulses = useRef<(THREE.Mesh | null)[]>([]);
  const rider = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const t = reduced ? 0.55 : clock.elapsedTime;
    pulses.current.forEach((m, i) => {
      if (!m) return;
      curve.getPoint((((t * 0.22 + i / 6) % 1) + 1) % 1, m.position);
    });
    if (rider.current) {
      const u = reduced ? 0.55 : (t * 0.06) % 1;
      curve.getPoint(u, tmp);
      curve.getPoint(Math.min(1, u + 0.01), ahead);
      rider.current.position.copy(tmp);
      rider.current.lookAt(ahead);
      rider.current.rotateY(-Math.PI / 2);
    }
  });
  return (
    <group {...props}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} material={ground} receiveShadow>
        <circleGeometry args={[4.4, 64]} />
      </mesh>
      <mesh geometry={tube} material={glow} />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(m) => (pulses.current[i] = m)}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color="#ccfbf1" />
        </mesh>
      ))}
      <group ref={rider} scale={1.2}>
        <Scooter />
      </group>
      <GreenCross glow={1.6} scale={0.22} position={[-3.3, 0.55, 0.8]} />
      <MapPin scale={0.6} position={[3.3, 0.1, 0.6]} />
    </group>
  );
}

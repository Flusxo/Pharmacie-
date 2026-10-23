/**
 * Procedural pharmacy models (no downloaded meshes): amber/pill bottles, tube, blister, sachet, inhaler,
 * insulin pen, split capsules, scored tablets, pharmacy boxes and the green cross sign.
 * Physically based materials: transmissive glass (ior 1.5), liquid with a meniscus, clearcoat plastics,
 * crinkled aluminium foil, matte cardboard. Every edge is bevelled or lathed (no razor-sharp edges).
 */
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  boxNormal,
  boxTexture,
  foilNormal,
  labelTexture,
  marbleTexture,
  paperNormal,
  plasticNormal,
  roughnessNoise,
  type LabelSpec,
} from './textures';

const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

// ---------- materials ----------

export function useGlass(tint: 'amber' | 'clear', quality: 'high' | 'medium') {
  return useMemo(
    () =>
      // Medium: tinted transparent glass, no transmission pass (that pass re-renders the whole scene).
      quality === 'medium'
        ? new THREE.MeshPhysicalMaterial({
            color: tint === 'amber' ? '#b8691c' : '#e8f4ef',
            transparent: true,
            opacity: tint === 'amber' ? 0.72 : 0.32,
            roughness: 0.05,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            envMapIntensity: 1.4,
            depthWrite: false,
          })
        : new THREE.MeshPhysicalMaterial({
            color: '#ffffff',
            transmission: 1,
            thickness: 0.35,
            roughness: tint === 'amber' ? 0.06 : 0.03,
            ior: 1.5,
            attenuationColor: new THREE.Color(tint === 'amber' ? '#a85a12' : '#e8f4ef'),
            attenuationDistance: tint === 'amber' ? 0.45 : 4,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            specularIntensity: 1,
            envMapIntensity: 1.2,
            side: THREE.DoubleSide,
          }),
    [tint, quality],
  );
}

export function plastic(color: string, opts: { clearcoat?: number; roughness?: number; sheen?: number; transmission?: number } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    // Micro-surface detail (procedural maps): highlights break up like real moulded plastic.
    normalMap: plasticNormal(),
    normalScale: new THREE.Vector2(0.12, 0.12),
    roughnessMap: roughnessNoise(),
    roughness: opts.roughness ?? 0.32,
    clearcoat: opts.clearcoat ?? 1,
    clearcoatRoughness: 0.12,
    sheen: opts.sheen ?? 0,
    sheenColor: new THREE.Color('#ffffff'),
    transmission: opts.transmission ?? 0,
    thickness: opts.transmission ? 0.2 : 0,
  });
}

function foil() {
  return new THREE.MeshStandardMaterial({
    color: '#d9dde2',
    metalness: 1,
    roughness: 0.32,
    normalMap: foilNormal(),
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
}

function cardboard(map: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.82,
    metalness: 0,
    normalMap: paperNormal(),
    normalScale: new THREE.Vector2(0.25, 0.25),
  });
}

// ---------- geometry helpers ----------

/** Screw thread on a bottle neck: a thin tube following a helix (seen when the cap is off). */
function Thread({
  radius,
  y0,
  y1,
  turns = 2.2,
  material,
}: {
  radius: number;
  y0: number;
  y1: number;
  turns?: number;
  material: THREE.Material;
}) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, y0 + (y1 - y0) * t, Math.sin(a) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, radius * 0.06, 8, false);
  }, [radius, y0, y1, turns]);
  return <mesh geometry={geo} material={material} />;
}

/** Cylinder with vertical knurls (child-safe cap grip). */
function knurledCap(radius: number, height: number, ridges = 56) {
  const g = new THREE.CylinderGeometry(radius, radius, height, ridges * 2, 1, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < radius * 0.99) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.035 * Math.sign(Math.sin(a * ridges));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Spark burst when a cap is opened (tiny particle system). */
function Burst({ at, color = '#A7F3D0', count = 40 }: { at: THREE.Vector3; color?: string; count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const start = useRef(0);
  const data = useMemo(() => {
    const p = new Float32Array(count * 3);
    const v = Array.from(
      { length: count },
      () => new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.8 + 0.4, (Math.random() - 0.5) * 1.6),
    );
    return { p, v };
  }, [count]);
  useFrame((s) => {
    if (!ref.current) return;
    if (!start.current) start.current = s.clock.elapsedTime;
    const t = s.clock.elapsedTime - start.current;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    data.v.forEach((v, i) => pos.setXYZ(i, at.x + v.x * t, at.y + v.y * t - 2.4 * t * t, at.z + v.z * t));
    pos.needsUpdate = true;
    (ref.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t / 0.9);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.p, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color={color} transparent depthWrite={false} />
    </points>
  );
}

interface CapProps {
  open: number; // 0 closed .. 1 unscrewed
  onCapClick?: (e: ThreeEvent<MouseEvent>) => void;
}

function Cap({ y, radius, height, color, open, onCapClick }: CapProps & { y: number; radius: number; height: number; color: string }) {
  const g = useMemo(() => knurledCap(radius, height), [radius, height]);
  const mat = useMemo(() => plastic(color, { clearcoat: 1, roughness: 0.38 }), [color]);
  return (
    <group position={[0, y + open * 0.32, 0]} rotation={[0, -open * Math.PI * 2.5, open * 0.18]}>
      <mesh
        geometry={g}
        material={mat}
        castShadow
        onClick={onCapClick}
        onPointerOver={() => onCapClick && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <mesh position={[0, height / 2, 0]} material={mat} castShadow>
        <cylinderGeometry args={[radius * 0.96, radius * 0.96, 0.012, 48]} />
      </mesh>
    </group>
  );
}

// ---------- products ----------

export interface ProductProps extends CapProps {
  label: LabelSpec;
  quality: 'high' | 'medium';
  exploded?: number; // blister: 0..1
  burst?: number; // increments to replay the burst
}

/** Amber glass bottle with liquid and a meniscus (syrups, drops). */
export function AmberBottle({ label, quality, open, onCapClick, burst = 0 }: ProductProps) {
  const glass = useGlass('amber', quality);
  const body = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, 0],
          [0.4, 0],
          [0.47, 0.03],
          [0.5, 0.1],
          [0.5, 0.98],
          [0.47, 1.08],
          [0.32, 1.2],
          [0.21, 1.27],
          [0.2, 1.32],
          [0.2, 1.44],
          [0.215, 1.46],
          [0.19, 1.47],
        ]),
        96,
      ),
    [],
  );
  // Liquid: slightly smaller than the glass; the top curves up at the wall (meniscus).
  const liquid = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, 0.04],
          [0.455, 0.05],
          [0.465, 0.12],
          [0.465, 0.8],
          [0.45, 0.83],
          [0.3, 0.815],
          [0.001, 0.81],
        ]),
        96,
      ),
    [],
  );
  const liquidMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#7a3a0a',
        transmission: 0.55,
        thickness: 0.6,
        roughness: 0.08,
        ior: 1.34,
        attenuationColor: new THREE.Color('#5a2405'),
        attenuationDistance: 0.3,
      }),
    [],
  );
  const labelMap = labelTexture({ ...label, kind: 'wrap' });
  const labelMat = useMemo(() => cardboard(labelMap), [labelMap]);
  return (
    <group>
      <mesh geometry={liquid} material={liquidMat} />
      <mesh geometry={body} material={glass} castShadow receiveShadow />
      <Thread radius={0.203} y0={1.335} y1={1.43} material={glass} />
      <mesh position={[0, 0.52, 0]} material={labelMat}>
        <cylinderGeometry args={[0.506, 0.506, 0.56, 64, 1, true, -1.1, 2.2]} />
      </mesh>
      <Cap y={1.55} radius={0.26} height={0.24} color="#FAFAFA" open={open} onCapClick={onCapClick} />
      {burst > 0 && <Burst key={burst} at={new THREE.Vector3(0, 1.7, 0)} />}
    </group>
  );
}

/** Opaque HDPE pill bottle with a child-safe cap (tablets, capsules). */
export function PillBottle({ label, open, onCapClick, burst = 0 }: ProductProps) {
  const body = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, 0],
          [0.44, 0],
          [0.5, 0.05],
          [0.52, 0.14],
          [0.52, 1.12],
          [0.48, 1.18],
          [0.42, 1.2],
          [0.42, 1.3],
          [0.4, 1.31],
        ]),
        96,
      ),
    [],
  );
  const mat = useMemo(() => plastic('#F6F2EA', { clearcoat: 0.3, roughness: 0.45, sheen: 0.3 }), []);
  const labelMap = labelTexture({ ...label, kind: 'wrap' });
  const labelMat = useMemo(() => cardboard(labelMap), [labelMap]);
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <Thread radius={0.424} y0={1.21} y1={1.295} turns={1.6} material={mat} />
      <mesh position={[0, 0.64, 0]} material={labelMat}>
        <cylinderGeometry args={[0.526, 0.526, 0.6, 64, 1, true, -1.15, 2.3]} />
      </mesh>
      <Cap y={1.42} radius={0.48} height={0.26} color={label.color} open={open} onCapClick={onCapClick} />
      {burst > 0 && <Burst key={burst} at={new THREE.Vector3(0, 1.6, 0)} />}
    </group>
  );
}

/** Cream tube with a crimped end. */
export function Tube({ label, open, onCapClick, burst = 0 }: ProductProps) {
  // Same flattening for the body and its label: round near the cap, crimped flat at the far end.
  const flatten = (g: THREE.BufferGeometry) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const f = THREE.MathUtils.smoothstep(y, 0.5, 1.7);
      pos.setZ(i, pos.getZ(i) * (1 - 0.9 * f));
      pos.setX(i, pos.getX(i) * (1 + 0.32 * f));
    }
    g.computeVertexNormals();
    return g;
  };
  const body = useMemo(() => {
    const g = new THREE.LatheGeometry(
      v2([
        [0.12, -0.06],
        [0.2, 0],
        [0.3, 0.12],
        [0.32, 0.4],
        [0.32, 1.5],
        [0.31, 1.62],
        [0.3, 1.7],
      ]),
      96,
    );
    return flatten(g);
  }, []);
  const labelGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.323, 0.323, 0.42, 64, 12, true, -1.1, 2.2);
    g.translate(0, 0.74, 0);
    return flatten(g);
  }, []);
  const map = labelTexture({ ...label, kind: 'wrap' });
  const mat = useMemo(() => plastic('#ffffff', { clearcoat: 0.8, roughness: 0.25 }), []);
  const labelMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    [map],
  );
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <mesh geometry={labelGeo} material={labelMat} />
      <RoundedBox args={[0.84, 0.1, 0.06]} radius={0.02} position={[0, 1.72, 0]} castShadow>
        <meshStandardMaterial color="#d8dde3" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <Cap y={-0.16} radius={0.16} height={0.2} color={label.color} open={-open * 0.6} onCapClick={onCapClick} />
      {burst > 0 && <Burst key={burst} at={new THREE.Vector3(0, -0.4, 0)} />}
    </group>
  );
}

/** Blister: foil backing + clear PVC domes; exploded view lifts the tablets out. */
export function Blister({ label, quality, exploded = 0 }: ProductProps) {
  const pvc = useGlass('clear', quality);
  const foilMat = useMemo(() => foil(), []);
  const tabletMat = useMemo(() => plastic('#FBFBF8', { clearcoat: 0.4, roughness: 0.55, sheen: 0.6 }), []);
  const backMap = labelTexture({ ...label, kind: 'panel' });
  const back = useMemo(() => cardboard(backMap), [backMap]);
  const slots: [number, number][] = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 5; r++) slots.push([c * 0.52 - 0.26, r * 0.36 - 0.72]);
  return (
    <group rotation={[-0.22, 0, 0]} position={[0, 1.3, 0]} scale={0.85}>
      <RoundedBox args={[1.2, 1.95, 0.03]} radius={0.04} material={foilMat} castShadow receiveShadow />
      <mesh position={[0, 0, -0.017]} rotation={[0, Math.PI, 0]} material={back}>
        <planeGeometry args={[1.14, 1.89]} />
      </mesh>
      {slots.map(([x, y], i) => (
        <group key={i} position={[x, y, 0.015]}>
          <mesh scale={[1, 1, 0.55]} material={pvc}>
            <sphereGeometry args={[0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <Tablet material={tabletMat} position={[0, 0, 0.03 + exploded * (0.5 + (i % 3) * 0.12)]} scale={0.8} />
        </group>
      ))}
    </group>
  );
}

/** Powder sachet with a torn (zig-zag) edge. */
export function Sachet({ label }: ProductProps) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const w = 1.1;
    const h = 1.5;
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2 - 0.06);
    const teeth = 14;
    for (let i = 0; i <= teeth; i++) s.lineTo(w / 2 - (i * w) / teeth, h / 2 - (i % 2 ? 0 : 0.06));
    s.lineTo(-w / 2, -h / 2);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 4,
      curveSegments: 8,
    });
    // Map the front face 0..1 so the label fits.
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, (uv.getY(i) + h / 2) / h);
    g.center();
    return g;
  }, []);
  const map = labelTexture({ ...label, kind: 'panel' });
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.4,
      metalness: 0.15,
      clearcoat: 0.6,
      normalMap: foilNormal(),
      normalScale: new THREE.Vector2(0.15, 0.15),
    });
    return m;
  }, [map]);
  return <mesh geometry={geo} material={mat} rotation={[-0.25, 0, 0]} castShadow receiveShadow />;
}

/** Metered-dose inhaler. */
export function Inhaler({ label }: ProductProps) {
  const body = useMemo(() => plastic(label.color, { clearcoat: 1, roughness: 0.28 }), [label.color]);
  const cap = useMemo(() => plastic('#E5E7EB', { clearcoat: 1, roughness: 0.3 }), []);
  return (
    <group>
      <RoundedBox args={[0.62, 1.4, 0.46]} radius={0.16} smoothness={6} material={body} castShadow position={[0, 0.7, 0]} />
      <RoundedBox
        args={[0.56, 0.28, 0.62]}
        radius={0.12}
        smoothness={6}
        material={cap}
        castShadow
        position={[0, 0.08, 0.2]}
        rotation={[0.25, 0, 0]}
      />
      <mesh position={[0, 1.55, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.5, 48]} />
        <meshStandardMaterial color="#cfd5db" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.8, 0.232]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial map={labelTexture({ ...label, kind: 'panel' })} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Insulin pen. */
export function Pen({ label }: ProductProps) {
  const body = useMemo(() => plastic(label.color, { clearcoat: 1, roughness: 0.25 }), [label.color]);
  const grey = useMemo(() => plastic('#E2E8F0', { clearcoat: 1, roughness: 0.3 }), []);
  return (
    <group rotation={[0, 0, Math.PI / 2 - 0.35]}>
      <mesh material={body} castShadow>
        <capsuleGeometry args={[0.16, 1.8, 12, 48]} />
      </mesh>
      <mesh material={grey} position={[0, 1.1, 0]} castShadow>
        <capsuleGeometry args={[0.165, 0.5, 12, 48]} />
      </mesh>
      <mesh position={[0, -1.05, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.18, 48]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.162]} rotation={[0, 0, Math.PI / 2]}>
        <planeGeometry args={[1, 0.22]} />
        <meshStandardMaterial map={labelTexture({ ...label, kind: 'wrap' })} roughness={0.6} />
      </mesh>
    </group>
  );
}

// ---------- small objects ----------

/** Two-tone gel capsule with a visible seam. */
export function Capsule({
  colorA = '#065F46',
  colorB = '#F8FAFC',
  cheap = false,
  split = 0,
  ...props
}: {
  colorA?: string;
  colorB?: string;
  cheap?: boolean;
  /** 0 closed .. 1 halves apart */ split?: number;
} & JSX.IntrinsicElements['group']) {
  // "cheap": no transmission pass (background); otherwise a soft translucent gel shell.
  const a = useMemo(() => plastic(colorA, { clearcoat: 1, roughness: 0.18, sheen: 0.5, transmission: cheap ? 0 : 0.15 }), [colorA, cheap]);
  const b = useMemo(() => plastic(colorB, { clearcoat: 1, roughness: 0.2, sheen: 0.5, transmission: cheap ? 0 : 0.25 }), [colorB, cheap]);
  return (
    <group {...props}>
      <mesh material={a} position={[0, 0.17 + split * 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.24, 12, 32]} />
      </mesh>
      <mesh material={b} position={[0, -0.13 - split * 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.104, 0.2, 12, 32]} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <torusGeometry args={[0.104, 0.006, 8, 48]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Round scored tablet with a soft rounded rim. */
export function Tablet({ material, ...props }: { material?: THREE.Material } & JSX.IntrinsicElements['group']) {
  const geo = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, -0.05],
          [0.12, -0.05],
          [0.14, -0.035],
          [0.15, 0],
          [0.14, 0.035],
          [0.12, 0.05],
          [0.001, 0.05],
        ]),
        48,
      ),
    [],
  );
  const mat = useMemo(() => material ?? plastic('#FDFDFB', { clearcoat: 0.3, roughness: 0.6, sheen: 0.8 }), [material]);
  return (
    <group {...props}>
      <mesh geometry={geo} material={mat} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow />
      <mesh position={[0, 0, 0.051]}>
        <boxGeometry args={[0.24, 0.014, 0.004]} />
        <meshStandardMaterial color="#d4d4d0" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Pharmacy box with a fictional brand. */
export function PharmaBox({
  brand,
  color,
  size = [0.6, 0.85, 0.3],
  ...props
}: { brand: string; color: string; size?: [number, number, number] } & JSX.IntrinsicElements['group']) {
  const map = boxTexture(brand, color);
  const emboss = boxNormal(brand);
  const front = useMemo(() => {
    const m = cardboard(map);
    // Embossed brand name and cross.
    m.normalMap = emboss;
    m.normalScale = new THREE.Vector2(0.6, 0.6);
    return m;
  }, [map, emboss]);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1f5f4', roughness: 0.85 }), []);
  const [w, h, d] = size;
  return (
    <group {...props}>
      <RoundedBox args={size} radius={0.02} smoothness={3} material={side} castShadow receiveShadow />
      <mesh position={[0, 0, d / 2 + 0.001]} material={front}>
        <planeGeometry args={[w - 0.03, h - 0.03]} />
      </mesh>
    </group>
  );
}

/** Glossy green pharmacy cross, softly glowing. */
export function GreenCross({ glow = 1.2, ...props }: { glow?: number } & JSX.IntrinsicElements['group']) {
  const geo = useMemo(() => {
    const a = 0.33;
    const s = new THREE.Shape();
    s.moveTo(-a, -1);
    s.lineTo(a, -1);
    s.lineTo(a, -a);
    s.lineTo(1, -a);
    s.lineTo(1, a);
    s.lineTo(a, a);
    s.lineTo(a, 1);
    s.lineTo(-a, 1);
    s.lineTo(-a, a);
    s.lineTo(-1, a);
    s.lineTo(-1, -a);
    s.lineTo(-a, -a);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 6,
      curveSegments: 6,
    });
    g.center();
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#10B981',
        emissive: new THREE.Color('#10B981'),
        emissiveIntensity: glow,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      }),
    [glow],
  );
  return (
    <group {...props}>
      <mesh geometry={geo} material={mat} castShadow />
    </group>
  );
}

// ---------- dedicated models: carton + blister, nasal spray, dropper bottle (Part G) ----------

/** A label wrapped on a short arc of a cylinder (front of a bottle). */
function ArcLabel({ radius, height, y, map, arc = 2.3 }: { radius: number; height: number; y: number; map: THREE.Texture; arc?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map, roughness: 0.55, side: THREE.FrontSide }), [map]);
  return (
    <mesh position={[0, y, 0]} material={mat}>
      {/* theta 0 is +z: the arc is centred on the front */}
      <cylinderGeometry args={[radius + 0.004, radius + 0.004, height, 64, 1, true, -arc / 2, arc]} />
    </mesh>
  );
}

/** Carton box with the label on its front; `exploded` (or `open`) slides the blister out of the side. */
export function CartonBlister({ label, quality, exploded = 0, open = 0 }: ProductProps) {
  const slide = Math.max(exploded, open);
  const map = labelTexture({ ...label, kind: 'carton' });
  const front = useMemo(() => {
    const m = cardboard(map);
    return m;
  }, [map]);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1f5f4', roughness: 0.85 }), []);
  const size: [number, number, number] = [1.28, 0.8, 0.34];
  return (
    <group position={[0, size[1] / 2, 0]} rotation={[0, 0.32, 0]}>
      <RoundedBox args={size} radius={0.02} smoothness={3} material={side} castShadow receiveShadow />
      <mesh position={[0, 0, size[2] / 2 + 0.001]} material={front}>
        <planeGeometry args={[size[0] - 0.03, size[1] - 0.03]} />
      </mesh>
      <mesh position={[0, 0, -size[2] / 2 - 0.001]} rotation={[0, Math.PI, 0]} material={front}>
        <planeGeometry args={[size[0] - 0.03, size[1] - 0.03]} />
      </mesh>
      {/* the blister: hidden inside the carton at 0, out beside it at 1 */}
      {slide > 0.02 && (
        <group position={[0.35 + slide * 0.9, 0, 0.05]} rotation={[0, 0, Math.PI / 2]} scale={0.5}>
          <group position={[0, -1.3, 0]} rotation={[0.22, 0, 0]}>
            <Blister label={label} quality={quality} exploded={0} open={0} />
          </group>
        </group>
      )}
    </group>
  );
}

/** Nasal spray: bottle, pump collar, nozzle and a transparent cap that lifts off with `open`. */
export function NasalSpray({ label, open }: ProductProps) {
  const body = useMemo(() => plastic('#F8FAFC', { clearcoat: 1, roughness: 0.22 }), []);
  const accent = useMemo(() => plastic(label.color, { clearcoat: 1, roughness: 0.3 }), [label.color]);
  const capGlass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#bfe3f2',
        transparent: true,
        opacity: 0.45,
        roughness: 0.08,
        clearcoat: 1,
        depthWrite: false,
      }),
    [],
  );
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfd5db', metalness: 0.9, roughness: 0.25 }), []);
  const bottle = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, 0],
          [0.27, 0],
          [0.31, 0.04],
          [0.32, 0.12],
          [0.32, 0.86],
          [0.3, 0.98],
          [0.2, 1.08],
          [0.15, 1.12],
          [0.15, 1.2],
          [0.001, 1.2],
        ]),
        64,
      ),
    [],
  );
  const map = labelTexture({ ...label, kind: 'wrap' });
  return (
    <group>
      <mesh geometry={bottle} material={body} castShadow />
      <ArcLabel radius={0.32} height={0.6} y={0.5} map={map} arc={2.9} />
      {/* pump collar and actuator */}
      <mesh position={[0, 1.24, 0]} material={accent} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.1, 48]} />
      </mesh>
      <mesh position={[0, 1.38, 0]} material={metal} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.2, 32]} />
      </mesh>
      <mesh position={[0, 1.5, 0]} material={accent} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.1, 32]} />
      </mesh>
      <mesh position={[0, 1.58, 0]} material={metal} castShadow>
        <cylinderGeometry args={[0.03, 0.045, 0.1, 24]} />
      </mesh>
      {/* the cap: a clear shell over the nozzle */}
      <group position={[0, 1.18 + open * 0.8, 0]} rotation={[0, 0, open * 0.22]}>
        <mesh material={capGlass} position={[0, 0.3, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.34, 8, 32]} />
        </mesh>
      </group>
    </group>
  );
}

/** Dropper bottle: amber glass, black bulb and collar; `open` lifts the dropper out so the pipette shows. */
export function DropperBottle({ label, quality, open }: ProductProps) {
  const glass = useGlass('amber', quality);
  const rubber = useMemo(() => plastic('#1f2937', { clearcoat: 0.5, roughness: 0.5 }), []);
  const collar = useMemo(() => plastic('#111827', { clearcoat: 1, roughness: 0.3 }), []);
  const pipette = useGlass('clear', quality);
  const bottle = useMemo(
    () =>
      new THREE.LatheGeometry(
        v2([
          [0.001, 0],
          [0.32, 0],
          [0.37, 0.04],
          [0.38, 0.12],
          [0.38, 0.78],
          [0.34, 0.9],
          [0.2, 0.98],
          [0.16, 1.03],
          [0.16, 1.1],
          [0.14, 1.1],
          [0.14, 1.0],
          [0.001, 0.9],
        ]),
        64,
      ),
    [],
  );
  const map = labelTexture({ ...label, kind: 'wrap' });
  return (
    <group>
      <mesh geometry={bottle} material={glass} castShadow />
      <ArcLabel radius={0.38} height={0.5} y={0.45} map={map} arc={2.9} />
      <group position={[0, open * 1.0, 0]}>
        <mesh position={[0, 1.18, 0]} material={collar} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.18, 48]} />
        </mesh>
        <mesh position={[0, 1.5, 0]} scale={[1, 1.7, 1]} material={rubber} castShadow>
          <sphereGeometry args={[0.15, 32, 24]} />
        </mesh>
        {open > 0.05 && (
          <mesh position={[0, 0.55, 0]} material={pipette}>
            <cylinderGeometry args={[0.045, 0.03, 1.1, 24]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Picks the model for a medicine form. */
export type ProductKind = 'amber' | 'dropper' | 'tube' | 'blister' | 'sachet' | 'spray' | 'inhaler' | 'pen' | 'carton' | 'pillbottle';

/** Which 3D model shows a medicine form (every form has its own; unknown forms get the pill bottle). */
export function productKindFor(form: string): ProductKind {
  switch (form) {
    case 'syrup':
      return 'amber';
    case 'drops':
      return 'dropper';
    case 'cream':
      return 'tube';
    case 'lozenge':
      return 'blister';
    case 'sachet':
      return 'sachet';
    case 'spray':
      return 'spray';
    case 'inhaler':
      return 'inhaler';
    case 'pen':
      return 'pen';
    case 'tablet':
      return 'carton';
    default:
      return 'pillbottle';
  }
}

export function ProductModel(props: ProductProps & { form: string }): ReactNode {
  switch (productKindFor(props.form)) {
    case 'amber':
      return <AmberBottle {...props} />;
    case 'dropper':
      return <DropperBottle {...props} />;
    case 'tube':
      return <Tube {...props} />;
    case 'blister':
      return <Blister {...props} />;
    case 'sachet':
      return <Sachet {...props} />;
    case 'spray':
      return <NasalSpray {...props} />;
    case 'inhaler':
      return <Inhaler {...props} />;
    case 'pen':
      return <Pen {...props} />;
    case 'carton':
      return <CartonBlister {...props} />;
    default:
      return <PillBottle {...props} />;
  }
}

/** Which forms have a cap that can be unscrewed / an exploded view. */
export const hasCap = (form: string) => ['syrup', 'drops', 'spray', 'tablet', 'capsule', 'cream'].includes(form);
export const hasExploded = (form: string) => ['lozenge', 'tablet'].includes(form);

// ---------- scene props for the public pages (add-on Part C) ----------

type GroupProps = JSX.IntrinsicElements['group'];

/** Smartphone showing a small map with pins. */
export function Phone(props: GroupProps) {
  const body = useMemo(() => plastic('#0b2530', { roughness: 0.22 }), []);
  const glass = useMemo(() => plastic('#e7f6f3', { roughness: 0.15, clearcoat: 1 }), []);
  return (
    <group {...props}>
      <RoundedBox args={[0.78, 1.5, 0.09]} radius={0.1} smoothness={5} material={body} castShadow />
      <mesh position={[0, 0, 0.047]} material={glass}>
        <planeGeometry args={[0.68, 1.36]} />
      </mesh>
      {[0.32, 0.05, -0.28].map((y, i) => (
        <mesh key={y} position={[0, y, 0.05]}>
          <planeGeometry args={[0.68, 0.04]} />
          <meshStandardMaterial color={i === 1 ? '#a7f3d0' : '#cde5e1'} roughness={0.6} />
        </mesh>
      ))}
      <MapPin scale={0.32} position={[-0.12, 0.22, 0.12]} />
      <MapPin scale={0.32} position={[0.16, -0.12, 0.12]} />
      <MapPin scale={0.26} position={[-0.06, -0.42, 0.12]} color="#94a3b8" />
    </group>
  );
}

/** Map pin (green = in stock). */
export function MapPin({ color = '#10b981', ...props }: { color?: string } & GroupProps) {
  const m = useMemo(() => plastic(color, { roughness: 0.2 }), [color]);
  return (
    <group {...props}>
      <mesh material={m} position={[0, 0.28, 0]} castShadow>
        <sphereGeometry args={[0.24, 32, 32]} />
      </mesh>
      <mesh material={m} position={[0, -0.02, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[0.2, 0.42, 32]} />
      </mesh>
      <mesh position={[0, 0.3, 0.2]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Clipboard with a prescription-like sheet and ticked lines. */
export function Clipboard(props: GroupProps) {
  const board = useMemo(() => plastic('#0b6b5d', { roughness: 0.35 }), []);
  const clip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.25 }), []);
  return (
    <group {...props}>
      <RoundedBox args={[1.0, 1.36, 0.05]} radius={0.05} smoothness={4} material={board} castShadow />
      <mesh position={[0, -0.05, 0.03]}>
        <planeGeometry args={[0.84, 1.12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </mesh>
      <RoundedBox args={[0.42, 0.14, 0.08]} radius={0.03} smoothness={3} material={clip} position={[0, 0.66, 0.04]} />
      {[0.32, 0.1, -0.12, -0.34].map((y, i) => (
        <group key={y} position={[0, y, 0.035]}>
          <mesh position={[-0.3, 0, 0]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshStandardMaterial color={i < 2 ? '#10b981' : '#e2f2ef'} />
          </mesh>
          <mesh position={[0.06, 0, 0]}>
            <planeGeometry args={[0.5, 0.04]} />
            <meshStandardMaterial color="#cde5e1" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Stethoscope: tubing as a smooth curve, chest piece and ear tips. */
export function Stethoscope(props: GroupProps) {
  const tube = useMemo(() => {
    const pts: [number, number, number][] = [
      [-0.35, 0.7, 0],
      [-0.42, 0.25, 0.05],
      [-0.2, -0.25, 0.1],
      [0.15, -0.45, 0.05],
      [0.45, -0.2, 0],
      [0.5, 0.25, -0.05],
      [0.3, 0.7, -0.05],
    ];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.TubeGeometry(curve, 96, 0.035, 16, false);
  }, []);
  const rubber = useMemo(() => plastic('#0b2530', { roughness: 0.45, clearcoat: 0.4 }), []);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d7dee3', metalness: 1, roughness: 0.18 }), []);
  return (
    <group {...props}>
      <mesh geometry={tube} material={rubber} castShadow />
      <mesh material={metal} position={[0.15, -0.6, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.08, 48]} />
      </mesh>
      <mesh material={metal} position={[0.15, -0.5, 0.05]}>
        <cylinderGeometry args={[0.03, 0.03, 0.14, 16]} />
      </mesh>
      <mesh material={metal} position={[-0.35, 0.74, 0]}>
        <sphereGeometry args={[0.06, 24, 24]} />
      </mesh>
      <mesh material={metal} position={[0.3, 0.74, -0.05]}>
        <sphereGeometry args={[0.06, 24, 24]} />
      </mesh>
    </group>
  );
}

/** Envelope with a folded flap. */
export function Envelope(props: GroupProps) {
  const paper = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6, sheen: 0.6, clearcoat: 0.2 }), []);
  const flapGeo = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.75, 0);
    sh.lineTo(0.75, 0);
    sh.lineTo(0, -0.55);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  }, []);
  return (
    <group {...props}>
      <RoundedBox args={[1.5, 1.0, 0.05]} radius={0.04} smoothness={4} material={paper} castShadow />
      <mesh geometry={flapGeo} material={paper} position={[0, 0.5, 0.03]} />
      <mesh position={[0, 0.5, 0.045]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.04, 0.04]} />
        <meshStandardMaterial color="#0d9488" />
      </mesh>
    </group>
  );
}

const SHELF_ROWS: [string, string][][] = [
  [
    ['Calmora', '#065F46'],
    ['Rhinova', '#7C3AED'],
    ['Gastrel', '#B45309'],
    ['Vitalis', '#C2410C'],
  ],
  [
    ['Dermalis', '#BE185D'],
    ['Pulmo', '#4338CA'],
    ['Glucora', '#0F766E'],
    ['Cardia', '#B91C1C'],
  ],
];

/** Pharmacy shelf with boxes of fictional brands. */
export function Shelf(props: GroupProps) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7 }), []);
  return (
    <group {...props}>
      {[-0.05, 0.95, -1.05].map((y) => (
        <RoundedBox key={y} args={[3.0, 0.08, 0.6]} radius={0.02} smoothness={2} material={wood} position={[0, y, 0]} receiveShadow />
      ))}
      <RoundedBox args={[3.1, 2.3, 0.06]} radius={0.02} smoothness={2} material={wood} position={[0, -0.05, -0.32]} />
      {SHELF_ROWS.map((row, r) =>
        row.map(([brand, color], i) => (
          <PharmaBox
            key={brand}
            brand={brand}
            color={color}
            size={[0.5, 0.78, 0.3]}
            position={[-1.08 + i * 0.72, r === 0 ? 0.39 : -0.61, 0.05]}
            rotation={[0, (i - 1.5) * 0.06, 0]}
          />
        )),
      )}
    </group>
  );
}

/** Soft abstract shape (About page, calm pages). */
export function Blob({
  kind = 'sphere',
  color = '#5eead4',
  ...props
}: { kind?: 'sphere' | 'torus' | 'pill'; color?: string } & GroupProps) {
  const m = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        sheen: 0.8,
        sheenColor: new THREE.Color('#ffffff'),
      }),
    [color],
  );
  return (
    <group {...props}>
      <mesh material={m} castShadow>
        {kind === 'torus' ? (
          <torusGeometry args={[0.5, 0.2, 48, 96]} />
        ) : kind === 'pill' ? (
          <capsuleGeometry args={[0.28, 0.6, 24, 48]} />
        ) : (
          <sphereGeometry args={[0.5, 64, 64]} />
        )}
      </mesh>
    </group>
  );
}

/** Paper delivery bag with a green cross. */
export function DeliveryBag(props: GroupProps) {
  const paper = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8d2a6', roughness: 0.85 }), []);
  return (
    <group {...props}>
      <RoundedBox args={[0.8, 0.9, 0.45]} radius={0.04} smoothness={3} material={paper} castShadow />
      <mesh material={paper} position={[0, 0.5, 0]}>
        <torusGeometry args={[0.18, 0.025, 12, 32, Math.PI]} />
      </mesh>
      <GreenCross glow={0.5} scale={0.12} position={[0, 0.05, 0.25]} />
    </group>
  );
}

/**
 * Friendly stylised person (no face details): white coat, round head, arms; a pharmacist (green cross
 * badge) or a doctor (stethoscope around the neck). Used for the "people" renders.
 */
export function Figure({
  role = 'pharmacist',
  skin = '#e8b796',
  hair = '#3b2a20',
  ...props
}: { role?: 'pharmacist' | 'doctor'; skin?: string; hair?: string } & GroupProps) {
  const coat = useMemo(() => plastic('#ffffff', { roughness: 0.55, clearcoat: 0.2, sheen: 0.6 }), []);
  const shirt = useMemo(() => plastic(role === 'doctor' ? '#0ea5e9' : '#0d9488', { roughness: 0.6, clearcoat: 0 }), [role]);
  const skinM = useMemo(() => plastic(skin, { roughness: 0.55, clearcoat: 0.1, sheen: 0.4 }), [skin]);
  const hairM = useMemo(() => plastic(hair, { roughness: 0.7, clearcoat: 0 }), [hair]);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d7dee3', metalness: 1, roughness: 0.2 }), []);
  const rubber = useMemo(() => plastic('#0b2530', { roughness: 0.45 }), []);
  return (
    <group {...props}>
      {/* body and coat */}
      <mesh material={coat} position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.42, 0.75, 16, 48]} />
      </mesh>
      <mesh material={shirt} position={[0, 1.02, 0.31]} rotation={[0.25, 0, 0]}>
        <coneGeometry args={[0.16, 0.34, 3]} />
      </mesh>
      {/* arms */}
      <mesh material={coat} position={[-0.5, 0.62, 0.05]} rotation={[0, 0, 0.18]} castShadow>
        <capsuleGeometry args={[0.13, 0.62, 12, 32]} />
      </mesh>
      <mesh material={coat} position={[0.5, 0.62, 0.05]} rotation={[0, 0, -0.18]} castShadow>
        <capsuleGeometry args={[0.13, 0.62, 12, 32]} />
      </mesh>
      <mesh material={skinM} position={[-0.56, 0.18, 0.06]}>
        <sphereGeometry args={[0.12, 24, 24]} />
      </mesh>
      <mesh material={skinM} position={[0.56, 0.18, 0.06]}>
        <sphereGeometry args={[0.12, 24, 24]} />
      </mesh>
      {/* neck, head, hair */}
      <mesh material={skinM} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.11, 0.12, 0.16, 24]} />
      </mesh>
      <mesh material={skinM} position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.32, 48, 48]} />
      </mesh>
      <mesh material={hairM} position={[0, 1.62, -0.04]} scale={[1.02, 0.75, 1.02]}>
        <sphereGeometry args={[0.32, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {role === 'pharmacist' ? (
        <GreenCross glow={0.6} scale={0.06} position={[0.2, 0.86, 0.42]} />
      ) : (
        <group position={[0, 1.02, 0.18]}>
          <mesh material={rubber}>
            <torusGeometry args={[0.24, 0.022, 12, 48, Math.PI]} />
          </mesh>
          <mesh material={metal} position={[0.2, -0.36, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.04, 32]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Delivery scooter with an insulated bag (simulated delivery). */
export function Scooter() {
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

/** Marble pharmacy counter. */
export function Counter() {
  const marble = marbleTexture();
  const top = useMemo(
    () => new THREE.MeshPhysicalMaterial({ map: marble, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    [marble],
  );
  const front = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9efe9', roughness: 0.55 }), []);
  return (
    <group>
      <RoundedBox args={[4.6, 0.08, 1.4]} radius={0.03} smoothness={4} position={[0, 0.4, 0]} material={top} receiveShadow castShadow />
      <RoundedBox args={[4.5, 1.2, 1.3]} radius={0.04} position={[0, -0.24, 0.02]} material={front} receiveShadow />
    </group>
  );
}

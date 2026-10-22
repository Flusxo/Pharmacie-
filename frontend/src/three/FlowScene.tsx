/**
 * "How it works" in 3D: a phone (patient), the counter. hub and a small pharmacy, linked by glowing
 * tubes; small 3D objects (magnifier, map pin, request card, green answer, payment card, delivery bag)
 * travel along the links as the page scrolls. Orthographic camera fitted to the same 600 × 280 layout
 * as the SVG diagram, so the HTML labels sit exactly under the nodes. Everything is updated in
 * useFrame from the scroll progress ref: no React re-render while scrolling.
 */
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useI18n } from '../i18n';
import { Scene3D } from './Scene3D';
import { Capsule, GreenCross, plastic } from './models';
import { CURVES, NODES, flowState, type Link, type Traveller } from '../lib/flow';

const W = (p: readonly [number, number], z = 0) => new THREE.Vector3((p[0] - 300) / 100, (140 - p[1]) / 100, z);
const BASE: Record<'PC' | 'CH' | 'HP', THREE.QuadraticBezierCurve3> = {
  PC: new THREE.QuadraticBezierCurve3(W(CURVES.PC.from, -0.2), W(CURVES.PC.ctrl, -0.2), W(CURVES.PC.to, -0.2)),
  CH: new THREE.QuadraticBezierCurve3(W(CURVES.CH.from, -0.2), W(CURVES.CH.ctrl, -0.2), W(CURVES.CH.to, -0.2)),
  HP: new THREE.QuadraticBezierCurve3(W(CURVES.HP.from, -0.2), W(CURVES.HP.ctrl, -0.2), W(CURVES.HP.to, -0.2)),
};
const baseOf = (l: Link) => (l === 'CP' ? 'PC' : l === 'HC' ? 'CH' : l) as 'PC' | 'CH' | 'HP';
const rev = (l: Link) => l === 'CP' || l === 'HC';
const at = (l: Link, t: number, out: THREE.Vector3) => BASE[baseOf(l)].getPoint(rev(l) ? 1 - t : t, out).setZ(0.35);

function Phone() {
  const body = useMemo(() => plastic('#0b2530', { roughness: 0.25 }), []);
  return (
    <group rotation={[0.12, -0.45, 0]}>
      <RoundedBox args={[0.38, 0.66, 0.06]} radius={0.05} smoothness={4} material={body} />
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[0.32, 0.58]} />
        <meshStandardMaterial color="#d9f5f1" emissive="#5eead4" emissiveIntensity={0.25} roughness={0.4} />
      </mesh>
      {[
        [-0.06, 0.1, '#10b981'],
        [0.07, -0.04, '#10b981'],
        [-0.02, -0.15, '#94a3b8'],
      ].map(([x, y, c], i) => (
        <mesh key={i} position={[x as number, y as number, 0.05]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshStandardMaterial color={c as string} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Hub() {
  const disc = useMemo(() => plastic('#ffffff', { roughness: 0.2 }), []);
  return (
    <group>
      <mesh material={disc} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.14, 64]} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[0.37, 0.025, 16, 64]} />
        <meshStandardMaterial color="#0d9488" roughness={0.3} metalness={0.2} />
      </mesh>
      <GreenCross glow={0.8} scale={0.15} position={[0, 0, 0.1]} />
    </group>
  );
}

function Shop() {
  const wall = useMemo(() => plastic('#ffffff', { roughness: 0.45, clearcoat: 0.3 }), []);
  const roof = useMemo(() => plastic('#0b6b5d', { roughness: 0.3 }), []);
  return (
    <group rotation={[0.1, 0.45, 0]}>
      <RoundedBox args={[0.6, 0.4, 0.36]} radius={0.03} smoothness={3} material={wall} position={[0, -0.06, 0]} />
      <RoundedBox args={[0.68, 0.08, 0.42]} radius={0.02} smoothness={3} material={roof} position={[0, 0.18, 0]} />
      <mesh position={[0, -0.13, 0.181]}>
        <planeGeometry args={[0.14, 0.24]} />
        <meshStandardMaterial color="#123c45" roughness={0.6} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, -0.04, 0.181]}>
          <planeGeometry args={[0.14, 0.12]} />
          <meshStandardMaterial color="#bfeee6" emissive="#5eead4" emissiveIntensity={0.2} />
        </mesh>
      ))}
      <GreenCross glow={1.1} scale={0.07} position={[0, 0.34, 0.05]} />
    </group>
  );
}

/** The six travelling objects, built once; useFrame shows the ones on the way. */
function TravellerModel({ kind }: { kind: Traveller }) {
  const teal = useMemo(() => plastic('#0d9488'), []);
  const white = useMemo(() => plastic('#ffffff', { roughness: 0.3 }), []);
  const green = useMemo(() => plastic('#10b981', { roughness: 0.2 }), []);
  const blue = useMemo(() => plastic('#0ea5e9', { roughness: 0.25 }), []);
  const bag = useMemo(() => plastic('#f8c56a', { roughness: 0.5, clearcoat: 0.2 }), []);
  switch (kind) {
    case 'search':
      return (
        <group rotation={[0, 0, -0.6]}>
          <mesh material={teal}>
            <torusGeometry args={[0.08, 0.022, 16, 32]} />
          </mesh>
          <mesh material={teal} position={[0, -0.13, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.1, 12]} />
          </mesh>
        </group>
      );
    case 'results':
      return (
        <group>
          <mesh material={green} position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.08, 24, 24]} />
          </mesh>
          <mesh material={green} position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.07, 0.12, 24]} />
          </mesh>
        </group>
      );
    case 'request':
      return (
        <group rotation={[0.2, -0.3, 0.1]}>
          <RoundedBox args={[0.3, 0.22, 0.03]} radius={0.02} smoothness={3} material={white} />
          <mesh position={[0, 0.07, 0.017]}>
            <planeGeometry args={[0.26, 0.04]} />
            <meshStandardMaterial color="#0b6b5d" />
          </mesh>
          <Capsule colorA="#0d9488" scale={0.35} rotation={[0, 0, 1.2]} position={[0, -0.02, 0.05]} cheap />
        </group>
      );
    case 'answer':
      return (
        <group>
          <mesh material={green}>
            <sphereGeometry args={[0.1, 32, 32]} />
          </mesh>
          <GreenCross glow={0.3} scale={0.045} position={[0, 0, 0.1]} />
        </group>
      );
    case 'payment':
      return (
        <group rotation={[0.25, -0.4, 0.15]}>
          <RoundedBox args={[0.32, 0.2, 0.02]} radius={0.02} smoothness={3} material={blue} />
          <mesh position={[0, 0.04, 0.012]}>
            <planeGeometry args={[0.32, 0.04]} />
            <meshStandardMaterial color="#0b2530" />
          </mesh>
          <mesh position={[-0.09, -0.04, 0.012]}>
            <planeGeometry args={[0.06, 0.045]} />
            <meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      );
    default:
      return (
        <group rotation={[0.15, -0.4, 0]}>
          <RoundedBox args={[0.24, 0.2, 0.16]} radius={0.03} smoothness={3} material={bag} />
          <mesh material={bag} position={[0, 0.13, 0]}>
            <torusGeometry args={[0.06, 0.014, 12, 24, Math.PI]} />
          </mesh>
          <GreenCross glow={0.6} scale={0.04} position={[0, 0, 0.09]} />
        </group>
      );
  }
}

const KINDS: Traveller[] = ['search', 'results', 'request', 'answer', 'payment', 'delivery'];
const DOTS = 6;
const SEG = 24;

function Flow({ progress, reduced }: { progress: MutableRefObject<number>; reduced: boolean }) {
  const travellers = useRef<Record<string, THREE.Group | null>>({});
  const links = useRef<Record<string, THREE.Mesh | null>>({});
  const dots = useRef<Record<string, (THREE.Mesh | null)[]>>({ PC: [], CH: [], HP: [] });
  const nodes = useRef<Record<string, THREE.Group | null>>({});
  const ring = useRef<(THREE.Mesh | null)[]>([]);
  const box = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tubes = useMemo(
    () => Object.fromEntries((['PC', 'CH', 'HP'] as const).map((k) => [k, new THREE.TubeGeometry(BASE[k], 64, 0.022, 10, false)])),
    [],
  );

  useFrame((state) => {
    const s = flowState(reduced ? Math.floor(progress.current) + 0.99 : progress.current);
    const time = state.clock.elapsedTime;
    for (const k of KINDS) {
      const g = travellers.current[k];
      if (!g) continue;
      const o = s.objects.find((x) => x.kind === k);
      g.visible = !!o;
      if (o) {
        at(o.link, o.t, g.position);
        g.position.y += Math.sin(time * 3) * 0.02;
        g.rotation.y = reduced ? 0 : Math.sin(time * 1.5) * 0.4;
      }
    }
    for (const k of ['PC', 'CH', 'HP'] as const) {
      const act = s.active.find((l) => baseOf(l) === k);
      const m = links.current[k];
      if (m) (m.material as THREE.MeshStandardMaterial).opacity = act ? 0.9 : 0.28;
      dots.current[k].forEach((d, i) => {
        if (!d) return;
        d.visible = !!act && !reduced;
        if (!act) return;
        const tt = ((time * 0.35 + i / DOTS) % 1) as number;
        at(act, tt, tmp);
        d.position.copy(tmp).setZ(-0.15);
      });
    }
    const involved = new Set(s.active.flatMap((l) => [l[0], l[1]]));
    for (const [k, g] of Object.entries(nodes.current)) {
      if (!g) continue;
      const target = involved.has(k) ? 1.38 : 1.25;
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, 0.1));
      g.position.y = W(NODES[k as 'P' | 'C' | 'H']).y + (reduced ? 0 : Math.sin(time * 1.2 + k.charCodeAt(0)) * 0.03);
    }
    const left = Math.round(SEG * (s.countdown > 0 ? 1 - s.countdown : 0));
    ring.current.forEach((r, i) => r && (r.visible = s.countdown > 0 && i < left));
    if (box.current) {
      box.current.visible = s.box > 0.01;
      box.current.scale.setScalar(Math.max(0.001, s.box));
      box.current.rotation.y = time * 0.6;
    }
  });

  const H = W(NODES.H);
  return (
    <group>
      {(['PC', 'CH', 'HP'] as const).map((k) => (
        <group key={k}>
          <mesh ref={(m) => (links.current[k] = m)} geometry={tubes[k]}>
            <meshStandardMaterial
              color={k === 'HP' ? '#f59e0b' : '#0d9488'}
              transparent
              opacity={0.28}
              roughness={0.3}
              emissive="#0d9488"
              emissiveIntensity={0.15}
            />
          </mesh>
          {Array.from({ length: DOTS }, (_, i) => (
            <mesh key={i} ref={(m) => (dots.current[k][i] = m)} visible={false}>
              <sphereGeometry args={[0.035, 12, 12]} />
              <meshStandardMaterial color="#5eead4" emissive="#5eead4" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      ))}
      <group ref={(g) => (nodes.current.P = g)} position={W(NODES.P)}>
        <Phone />
      </group>
      <group ref={(g) => (nodes.current.C = g)} position={W(NODES.C)}>
        <Hub />
      </group>
      <group ref={(g) => (nodes.current.H = g)} position={W(NODES.H)}>
        <Shop />
      </group>
      {Array.from({ length: SEG }, (_, i) => {
        const a = Math.PI / 2 - (i / SEG) * Math.PI * 2;
        return (
          <mesh
            key={i}
            ref={(m) => (ring.current[i] = m)}
            position={[H.x + Math.cos(a) * 0.6, H.y + Math.sin(a) * 0.6, 0.3]}
            rotation={[0, 0, a]}
            visible={false}
          >
            <boxGeometry args={[0.05, 0.12, 0.04]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
          </mesh>
        );
      })}
      <group ref={box} position={[H.x + 0.62, H.y + 0.46, 0.4]} visible={false}>
        <RoundedBox args={[0.22, 0.18, 0.18]} radius={0.015} smoothness={3}>
          <meshStandardMaterial color="#d9b98a" roughness={0.85} />
        </RoundedBox>
        <mesh position={[0, 0, 0.091]}>
          <planeGeometry args={[0.04, 0.18]} />
          <meshStandardMaterial color="#b98d55" roughness={0.9} />
        </mesh>
      </group>
      {KINDS.map((k) => (
        <group key={k} ref={(g) => (travellers.current[k] = g)} visible={false} scale={1.8}>
          <TravellerModel kind={k} />
        </group>
      ))}
    </group>
  );
}

export default function FlowScene({
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
      reduced={false}
      label={t('pub.how.diagramLabel')}
      className="flow-canvas"
      ortho={{ width: 6, height: 2.8 }}
      camera={{ position: [0, 0, 10] }}
      exposure={1.05}
      alwaysRender
      onSlow={onSlow}
      onReady={onReady}
    >
      <Flow progress={progress} reduced={reduced} />
    </Scene3D>
  );
}

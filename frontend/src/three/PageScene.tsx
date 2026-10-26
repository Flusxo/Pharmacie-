/**
 * The public site's 3D layer (add-on Part C): ONE canvas fixed behind the pages, kept alive across
 * navigation; each page brings its own composition (compositions.ts) and the previous one shrinks away.
 * - scroll: the camera travels down, items spin / drift, capsule halves come apart
 * - pointer and phone tilt: gentle parallax (camera easing)
 * - portrait phones: the hero cluster is recentred at the top and scaled down
 * Reduced motion: one still frame (Scene3D). Light enough for 60 fps: no transmission except the hero
 * bottle on High, DPR ≤ 1.5 on Medium, no shadows on Medium.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Scene3D } from './Scene3D';
import {
  AmberBottle,
  Blister,
  Blob,
  Capsule,
  Clipboard,
  Counter,
  DeliveryBag,
  Envelope,
  Figure,
  Inhaler,
  Tube,
  GreenCross,
  MapPin,
  PharmaBox,
  Pen,
  Phone,
  PillBottle,
  ProductModel,
  Scooter,
  Shelf,
  Stethoscope,
  Tablet,
} from './models';
import { setMaterialDetail } from './models';
import { storyState } from './story';
import { DeliveryRoute, PharmacyInterior, SoftLight, StageLabels } from './environment';
import { useI18n } from '../i18n';
import { COMPOSITIONS, type CompositionName, type FieldInstance, type Item } from './compositions';

export interface Inputs {
  /** page scroll 0..1 */
  scroll: number;
  /** pointer or tilt, -1..1 */
  x: number;
  y: number;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function Model({
  it: item,
  split,
  quality,
  reduced = false,
}: {
  it: Item;
  split: number;
  quality: 'high' | 'medium';
  reduced?: boolean;
}) {
  // Many labels on screen: 2048 px each (the 4096 px ones are for the single hero object of the product viewer).
  const it: Item = item.label ? { ...item, label: { ...item.label, res: 2048 } } : item;
  // Medium: plain standard materials (a handful of shader programs instead of dozens: see models.tsx).
  setMaterialDetail(quality === 'high' ? 'full' : 'lite');
  switch (it.kind) {
    case 'product':
      return <ProductModel form={it.form ?? 'tablet'} label={it.label!} quality={quality} open={it.open ?? 0} exploded={it.open ?? 0} />;
    case 'capsule':
      return <Capsule colorA={it.colors?.[0]} colorB={it.colors?.[1]} split={split} cheap={quality !== 'high'} />;
    case 'tablet':
      return <Tablet />;
    case 'cross':
      return <GreenCross glow={0.9} />;
    case 'amber':
      return <AmberBottle label={it.label!} quality={quality} open={0} />;
    case 'pillbottle':
      return <PillBottle label={it.label!} quality={quality} open={0} />;
    case 'blister':
      return <Blister label={it.label!} quality={quality} open={0} />;
    case 'pen':
      return <Pen label={{ name: 'Glucora', dosage: '100 U/ml', color: '#0F766E', light: '#99F6E4' }} quality={quality} open={0} />;
    case 'box':
      return <PharmaBox brand={it.brand ?? 'counter.'} color={it.color ?? '#065F46'} />;
    case 'phone':
      return <Phone />;
    case 'pin':
      return <MapPin color={it.color} />;
    case 'clipboard':
      return <Clipboard />;
    case 'stethoscope':
      return <Stethoscope />;
    case 'envelope':
      return <Envelope />;
    case 'shelf':
      return <Shelf />;
    case 'bag':
      return <DeliveryBag />;
    case 'tube':
      return <Tube label={it.label!} quality={quality} open={0} />;
    case 'inhaler':
      return <Inhaler label={it.label!} quality={quality} open={0} />;
    case 'counter':
      return <Counter />;
    case 'scooter':
      return <Scooter />;
    case 'interior':
      return <PharmacyInterior />;
    case 'route':
      return <DeliveryRoute reduced={reduced} />;
    case 'figure-pharmacist':
      return <Figure role="pharmacist" />;
    case 'figure-doctor':
      return <Figure role="doctor" skin="#c98e6a" hair="#1f1a17" />;
    default:
      return <Blob kind={it.blob} color={it.color} />;
  }
}

// Reused every frame: no allocation while the page scrolls.
const tmpObj = new THREE.Object3D();
const tmpMat = new THREE.Matrix4();
const OFF_A = new THREE.Matrix4().makeTranslation(0, 0.17, 0);
const OFF_B = new THREE.Matrix4().makeTranslation(0, -0.13, 0);

/**
 * Decorative capsules and tablets of a page, drawn with instancing: ONE draw call for the coloured halves, one for
 * the white halves and one for the tablets, whatever their number. Same motion as a single item: drift and spin with
 * the scroll, a slow float, and the phone layout (side items come closer, smaller).
 */
function FieldView({
  instances,
  heroX,
  portrait,
  inputs,
  reduced,
}: {
  instances: FieldInstance[];
  heroX: number;
  portrait: boolean;
  inputs: MutableRefObject<Inputs>;
  reduced: boolean;
}) {
  const caps = useMemo(() => instances.filter((i) => i.kind === 'capsule'), [instances]);
  const tabs = useMemo(() => instances.filter((i) => i.kind === 'tablet'), [instances]);
  const partA = useRef<THREE.InstancedMesh>(null);
  const partB = useRef<THREE.InstancedMesh>(null);
  const tab = useRef<THREE.InstancedMesh>(null);
  const geoA = useMemo(() => new THREE.CapsuleGeometry(0.1, 0.24, 8, 20), []);
  const geoB = useMemo(() => new THREE.CapsuleGeometry(0.104, 0.2, 8, 20), []);
  const geoT = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.001, -0.05],
          [0.12, -0.05],
          [0.14, -0.035],
          [0.15, 0],
          [0.14, 0.035],
          [0.12, 0.05],
          [0.001, 0.05],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        24,
      ),
    [],
  );
  const matA = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0 }), []);
  const matB = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.26, metalness: 0 }), []);
  const matT = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fdfdfb', roughness: 0.5, metalness: 0 }), []);
  // the colour of each coloured half is set once
  useEffect(() => {
    const m = partA.current;
    if (!m) return;
    const c = new THREE.Color();
    caps.forEach((cap, i) => m.setColorAt(i, c.set(cap.colors[0])));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [caps]);
  const place = (i: FieldInstance, p: number, t: number, k: number) => {
    let [x, y, z] = i.pos;
    let sc = i.scale;
    if (portrait) {
      if (y > -3) {
        x = (x - heroX) * 0.42;
        y = y * 0.62 + 1.3;
      } else {
        x = Math.sign(x) * 1.5;
        z -= 0.5;
      }
      sc *= 0.62;
    }
    tmpObj.position.set(x, y + i.drift * p + (reduced ? 0 : Math.sin(t * i.float * 0.8 + k) * 0.08), z);
    tmpObj.rotation.set(i.rot[0], i.rot[1] + i.spin * p, i.rot[2]);
    tmpObj.scale.setScalar(sc);
    tmpObj.updateMatrix();
  };
  useFrame((state) => {
    const p = reduced ? 0 : inputs.current.scroll;
    const t = state.clock.elapsedTime;
    caps.forEach((c, k) => {
      place(c, p, t, k);
      partA.current?.setMatrixAt(k, tmpMat.multiplyMatrices(tmpObj.matrix, OFF_A));
      partB.current?.setMatrixAt(k, tmpMat.multiplyMatrices(tmpObj.matrix, OFF_B));
    });
    tabs.forEach((c, k) => {
      place(c, p, t, k + 50);
      tab.current?.setMatrixAt(k, tmpObj.matrix);
    });
    for (const m of [partA.current, partB.current, tab.current]) if (m) m.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      {caps.length > 0 && (
        <>
          <instancedMesh ref={partA} args={[geoA, matA, caps.length]} frustumCulled={false} />
          <instancedMesh ref={partB} args={[geoB, matB, caps.length]} frustumCulled={false} />
        </>
      )}
      {tabs.length > 0 && <instancedMesh ref={tab} args={[geoT, matT, tabs.length]} frustumCulled={false} />}
    </>
  );
}

/** One item: base pose + scroll-driven spin / drift / split, gentle float. */
function ItemView({
  it,
  inputs,
  portrait,
  heroX,
  travel,
  reduced,
  quality,
}: {
  it: Item;
  inputs: MutableRefObject<Inputs>;
  portrait: boolean;
  heroX: number;
  travel: [number, number, number];
  reduced: boolean;
  quality: 'high' | 'medium';
}) {
  const ref = useRef<THREE.Group>(null);
  const [split, setSplit] = useState(0);
  const hero = it.pos[1] > -3;
  const { size } = useThree();
  // Portrait phones: the hero cluster moves to the top centre, side items come closer.
  const base = useMemo<[number, number, number]>(() => {
    const [x, y, z] = it.pos;
    if (it.screen) {
      // By screen position: x is a fraction of the half width, y the pixels from the top (the camera sees 5.675 units at z = 0).
      const ppu = size.height / 5.675;
      return [(x * size.width) / 2 / ppu, (size.height / 2 - y) / ppu, z];
    }
    if (!portrait) return [x, y, z];
    // A story object sits at the top centre of a phone (the text cards pass below it).
    if (it.story !== undefined) return [(x - 3.0) * 0.4, y * 0.5 + 1.5, z];
    // Set pieces (room, route) stay centred behind everything.
    if (it.kind === 'interior' || it.kind === 'route') return [x * 0.3, y, z];
    return hero ? [(x - heroX) * 0.42, y * 0.62 + 1.3, z] : [Math.sign(x) * 1.5, y, z - 0.5];
  }, [it.pos, it.screen, size.width, size.height, portrait, hero, heroX]);
  const scale = (it.scale ?? 1) * (portrait && !it.screen ? 0.62 : 1);
  const presence = useRef(0);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const p = reduced ? 0 : inputs.current.scroll;
    if (it.story !== undefined) {
      // Scroll story: this object is tied to one step. It flies in and turns while its step is read, then flies out.
      const want = storyState.active === it.story ? 1 : 0;
      presence.current += (want - presence.current) * Math.min(1, dt * (reduced ? 40 : 4.5));
      const k = presence.current;
      g.visible = k > 0.01;
      if (!g.visible) return;
      const e = 1 - (1 - k) * (1 - k);
      const away = 1 - k;
      // It follows the camera down the page, so it stays beside the text being read.
      g.position.set(base[0] + away * 2.6, base[1] + travel[1] * p - away * 1.2, base[2] + away * 1.6);
      const r = it.rot ?? [0, 0, 0];
      g.rotation.set(r[0], r[1] + away * 2.6 + (reduced ? 0 : state.clock.elapsedTime * 0.35), r[2]);
      g.scale.setScalar(Math.max(0.0001, scale * e));
      if (it.split) {
        // halves come apart while it flies in and close as it settles
        const sp = 1 - Math.round(smooth(0.1, 0.95, k) * 40) / 40;
        if (sp !== split) setSplit(sp);
      }
      return;
    }
    g.position.set(base[0], base[1] + (it.drift ?? 0) * p, base[2]);
    const r = it.rot ?? [0, 0, 0];
    g.rotation.set(r[0], r[1] + (it.spin ?? 0) * p, r[2]);
    if (it.split) {
      const s = Math.round(smooth(0.04, 0.3, p) * 40) / 40;
      if (s !== split) setSplit(s);
    }
  });
  return (
    <group ref={ref} scale={scale}>
      <Float speed={reduced ? 0 : (it.float ?? 0)} rotationIntensity={0.25} floatIntensity={0.35}>
        <Model it={it} split={split} quality={quality} reduced={reduced} />
      </Float>
    </group>
  );
}

/** A composition fading in (or shrinking away when the page changes). */
function Layer({
  name,
  leaving,
  onGone,
  ...rest
}: {
  name: CompositionName;
  leaving: boolean;
  onGone: () => void;
  inputs: MutableRefObject<Inputs>;
  portrait: boolean;
  reduced: boolean;
  quality: 'high' | 'medium';
}) {
  const ref = useRef<THREE.Group>(null);
  const comp = COMPOSITIONS[name];
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const target = leaving ? 0 : 1;
    const s = rest.reduced ? target : THREE.MathUtils.lerp(g.scale.x, target, leaving ? 0.14 : 0.08);
    g.scale.setScalar(Math.max(0.0001, s));
    if (leaving && s < 0.02) onGone();
  });
  return (
    <group ref={ref} scale={rest.reduced ? 1 : 0.0001}>
      {(rest.portrait && comp.portrait ? comp.portrait : comp.items).map((it, i) =>
        it.kind === 'field' ? (
          <FieldView
            key={i}
            instances={it.field ?? []}
            heroX={comp.heroX}
            portrait={rest.portrait}
            inputs={rest.inputs}
            reduced={rest.reduced}
          />
        ) : (
          <ItemView key={i} it={it} heroX={comp.heroX} travel={comp.travel} {...rest} />
        ),
      )}
    </group>
  );
}

/** Camera: travels with the scroll, eases toward the pointer / tilt. */
function Rig({ name, inputs, reduced }: { name: CompositionName; inputs: MutableRefObject<Inputs>; reduced: boolean }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = COMPOSITIONS[name].travel;
    const { scroll, x, y } = inputs.current;
    const p = reduced ? 0 : scroll;
    target.set(t[0] * p + (reduced ? 0 : x * 0.45), 0.3 + t[1] * p + (reduced ? 0 : y * 0.3), 9 + t[2] * p);
    camera.position.lerp(target, reduced ? 1 : 0.06);
    look.set(t[0] * p, t[1] * p, 0);
    camera.lookAt(look);
  });
  return null;
}

function Stage({
  name,
  inputs,
  reduced,
  dark,
  quality,
}: {
  name: CompositionName;
  inputs: MutableRefObject<Inputs>;
  reduced: boolean;
  dark: boolean;
  quality: 'high' | 'medium';
}) {
  const { size } = useThree();
  const portrait = size.width / size.height < 0.85;
  const [layers, setLayers] = useState<{ name: CompositionName; leaving: boolean; id: number }[]>([{ name, leaving: false, id: 0 }]);
  useEffect(() => {
    setLayers((ls) => {
      if (ls.some((l) => !l.leaving && l.name === name)) return ls;
      const id = Math.max(...ls.map((l) => l.id)) + 1;
      return [...ls.map((l) => ({ ...l, leaving: true })), { name, leaving: false, id }];
    });
  }, [name]);
  const fog = dark ? '#0b2a31' : '#eef9f8';
  return (
    <>
      <fog attach="fog" args={[fog, 10, 24]} />
      <ambientLight intensity={dark ? 0.4 : 0.55} />
      <Rig name={name} inputs={inputs} reduced={reduced} />
      <SoftLight target={COMPOSITIONS[name].light ?? 0} reduced={reduced} />
      {layers.map((l) => (
        <Layer
          key={l.id}
          name={l.name}
          leaving={l.leaving}
          onGone={() => setLayers((ls) => ls.filter((x) => x.id !== l.id))}
          inputs={inputs}
          portrait={portrait}
          reduced={reduced}
          quality={quality}
        />
      ))}
    </>
  );
}

export default function PageScene({
  name,
  tier,
  fourK = false,
  reduced,
  dark,
  paused = false,
  onFps,
  onReady,
}: {
  name: CompositionName;
  tier: 'high' | 'medium';
  /** "High (4K)": pixel ratio up to 2 */
  fourK?: boolean;
  reduced: boolean;
  dark: boolean;
  paused?: boolean;
  onFps?: (fps: number) => void;
  onReady?: () => void;
}) {
  const { t } = useI18n();
  const labels = useMemo(() => ({ simulated: t('order.simulated') }), [t]);
  const inputs = useRef<Inputs>({ scroll: 0, x: 0, y: 0 });
  useEffect(() => {
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      inputs.current.scroll = Math.min(1, window.scrollY / max);
    };
    const onPointer = (e: PointerEvent) => {
      inputs.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      inputs.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    // Phone tilt where the browser gives it without a permission prompt (Android); iOS keeps pointer/scroll only.
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      inputs.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      inputs.current.y = Math.max(-1, Math.min(1, (45 - e.beta) / 30));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, []);
  return (
    <Scene3D
      // High: bloom on real highlights only, soft vignette and grain (no depth of field: the fog gives depth;
      // no ambient occlusion over a whole viewport). The governor steps down to Medium if it gets slow.
      tier={tier}
      ao={false}
      adaptive
      // Behind glass panels and fog: 0.8× resolution on Medium is invisible and saves a third of the pixels.
      dprRange={
        tier === 'high'
          ? [1, fourK ? 2 : 1.5]
          : [0.6, typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 0.8 : 1]
      }
      bloom={{ threshold: 0.97, intensity: 0.25 }}
      reduced={reduced}
      label=""
      className="page-bg-canvas"
      camera={{ position: [0, 0.3, 9], fov: 35 }}
      exposure={dark ? 0.95 : 1.05}
      environmentIntensity={dark ? 0.75 : 1}
      onFps={onFps}
      onReady={onReady}
      paused={paused}
      alwaysRender
    >
      <StageLabels.Provider value={labels}>
        <Stage name={name} inputs={inputs} reduced={reduced} dark={dark} quality={tier} />
      </StageLabels.Provider>
    </Scene3D>
  );
}

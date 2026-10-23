/**
 * Product viewer (Medicine Details). Model chosen by form, centred and large; drag to rotate with damping,
 * pinch / scroll zoom within limits, slow auto-rotate + gentle float until the user touches it,
 * double-click resets the view. Click the cap to unscrew it (small particle burst); exploded view for blisters.
 * Studio lighting on a soft cyclorama tinted by the category colour.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ContactShadows, Float, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Scene3D } from './Scene3D';
import { ProductModel } from './models';

export interface ProductSceneProps {
  tier: 'high' | 'medium';
  reduced: boolean;
  form: string;
  name: string;
  dosage: string;
  cip: string;
  color: string;
  light: string;
  exploded: boolean;
  resetSignal: number;
  onInteract: () => void;
  onSlow?: () => void;
  onReady?: () => void;
}

/** Curved backdrop (cyclorama) tinted by the category colour. */
function Cyclorama({ tint }: { tint: string }) {
  const geo = useMemo(() => {
    const shape: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2);
      shape.push(new THREE.Vector2(6 - Math.cos(a) * 1.5, Math.sin(a) * 1.5));
    }
    shape.push(new THREE.Vector2(4.5, 8));
    const g = new THREE.LatheGeometry(shape, 64, Math.PI * 0.75, Math.PI * 0.5);
    return g;
  }, []);
  const color = useMemo(() => new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.82), [tint]);
  return (
    <group position={[0, -0.02, 0]}>
      <mesh geometry={geo} rotation={[0, 0, 0]} position={[0, 0, -0.2]} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.95} side={THREE.BackSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Animates 0 -> 1 (or back) in about 0.6 s. */
function useTween(target: number, reduced: boolean) {
  const v = useRef(target);
  const [, force] = useState(0);
  useFrame((_, dt) => {
    if (reduced) {
      if (v.current !== target) {
        v.current = target;
        force((n) => n + 1);
      }
      return;
    }
    const next = THREE.MathUtils.damp(v.current, target, 8, dt);
    if (Math.abs(next - v.current) > 0.0005) {
      v.current = next;
      force((n) => n + 1);
    }
  });
  return v.current;
}

function Viewer(p: ProductSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(0);
  const [burst, setBurst] = useState(0);
  const openT = useTween(open, p.reduced);
  const explodedT = useTween(p.exploded ? 1 : 0, p.reduced);

  // Remember the framed view once mounted, and go back to it on double-click / "Reset view" only.
  useEffect(() => {
    controls.current?.saveState();
  }, []);
  useEffect(() => {
    if (p.resetSignal === 0) return;
    controls.current?.reset();
    setTouched(false);
  }, [p.resetSignal]);

  const height = ['pen', 'sachet'].includes(p.form) ? 0.45 : p.form === 'lozenge' || p.exploded ? 0.3 : 0.75;
  return (
    <>
      <Cyclorama tint={p.color} />
      <Float speed={p.reduced || touched ? 0 : 1.4} rotationIntensity={0.1} floatIntensity={0.25} floatingRange={[0, 0.06]}>
        <group position={[0, height, 0]} scale={['pen', 'inhaler'].includes(p.form) ? 0.9 : 1}>
          <group position={[0, -0.75, 0]}>
            <ProductModel
              form={p.form}
              label={{ name: p.name, dosage: p.dosage, color: p.color, light: p.light, cip: p.cip, res: p.tier === 'high' ? 4096 : 2048 }}
              quality={p.tier}
              open={openT}
              burst={burst}
              exploded={explodedT}
              onCapClick={(e) => {
                e.stopPropagation();
                setOpen((o) => (o ? 0 : 1));
                setBurst((b) => b + 1);
                setTouched(true);
                p.onInteract();
              }}
            />
          </group>
        </group>
      </Float>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={4} blur={2.4} far={2} resolution={512} />
      <OrbitControls
        ref={controls}
        target={[0, 0.75, 0]}
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={2.2}
        maxDistance={6}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate={!p.reduced && !touched}
        autoRotateSpeed={0.8}
        onStart={() => {
          if (!touched) {
            setTouched(true);
            p.onInteract();
          }
        }}
      />
    </>
  );
}

export default function ProductScene(p: ProductSceneProps) {
  return (
    <Scene3D
      tier={p.tier}
      reduced={p.reduced}
      label={`${p.name} ${p.dosage}`}
      className="product-canvas"
      camera={{ position: [0, 1.45, 3.6], fov: 34 }}
      onSlow={p.onSlow}
      onReady={p.onReady}
    >
      <Viewer {...p} />
    </Scene3D>
  );
}

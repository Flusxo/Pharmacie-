/**
 * Lazy 3D slots used by the pages. The three.js code lives in separate chunks (src/three/*) loaded only
 * when a slot actually renders 3D, so first paint never waits for it. Each slot shows a static poster /
 * gradient / SVG pack image first and swaps to the live canvas when the first frame is ready.
 * Fallbacks (no WebGL, Low/Off quality, low memory, slow frame rate in Auto, a WebGL error) never throw.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { useCanvasSlot, useGraphics } from '../../lib/graphics';
import { useSettings } from '../../lib/settings';
import { PackImage, colorsFor } from '../PackImage';

const BackgroundScene = lazy(() => import('../../three/BackgroundScene'));
const HeroScene = lazy(() => import('../../three/HeroScene'));
const ProductScene = lazy(() => import('../../three/ProductScene'));

/** Canvas labels use the app font: mount scenes only once it is loaded (never blocks the page). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => typeof document === 'undefined' || !document.fonts);
  useEffect(() => {
    if (ok) return;
    let alive = true;
    const done = () => alive && setOk(true);
    Promise.all([document.fonts.load("800 64px 'Inter Variable'"), document.fonts.load("700 64px 'Inter Variable'")]).then(done, done);
    const t = setTimeout(done, 3000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ok]);
  return ok;
}

/** Any error inside a 3D scene (lost context, unsupported feature) shows the fallback instead. */
class ThreeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Full-page background behind every page; static gradient when 3D is off or unavailable. */
export function SiteBackground() {
  const g = useGraphics();
  const { resolvedTheme } = useSettings();
  const slot = useCanvasSlot('background', 0);
  const fonts = useFontsReady();
  const draw = slot && fonts;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className={`site-bg ${ready && draw ? 'ready' : ''}`} aria-hidden="true" data-testid="site-bg" data-mode={draw ? '3d' : 'static'}>
      {draw && (
        <ThreeBoundary fallback={null}>
          <Suspense fallback={null}>
            <BackgroundScene
              tier={g.tier === 'high' ? 'high' : 'medium'}
              reduced={g.reduced}
              dark={resolvedTheme === 'dark'}
              paused={g.backdropPaused}
              onSlow={g.reportSlow}
              onReady={onReady}
            />
          </Suspense>
        </ThreeBoundary>
      )}
    </div>
  );
}

/** Static hero poster (also the fallback). */
export function HeroPoster() {
  return (
    <div className="hero-poster" aria-hidden="true">
      <div className="hero-poster-shelf" />
      <div className="hero-poster-items">
        <PackImage name="Apaisa" dosage="150 ml" form="syrup" category="pain" />
        <PackImage name="Calmora" dosage="500 mg" form="tablet" category="pain" />
        <PackImage name="Dermalis" dosage="1 %" form="cream" category="skin" />
      </div>
    </div>
  );
}

export function HeroVisual({ progress }: { progress: MutableRefObject<number> }) {
  const g = useGraphics();
  const { lang } = useI18n();
  const fonts = useFontsReady();
  const draw = useCanvasSlot('hero', 2) && fonts;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const ref = useRef<HTMLDivElement>(null);
  const { setBackdropPaused } = g;
  // While the full-screen hero is on screen, the site background does not need to draw.
  useEffect(() => {
    const el = ref.current;
    if (!el || !draw || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBackdropPaused(e.isIntersecting));
    io.observe(el);
    return () => {
      io.disconnect();
      setBackdropPaused(false);
    };
  }, [draw, setBackdropPaused]);
  return (
    <div ref={ref} className={`hero-visual ${ready && draw ? 'ready' : ''}`} data-testid="hero-visual" data-mode={draw ? '3d' : 'static'}>
      <HeroPoster />
      {draw && (
        <ThreeBoundary fallback={null}>
          <Suspense fallback={null}>
            <HeroScene
              key={lang /* labels are drawn in the UI language */}
              tier={g.tier === 'high' ? 'high' : 'medium'}
              reduced={g.reduced}
              progress={progress}
              onSlow={g.reportSlow}
              onReady={onReady}
            />
          </Suspense>
        </ThreeBoundary>
      )}
    </div>
  );
}

interface ProductVisualProps {
  name: string;
  dosage: string;
  form: string;
  category: string;
  cip13: string;
  imageUrl: string | null;
  requiresPrescription?: boolean;
}

/** Medicine Details media: 3D product viewer with a "3D / Photo" toggle and a text alternative. */
export function ProductVisual(m: ProductVisualProps) {
  const { t, lang } = useI18n();
  const g = useGraphics();
  const fonts = useFontsReady();
  const can3D = useCanvasSlot('product', 2) && fonts;
  const [mode, setMode] = useState<'3d' | 'photo'>('3d');
  const [ready, setReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [reset, setReset] = useState(0);
  const onReady = useCallback(() => setReady(true), []);
  const [dark, light] = colorsFor(m.category);
  const show3D = can3D && mode === '3d';
  const photo = (
    <PackImage name={m.name} dosage={m.dosage} form={m.form} category={m.category} imageUrl={m.imageUrl} rx={m.requiresPrescription} />
  );
  const explodable = ['lozenge', 'tablet'].includes(m.form);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div
        className={`media-box product-visual ${show3D && ready ? 'ready' : ''}`}
        data-testid="product-visual"
        data-mode={show3D ? '3d' : 'photo'}
        onDoubleClick={() => setReset((r) => r + 1)}
      >
        <div className="product-photo">{photo}</div>
        {show3D && (
          <ThreeBoundary fallback={null}>
            <Suspense fallback={null}>
              <ProductScene
                key={lang /* labels are drawn in the UI language */}
                tier={g.tier === 'high' ? 'high' : 'medium'}
                reduced={g.reduced}
                form={m.form}
                name={m.name}
                dosage={m.dosage}
                cip={m.cip13}
                color={dark}
                light={light}
                exploded={exploded}
                resetSignal={reset}
                onInteract={() => setInteracted(true)}
                onSlow={g.reportSlow}
                onReady={onReady}
              />
            </Suspense>
          </ThreeBoundary>
        )}
        {show3D && ready && !interacted && !g.reduced && (
          <span className="hint-360" aria-hidden="true">
            360°
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {can3D && (
          <div className="tabs" role="tablist" aria-label={t('med.viewMode')} style={{ flex: '0 0 auto' }}>
            <button type="button" role="tab" aria-selected={mode === '3d'} onClick={() => setMode('3d')} data-testid="toggle-3d">
              {t('med.view3d')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'photo'} onClick={() => setMode('photo')} data-testid="toggle-photo">
              {t('med.photo')}
            </button>
          </div>
        )}
        {show3D && explodable && (
          <button type="button" className="btn ghost small" aria-pressed={exploded} onClick={() => setExploded((e) => !e)}>
            {t('med.exploded')}
          </button>
        )}
        {show3D && (
          <button type="button" className="btn ghost small" onClick={() => setReset((r) => r + 1)}>
            {t('med.resetView')}
          </button>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {show3D ? t('med.viewerHelp') : t('med.altText', { name: m.name, dosage: m.dosage })}
      </p>
    </div>
  );
}

const DeliveryScene = lazy(() => import('../../three/ExtraScenes').then((m) => ({ default: m.DeliveryScene })));
const ShelfScene = lazy(() => import('../../three/ExtraScenes').then((m) => ({ default: m.ShelfScene })));
const CheckScene = lazy(() => import('../../three/ExtraScenes').then((m) => ({ default: m.CheckScene })));
const CapsuleScene = lazy(() => import('../../three/ExtraScenes').then((m) => ({ default: m.CapsuleScene })));

/** Simulated delivery in 3D. Returns null when 3D is not available (the 2D map is used instead). */
export function DeliveryVisual({ progress, delivered }: { progress: number; delivered: boolean }) {
  const g = useGraphics();
  const fonts = useFontsReady();
  const draw = useCanvasSlot('delivery', 2) && fonts;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  if (!draw) return null;
  return (
    <div className={`scene-box delivery-visual ${ready ? 'ready' : ''}`} data-testid="delivery-visual">
      <ThreeBoundary fallback={null}>
        <Suspense fallback={null}>
          <DeliveryScene
            tier={g.tier === 'high' ? 'high' : 'medium'}
            reduced={g.reduced}
            progress={progress}
            delivered={delivered}
            mobile={g.mobile}
            onSlow={g.reportSlow}
            onReady={onReady}
          />
        </Suspense>
      </ThreeBoundary>
    </div>
  );
}

export function useCan3D(id: string, priority: number): boolean {
  const fonts = useFontsReady();
  return useCanvasSlot(id, priority) && fonts;
}

/** Pharmacy stock as a 3D shelf (height = quantity, red when low). */
export function ShelfVisual({ items }: { items: { id: string; name: string; quantity: number; low: boolean }[] }) {
  const g = useGraphics();
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className={`scene-box shelf-visual ${ready ? 'ready' : ''}`} data-testid="shelf-visual">
      <ThreeBoundary fallback={null}>
        <Suspense fallback={null}>
          <ShelfScene
            tier={g.tier === 'high' ? 'high' : 'medium'}
            reduced={g.reduced}
            items={items}
            onSlow={g.reportSlow}
            onReady={onReady}
          />
        </Suspense>
      </ThreeBoundary>
    </div>
  );
}

/** "Request sent": 3D check that draws itself with a mint burst; animated SVG check otherwise. */
export function SuccessCheck() {
  const g = useGraphics();
  const draw = useCan3D('check', 3);
  const svg = (
    <svg className="check-svg" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="34" fill="var(--ok-bg)" />
      <path d="M22 37 l9 9 l19 -20" fill="none" stroke="var(--ok)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (!draw) return svg;
  return (
    <div className="check-box" data-testid="success-check">
      <ThreeBoundary fallback={svg}>
        <Suspense fallback={svg}>
          <CheckScene tier={g.tier === 'high' ? 'high' : 'medium'} reduced={g.reduced} />
        </Suspense>
      </ThreeBoundary>
    </div>
  );
}

/** Spinning 3D capsule (404 page); a CSS capsule when 3D is off. */
export function CapsuleVisual() {
  const g = useGraphics();
  const draw = useCan3D('capsule', 1);
  const css = <span className="css-capsule" aria-hidden="true" />;
  if (!draw) return css;
  return (
    <div className="capsule-box" data-testid="capsule-visual">
      <ThreeBoundary fallback={css}>
        <Suspense fallback={css}>
          <CapsuleScene tier={g.tier === 'high' ? 'high' : 'medium'} reduced={g.reduced} />
        </Suspense>
      </ThreeBoundary>
    </div>
  );
}

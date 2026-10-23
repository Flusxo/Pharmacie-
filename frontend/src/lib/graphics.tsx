/**
 * Graphics quality for the 3D layer (kept outside the lazy 3D chunk, it is tiny).
 *
 * Tiers:   high   = post-processing, soft shadows, HDR, DPR up to 2
 *          medium = no post-processing, contact shadows, DPR up to 1.5
 *          low    = no WebGL canvas: static gradient / SVG pack images
 *          off    = same as low, chosen by the user
 * "auto" picks a tier from WebGL2 support, device memory and CPU cores; at runtime a TierGovernor
 * (lib/tierGovernor.ts) moves it with hysteresis from the root canvas's frame rate: down only after a
 * sustained low rate, up only after a long stable period, at most once a minute, never because of a
 * hidden tab. An explicit choice in Settings is never overridden.
 * Reduced motion (OS or the "Reduce animations" switch) keeps 3D but renders a single still frame.
 * On mobile only one heavy canvas renders at a time (the most important one that is mounted).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion, useSettings, type GraphicsPref } from './settings';
import { TierGovernor, type AutoTier } from './tierGovernor';

export type Tier = 'high' | 'medium' | 'low' | 'off';

export interface DeviceInfo {
  webgl2: boolean;
  webgl: boolean;
  memoryGb: number | undefined;
  cores: number | undefined;
  mobile: boolean;
  /** Software rasteriser (SwiftShader, llvmpipe...): no real GPU. */
  softwareGl?: boolean;
  /** Integrated or mobile GPU (Intel UHD/Iris, Mali, Adreno, PowerVR): shares memory with the CPU. */
  integratedGpu?: boolean;
}

export function probeDevice(): DeviceInfo {
  let webgl = false;
  let webgl2 = false;
  let softwareGl = false;
  let integratedGpu = false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') as WebGLRenderingContext | null) ?? c.getContext('webgl');
    webgl2 = !!c.getContext('webgl2');
    webgl = !!gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    softwareGl = /swiftshader|llvmpipe|software|softpipe/i.test(renderer);
    integratedGpu = /intel|uhd|iris|mali|adreno|powervr|videocore|microsoft basic/i.test(renderer);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px), (pointer: coarse)').matches;
  return { webgl, webgl2, memoryGb: nav.deviceMemory, cores: nav.hardwareConcurrency, mobile, softwareGl, integratedGpu };
}

/** Pure decision, unit-tested. */
export function chooseTier(pref: GraphicsPref, d: DeviceInfo): Tier {
  if (!d.webgl) return 'off';
  if (pref === 'off') return 'off';
  if (pref === 'low') return 'low';
  if (pref === 'high' || pref === 'medium') return pref;
  if (d.memoryGb !== undefined && d.memoryGb <= 2) return 'low';
  if (d.softwareGl) return 'low';
  if (!d.webgl2) return 'low';
  // Every device starts on the safe tier. Only a strong desktop GPU may climb to High, after a long stable run.
  return 'medium';
}

/** The best tier the automatic mode may reach on this device. */
export function ceilingTier(d: DeviceInfo): 'high' | 'medium' {
  const weak = d.mobile || d.integratedGpu || (d.memoryGb !== undefined && d.memoryGb < 8) || (d.cores !== undefined && d.cores < 6);
  return weak ? 'medium' : 'high';
}

interface GraphicsCtx {
  tier: Tier;
  /** true when a WebGL canvas may be drawn at all */
  canRender3D: boolean;
  reduced: boolean;
  mobile: boolean;
  auto: boolean;
  /** One frame-rate sample per second from the root canvas (only acts in "auto"). */
  reportFps: (fps: number) => void;
  /** Kept for the inline canvases: they no longer change the tier (only the root canvas samples). */
  reportSlow: () => void;
  /** Mobile canvas lock: returns true when this canvas may render now. */
  claim: (id: string, priority: number) => () => void;
  activeId: string | null;
  /** A full-screen scene (home hero) is visible: the site background stops drawing. */
  backdropPaused: boolean;
  setBackdropPaused: (v: boolean) => void;
}

const Ctx = createContext<GraphicsCtx | null>(null);

export function GraphicsProvider({ children, device }: { children: ReactNode; device?: DeviceInfo }) {
  const { graphics } = useSettings();
  const reduced = useReducedMotion();
  const [info] = useState<DeviceInfo>(() => device ?? probeDevice());
  const base = chooseTier(graphics, info);
  // Auto: the governor starts at the device's tier and moves it with hysteresis.
  const governor = useRef<TierGovernor | null>(null);
  const [autoTier, setAutoTier] = useState<AutoTier | null>(null);
  const claims = useRef(new Map<string, number>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [backdropPaused, setBackdropPaused] = useState(false);

  useEffect(() => {
    governor.current =
      graphics === 'auto' && (base === 'high' || base === 'medium')
        ? new TierGovernor(base, base === 'medium' ? ceilingTier(info) : base)
        : null;
    setAutoTier(null);
  }, [graphics, base, info]);
  // Time spent hidden never counts as slow (or fast).
  useEffect(() => {
    const onVis = () => governor.current?.pause();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const tier: Tier = graphics === 'auto' && autoTier ? autoTier : base;

  const reportFps = useCallback((fps: number) => {
    const g = governor.current;
    if (!g || document.visibilityState !== 'visible') return;
    const before = g.tier;
    const after = g.sample(fps, performance.now());
    if (after !== before) setAutoTier(after);
  }, []);
  const reportSlow = useCallback(() => {}, []);

  const recompute = useCallback(() => {
    let best: string | null = null;
    let bestP = -Infinity;
    for (const [id, p] of claims.current) if (p > bestP) [best, bestP] = [id, p];
    setActiveId(best);
  }, []);
  const claim = useCallback(
    (id: string, priority: number) => {
      claims.current.set(id, priority);
      recompute();
      return () => {
        claims.current.delete(id);
        recompute();
      };
    },
    [recompute],
  );

  const value = useMemo<GraphicsCtx>(
    () => ({
      tier,
      canRender3D: tier === 'high' || tier === 'medium',
      reduced,
      mobile: info.mobile,
      auto: graphics === 'auto',
      reportFps,
      reportSlow,
      claim,
      activeId,
      backdropPaused,
      setBackdropPaused,
    }),
    [tier, reduced, info.mobile, graphics, reportFps, reportSlow, claim, activeId, backdropPaused],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGraphics(): GraphicsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGraphics must be used inside GraphicsProvider');
  return c;
}

/**
 * Whether a given canvas should draw now: 3D allowed, and on mobile only the highest-priority mounted
 * canvas (e.g. the product viewer beats the site background).
 */
export function useCanvasSlot(id: string, priority: number): boolean {
  const g = useGraphics();
  const { claim } = g;
  useEffect(() => (g.canRender3D ? claim(id, priority) : undefined), [g.canRender3D, claim, id, priority]);
  if (!g.canRender3D) return false;
  return !g.mobile || g.activeId === id;
}

/** Render loop: nothing off-screen or paused, ONE still frame with reduced motion, otherwise continuous. */
export function frameloopFor(o: { visible: boolean; paused: boolean; reduced: boolean }): 'never' | 'demand' | 'always' {
  if (!o.visible || o.paused) return 'never';
  return o.reduced ? 'demand' : 'always';
}

/**
 * Sticky stage of the "How it works" page: the patient ↔ counter. ↔ pharmacy diagram with animated
 * arrows, objects travelling along the links, the 30-minute countdown, the box being prepared and the
 * status tracker. Drawn in SVG (always works); when 3D can run, a lazy 3D scene with the same layout
 * replaces the SVG drawings and the labels stay in HTML/SVG on top.
 */
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { useI18n, type MessageKey } from '../../i18n';
import { useGraphics } from '../../lib/graphics';
import { CURVES, NODES, TRACKER, flowState, pointOn, type FlowState, type Link, type Traveller } from '../../lib/flow';
import { ThreeBoundary, useCan3D } from '../three/ThreeVisuals';

const FlowScene = lazy(() => import('../../three/FlowScene'));

const pathOf = (k: 'PC' | 'CH' | 'HP') => {
  const { from, ctrl, to } = CURVES[k];
  return `M${from[0]} ${from[1]} Q${ctrl[0]} ${ctrl[1]} ${to[0]} ${to[1]}`;
};
const baseOf = (l: Link) => (l === 'CP' ? 'PC' : l === 'HC' ? 'CH' : l) as 'PC' | 'CH' | 'HP';
const reversed = (l: Link) => l === 'CP' || l === 'HC';

const GLYPH: Record<Traveller, { color: string; icon: string }> = {
  search: { color: '#0d9488', icon: 'M-4 -4a4 4 0 1 0 0.1 0M0 0l5 5' },
  results: { color: '#10b981', icon: 'M0 6c-4-5-6-7-6-10a6 6 0 0 1 12 0c0 3-2 5-6 10z' },
  request: { color: '#0b6b5d', icon: 'M-5 -6h7l3 3v9h-10z' },
  answer: { color: '#10b981', icon: 'M-5 0l3 4 7-8' },
  payment: { color: '#0ea5e9', icon: 'M-7 -4h14v8h-14zM-7 -1h14' },
  delivery: { color: '#f59e0b', icon: 'M-6 -3h12v8h-12zM-3 -3a3 3 0 0 1 6 0' },
};

function NodeIcon({ which }: { which: 'P' | 'C' | 'H' }) {
  if (which === 'P') return <path d="M-9 -15h18a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3h-18a3 3 0 0 1-3-3v-24a3 3 0 0 1 3-3zM-3 11h6" />;
  if (which === 'C') return <path d="M-4 -12h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="currentColor" stroke="none" />;
  return <path d="M-14 -4h28l-3-9h-22zM-12 -4v16h24v-16M-3 12v-8h6v8" />;
}

export function FlowStage({ progress }: { progress: MotionValue<number> }) {
  const { t } = useI18n();
  const g = useGraphics();
  const draw3D = useCan3D('flow', 3);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  // Reduced motion: each step shows its end state (no travelling).
  const stateAt = useCallback((v: number) => flowState(g.reduced ? Math.floor(Math.min(4.99, v)) + 0.99 : v), [g.reduced]);
  const [s, setS] = useState<FlowState>(() => stateAt(progress.get()));
  const ref = useRef(progress.get());
  useMotionValueEvent(progress, 'change', (v) => {
    ref.current = v;
    setS(stateAt(v));
  });
  const use3D = draw3D && ready;
  const label = (k: 'P' | 'C' | 'H') => t(k === 'P' ? 'pub.how.patient' : k === 'C' ? 'pub.how.platform' : 'pub.how.pharmacy');
  const involved = new Set(s.active.flatMap((l) => [l[0], l[1]]));

  return (
    <div className={`flow-stage glass ${use3D ? 'is-3d' : ''}`} data-testid="flow-stage" data-step={s.step + 1} data-tracker={s.tracker}>
      {draw3D && (
        <div className="flow-3d" aria-hidden="true">
          <ThreeBoundary fallback={null}>
            <Suspense fallback={null}>
              <FlowScene
                tier={g.tier === 'high' ? 'high' : 'medium'}
                reduced={g.reduced}
                progress={ref}
                onSlow={g.reportSlow}
                onReady={onReady}
              />
            </Suspense>
          </ThreeBoundary>
        </div>
      )}
      <svg viewBox="0 0 600 280" className="flow-svg" role="img" aria-label={t('pub.how.diagramLabel')}>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        <g className="flow-drawing">
          {(['PC', 'CH', 'HP'] as const).map((k) => {
            const act = s.active.find((l) => baseOf(l) === k);
            return (
              <path
                key={k}
                d={pathOf(k)}
                className={`flow-link ${act ? 'active' : ''} ${act && reversed(act) ? 'rev' : ''} ${k === 'HP' ? 'delivery' : ''}`}
                markerEnd={act && !reversed(act) ? 'url(#flow-arrow)' : undefined}
                markerStart={act && reversed(act) ? 'url(#flow-arrow)' : undefined}
              />
            );
          })}
          {(Object.keys(NODES) as ('P' | 'C' | 'H')[]).map((k) => (
            <g key={k} transform={`translate(${NODES[k][0]} ${NODES[k][1]})`} className={`flow-node ${involved.has(k) ? 'on' : ''}`}>
              <circle r="34" />
              <g className="flow-node-icon">
                <NodeIcon which={k} />
              </g>
            </g>
          ))}
          {s.countdown > 0 && (
            <circle
              className="flow-countdown"
              cx={NODES.H[0]}
              cy={NODES.H[1]}
              r="42"
              pathLength={1}
              strokeDasharray={`${1 - s.countdown} 1`}
              transform={`rotate(-90 ${NODES.H[0]} ${NODES.H[1]})`}
            />
          )}
          {s.box > 0 && (
            <g transform={`translate(${NODES.H[0] + 42} ${NODES.H[1] - 44}) scale(${s.box})`} className="flow-box">
              <rect x="-12" y="-10" width="24" height="20" rx="3" />
              <path d="M-12 -3h24M0 -10v7" />
            </g>
          )}
          {s.objects.map((o, i) => {
            const [x, y] = pointOn(o.link, o.t);
            const gl = GLYPH[o.kind];
            return (
              <g key={i} transform={`translate(${x} ${y})`} className="flow-traveller" data-kind={o.kind}>
                <circle r="17" fill={gl.color} />
                <path d={gl.icon} />
              </g>
            );
          })}
        </g>
        {(Object.keys(NODES) as ('P' | 'C' | 'H')[]).map((k) => (
          <text key={k} x={NODES[k][0]} y={NODES[k][1] + 76} textAnchor="middle" className="flow-label">
            {label(k)}
          </text>
        ))}
        {s.countdown > 0 && s.countdown < 1 && (
          <text x={NODES.H[0]} y={NODES.H[1] - 78} textAnchor="middle" className="flow-sub">
            {t('pub.how.minutesLeft', { n: Math.ceil(30 * (1 - s.countdown)) })}
          </text>
        )}
      </svg>
      <ol className="flow-tracker" aria-label={t('pub.how.statusTitle')}>
        {TRACKER.map((st, i) => (
          <li key={st} className={i < s.tracker ? 'done' : ''} aria-current={i === s.tracker - 1 ? 'step' : undefined}>
            <span className="dot" aria-hidden="true" />
            {t(`status.${st}` as MessageKey)}
            {st === 'out_for_delivery' && <span className="sr-only"> ({t('order.simulated')})</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

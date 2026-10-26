import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { formatDateTime, formatPrice, formatTime } from '../../lib/format';
import type { OrderDetails, OrderStatus } from '../../lib/types';
import { PackImage } from '../../components/PackImage';
import { PaymentCard } from '../../components/PaymentCard';
import { QrCode } from '../../components/QrCode';
import { SlotPicker } from '../../components/SlotPicker';
import { OrderMessages } from '../../components/OrderMessages';
import { ReviewForm } from '../../components/ReviewBlock';
import { CardSkeleton, ErrorBox, RxBadge, StatusBadge } from '../../components/ui';
import { IconCheck } from '../../components/Icons';
import { LazyMap } from '../../components/map/LazyMap';
import { DeliveryVisual } from '../../components/three/ThreeVisuals';
import { Confetti2D } from '../../components/motion';
import { useGraphics } from '../../lib/graphics';
import { useReducedMotion } from '../../lib/settings';

const SIMULATED_RIDE_MS = 8 * 60_000;

/** Simulated courier position: at the pharmacy, then along the straight route, then at the patient. */
export function courierProgress(order: Pick<OrderDetails, 'status' | 'history'>, now = Date.now()): number {
  if (order.status === 'delivered') return 1;
  if (order.status !== 'out_for_delivery') return 0;
  const left = order.history.find((h) => h.status === 'out_for_delivery')?.changedAt;
  if (!left) return 0;
  return Math.max(0, Math.min(0.95, (now - new Date(left).getTime()) / SIMULATED_RIDE_MS));
}

function DeliveryMap({ order }: { order: OrderDetails }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (order.status !== 'out_for_delivery' || reduced) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [order.status, reduced]);
  const from: [number, number] = [order.pharmacy.latitude, order.pharmacy.longitude];
  const dest =
    order.destination.latitude != null && order.destination.longitude != null
      ? ([order.destination.latitude, order.destination.longitude] as [number, number])
      : null;
  const p = courierProgress(order, now);
  const courier: [number, number] = dest ? [from[0] + (dest[0] - from[0]) * p, from[1] + (dest[1] - from[1]) * p] : from;
  return (
    <section className="card stack" aria-labelledby="sim-map">
      <div className="row between">
        <h2 id="sim-map" style={{ margin: 0 }}>
          {t('order.simulated')}
        </h2>
        <span className="badge info">{t('order.simulated')}</span>
      </div>
      <DeliveryVisual progress={p} delivered={order.status === 'delivered'} />
      <LazyMap
        center={{ lat: from[0], lon: from[1] }}
        showPatient={false}
        route={dest ? [from, dest] : undefined}
        extraMarkers={[
          { id: 'pharmacy', lat: from[0], lon: from[1], kind: 'pharmacy', label: `${t('map.pharmacyMarker')} — ${order.pharmacy.name}` },
          ...(dest ? [{ id: 'home', lat: dest[0], lon: dest[1], kind: 'home' as const, label: t('map.homeMarker') }] : []),
          ...(order.status !== 'cancelled'
            ? [{ id: 'courier', lat: courier[0], lon: courier[1], kind: 'courier' as const, label: t('map.courierMarker') }]
            : []),
        ]}
        height={300}
      />
      <p className="muted small" style={{ margin: 0 }}>
        {t('order.simulatedText')}
      </p>
    </section>
  );
}

export const STEPS = ['sent', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as const;

/** Index of the current step (0 = request sent). */
export function stepIndex(status: OrderStatus): number {
  return status === 'cancelled' ? -1 : STEPS.indexOf(status as (typeof STEPS)[number]);
}

export function OrderStepper({
  status,
  history,
  createdAt,
}: {
  status: OrderStatus;
  history: { status: OrderStatus; changedAt: string }[];
  createdAt: string;
}) {
  const { t, locale } = useI18n();
  const idx = stepIndex(status);
  return (
    <ol className="stepper" aria-label={t('order.title')}>
      {STEPS.map((s, i) => {
        const at = s === 'sent' ? createdAt : history.find((h) => h.status === s)?.changedAt;
        const state = i < idx || (i === idx && s === 'delivered') ? 'done' : i === idx ? 'current done' : '';
        return (
          <li key={s} className={state} aria-current={i === idx ? 'step' : undefined}>
            <span className="dot">{i <= idx ? <IconCheck width={16} height={16} /> : i + 1}</span>
            <span className="stack" style={{ gap: 0 }}>
              <strong style={{ color: i <= idx ? 'var(--ink)' : 'var(--muted)' }}>{t(`order.step.${s}` as MessageKey)}</strong>
              {at && i <= idx && <span className="muted small">{formatTime(at, locale)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderTrackingPage() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A short celebration on every status change; confetti on Delivered.
  const [celebrate, setCelebrate] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const graphics = useGraphics();
  const last = useRef<OrderStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ order: OrderDetails }>(`/patient/orders/${id}`);
      if (last.current && last.current !== r.order.status) {
        toast(t('order.statusChanged', { status: t(`status.${r.order.status}` as MessageKey) }));
        setCelebrate((n) => n + 1);
        if (r.order.status === 'delivered') setConfetti((n) => n + 1);
      }
      last.current = r.order.status;
      setOrder(r.order);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }, [id, t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!order) return error ? <ErrorBox message={error} /> : <CardSkeleton lines={6} />;

  const total = order.items.filter((i) => !i.excluded).reduce((s, i) => s + (i.priceEur ?? 0) * i.quantity, 0);
  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/patient/orders/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!order.shareToken) return;
    const url = `${window.location.origin}/track/${order.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(t('order.share'), url);
    }
    toast(t('order.shareCopied'));
  };

  return (
    <div className="stack" style={{ gap: 20 }} data-testid="order-tracking">
      <Link to="/requests" className="small">
        ← {t('requests.title')}
      </Link>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{t('order.title')}</h1>
        <span data-testid="order-status" className="status-celebrate">
          <StatusBadge status={order.status} />
          {celebrate > 0 && <span key={celebrate} className="celebrate-ring" aria-hidden="true" />}
        </span>
        {/* The 3D delivery scene has its own confetti; the 2D overlay is used when it is not shown. */}
        {!graphics.canRender3D && <Confetti2D fire={confetti} />}
      </div>
      <p className="muted small">
        {formatDateTime(order.createdAt, locale)} · {t('order.refresh')}
      </p>
      {error && <ErrorBox message={error} />}
      {order.status === 'cancelled' && <div className="alert error">{t('order.cancelledBanner')}</div>}
      {order.cancelRequestedAt && order.status !== 'cancelled' && <div className="alert warn">{t('order.cancelRequested')}</div>}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <OrderStepper status={order.status} history={order.history} createdAt={order.createdAt} />
        </section>
        <section className="card stack">
          <h2>{t('order.pharmacy')}</h2>
          <strong>{order.pharmacy.name}</strong>
          <span className="muted">{order.pharmacy.address}</span>
          {order.pharmacy.phone && <a href={`tel:${order.pharmacy.phone.replace(/\s/g, '')}`}>{order.pharmacy.phone}</a>}
          <div className="alert info small">
            <strong>{t('order.simulated')}</strong> — {t('order.simulatedText')}
          </div>
        </section>
      </div>

      <DeliveryMap order={order} />

      <section className="card stack">
        <h2>{t('order.items')}</h2>
        {order.items.map((i) => (
          <div key={i.id} className="line-item" style={{ opacity: i.excluded ? 0.5 : 1 }}>
            <PackImage name={i.name} dosage={i.dosage} form={i.form} category={i.category} rx={i.requiresPrescription} />
            <span className="stack" style={{ gap: 2 }}>
              <strong>
                {i.quantity} × {i.name}
              </strong>
              <RxBadge rx={i.requiresPrescription} />
            </span>
            <span className="line-price">{i.excluded ? t('requests.excluded') : formatPrice((i.priceEur ?? 0) * i.quantity, locale)}</span>
          </div>
        ))}
        <div className="row between">
          <span className="muted">{t('order.total')}</span>
          <strong>{formatPrice(total, locale)}</strong>
        </div>
      </section>

      {order.pickupCode && (
        <section className="card stack" aria-labelledby="pickup-h" data-testid="pickup-card">
          <h2 id="pickup-h">{t('pickup.patientTitle')}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {t('pickup.patientHelp')}
          </p>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <QrCode text={`${window.location.origin}/pickup/${order.id}.${order.pickupCode}`} label={t('pickup.qrLabel')} />
            <strong
              data-testid="pickup-code-shown"
              style={{ fontSize: '2rem', letterSpacing: '0.18em', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {order.pickupCode}
            </strong>
          </div>
        </section>
      )}

      <SlotPicker orderId={order.id} status={order.status} />

      <OrderMessages orderId={order.id} side="patient" />

      {order.status === 'delivered' && <ReviewForm orderId={order.id} />}

      <PaymentCard orderId={order.id} orderStatus={order.status} total={total} />

      <div className="row">
        {order.shareToken && order.status !== 'cancelled' && (
          <button type="button" className="btn secondary" onClick={() => void share()}>
            {t('order.share')}
          </button>
        )}
        <Link to={`/orders/${order.id}/print`} className="btn secondary">
          {t('order.print')}
        </Link>
        {order.status === 'accepted' && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void cancel()}>
            {t('order.cancel')}
          </button>
        )}
        {['preparing', 'ready', 'out_for_delivery'].includes(order.status) && !order.cancelRequestedAt && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void cancel()}>
            {t('order.askCancel')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Public, read-only tracking from a share link (no personal data). */
export function SharedTrackingPage() {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const [order, setOrder] = useState<{
    status: OrderStatus;
    pharmacyName: string;
    pharmacyCity: string;
    history: { status: OrderStatus; changedAt: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () =>
      api<{ order: NonNullable<typeof order> }>(`/share/${token}`)
        .then((r) => setOrder(r.order))
        .catch((e) =>
          setError(e instanceof ApiError && e.status === 410 ? t('track.expired') : e instanceof ApiError ? e.message : t('common.error')),
        );
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [token, t]);
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>{t('track.title')}</h1>
      {error && <div className="alert warn">{error}</div>}
      {order && (
        <>
          <div className="row between">
            <strong>
              {order.pharmacyName} · {order.pharmacyCity}
            </strong>
            <StatusBadge status={order.status} />
          </div>
          <OrderStepper status={order.status} history={order.history} createdAt={order.history[0]?.changedAt ?? new Date().toISOString()} />
          <p className="muted small">{t('order.simulated')}</p>
        </>
      )}
    </div>
  );
}

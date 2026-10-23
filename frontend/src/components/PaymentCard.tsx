import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatPrice } from '../lib/format';

type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'cancelled' | 'refunded' | 'failed' | 'capture_failed';
interface PaymentInfo {
  configured: boolean;
  testMode: boolean;
  payment: { status: PaymentStatus; amountCents: number; currency: string } | null;
}

/**
 * "Payment (test mode)" on the order page. The card is entered on Stripe's own page, never here. The patient can
 * pay only once the pharmacy has accepted (the order exists); the amount is held and taken when the order is ready.
 */
export function PaymentCard({ orderId, orderStatus, total }: { orderId: string; orderStatus: string; total: number }) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returning = params.get('payment') === 'return';
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      setInfo(await api<PaymentInfo>(`/patient/orders/${orderId}/payment`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }, [orderId, t]);
  // Look again whenever the order moves (the money follows the order: captured when ready, released or refunded when cancelled).
  useEffect(() => {
    void load();
  }, [load, orderStatus]);

  // Back from Stripe: the webhook may take a few seconds to arrive, so look again for a short while.
  const status = info?.payment?.status;
  useEffect(() => {
    if (!returning || status === 'authorized' || status === 'captured') return;
    const id = setInterval(() => {
      polls.current += 1;
      if (polls.current > 12) clearInterval(id);
      else void load();
    }, 2000);
    return () => clearInterval(id);
  }, [returning, status, load]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>(`/patient/orders/${orderId}/pay`, { method: 'POST' });
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
      setBusy(false);
    }
  }

  if (!info && !error) return null;
  const payable = ['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(orderStatus);
  const canPay = payable && (!status || ['pending', 'failed', 'cancelled'].includes(status));
  return (
    <section className="card stack" data-testid="payment-card" aria-labelledby="payment-title">
      <div className="row between">
        <h2 id="payment-title">{t('pay.title')}</h2>
        <span className="badge" data-testid="payment-status">
          {status ? t(`pay.status.${status}` as MessageKey) : t('pay.status.none')}
        </span>
      </div>
      <div className="alert info small">{t('pay.testNotice')}</div>
      {info && !info.configured && (
        <div className="alert warn" role="status" data-testid="payments-not-configured">
          <strong>{t('pay.notConfigured')}</strong> {t('pay.notConfiguredHelp')}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {status === 'authorized' && (
        <p>{t('pay.authorizedText', { amount: formatPrice((info?.payment?.amountCents ?? 0) / 100, locale) })}</p>
      )}
      {status === 'captured' && <p>{t('pay.capturedText', { amount: formatPrice((info?.payment?.amountCents ?? 0) / 100, locale) })}</p>}
      {status === 'refunded' && <p>{t('pay.refundedText')}</p>}
      {status === 'capture_failed' && <p>{t('pay.captureFailedText')}</p>}
      {returning && !status && <p aria-live="polite">{t('pay.waiting')}</p>}
      {params.get('payment') === 'cancelled' && !status && (
        <p role="status" data-testid="payment-cancelled">
          {t('pay.cancelledReturn')}
        </p>
      )}
      {canPay && info?.configured && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted small">{t('pay.afterAccept')}</p>
          <p className="muted small">{t('pay.testCards')}</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            data-testid="pay-button"
            onClick={() => {
              setParams({});
              void pay();
            }}
          >
            {t('pay.button', { amount: formatPrice(total, locale) })}
          </button>
        </div>
      )}
      {status && ['authorized', 'captured', 'refunded'].includes(status) && (
        <Link to={`/orders/${orderId}/receipt`} className="btn secondary" data-testid="receipt-link">
          {t('pay.receipt')}
        </Link>
      )}
    </section>
  );
}

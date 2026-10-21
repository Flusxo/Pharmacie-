/**
 * Multi-step request flow: 1. choose a pharmacy (only those with stock) -> 2. confirm -> 3. sent.
 * Never a purchase: the pharmacy confirms and hands over the medicine.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatKm, formatPrice } from '../lib/format';
import type { Medicine, NearbyPharmacy } from '../lib/types';
import { IconCheck } from './Icons';
import { OpenBadge } from './ui';

const RESPONSE_MINUTES = 30;

interface Props {
  medicine: Medicine;
  pharmacies: NearbyPharmacy[];
  initialPharmacyId?: string | null;
  onClose: () => void;
}

export function RequestSheet({ medicine, pharmacies, initialPharmacyId, onClose }: Props) {
  const { t, locale } = useI18n();
  const [qty, setQty] = useState(1);
  const eligible = pharmacies.filter((p) => p.inStock && (p.quantity ?? 0) >= qty);
  const [pharmacyId, setPharmacyId] = useState<string | null>(initialPharmacyId ?? null);
  const [step, setStep] = useState(initialPharmacyId ? 2 : 1);
  const [rxOk, setRxOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const chosen = pharmacies.find((p) => p.id === pharmacyId) ?? null;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);

  const send = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>('/patient/requests', {
        method: 'POST',
        body: {
          items: [{ medicineId: medicine.id, quantity: qty }],
          prescriptionNote: medicine.requiresPrescription ? t('flow.prescriptionNote') : undefined,
        },
      });
      setRequestId(r.id);
      await api(`/patient/requests/${r.id}/choose`, { method: 'POST', body: { pharmacyId: chosen.id } });
      setStep(3);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={dialogRef}
        data-testid="request-sheet"
      >
        <div className="progress-dots" aria-label={`${step} / 3`}>
          {[1, 2, 3].map((s) => (
            <span key={s} className={s <= step ? 'on' : ''} />
          ))}
        </div>
        <div className="row between">
          <h2 id="sheet-title" style={{ margin: 0 }}>
            {step === 3 ? t('flow.sentTitle') : t('flow.title')}
          </h2>
          <button type="button" className="btn ghost small" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        {step === 1 && (
          <>
            <p className="muted">{t('flow.chooseLead')}</p>
            <div className="field" style={{ maxWidth: 200 }}>
              <label htmlFor="qty">{t('flow.quantity')}</label>
              <select id="qty" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
            {eligible.length === 0 ? (
              <div className="alert warn">{t('med.noPharmacies')}</div>
            ) : (
              <div role="radiogroup" aria-label={t('flow.step1')}>
                {eligible.map((p) => (
                  <label key={p.id} className={`pharmacy-row ${pharmacyId === p.id ? 'selected' : ''}`} style={{ cursor: 'pointer' }}>
                    <span className="row" style={{ gap: 10 }}>
                      <input type="radio" name="pharmacy" checked={pharmacyId === p.id} onChange={() => setPharmacyId(p.id)} />
                      <span className="stack" style={{ gap: 2 }}>
                        <strong>{p.name}</strong>
                        <span className="muted small">
                          {p.city} · {formatKm(p.distanceKm, locale)} · {formatPrice(p.priceEur ?? null, locale)}
                        </span>
                        <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
                      </span>
                    </span>
                    <span className={`badge ${p.lowStock ? 'warn' : 'ok'}`}>{p.lowStock ? t('med.lowStock') : t('med.inStock')}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn block"
              disabled={!pharmacyId || !eligible.some((p) => p.id === pharmacyId)}
              onClick={() => setStep(2)}
            >
              {t('common.continue')}
            </button>
          </>
        )}

        {step === 2 && chosen && (
          <>
            <p>{t('flow.summary', { qty, name: `${medicine.name}`, pharmacy: chosen.name })}</p>
            {initialPharmacyId && (
              <div className="field" style={{ maxWidth: 200 }}>
                <label htmlFor="qty2">{t('flow.quantity')}</label>
                <select id="qty2" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                  {Array.from({ length: Math.min(10, chosen.quantity ?? 1) }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {medicine.requiresPrescription && (
              <div className="alert info stack" style={{ gap: 8 }}>
                <strong>{t('flow.prescriptionTitle')}</strong>
                <label className="check">
                  <input type="checkbox" checked={rxOk} onChange={(e) => setRxOk(e.target.checked)} data-testid="rx-check" />
                  <span>{t('flow.prescriptionCheck')}</span>
                </label>
              </div>
            )}
            <p className="muted small">{t('flow.notSale')}</p>
            {error && (
              <div className="alert error" role="alert">
                {error}
                {requestId && (
                  <>
                    {' '}
                    <Link to={`/requests/${requestId}`}>{t('flow.follow')}</Link>
                  </>
                )}
              </div>
            )}
            <div className="row">
              {!initialPharmacyId && (
                <button type="button" className="btn secondary" onClick={() => setStep(1)}>
                  {t('common.back')}
                </button>
              )}
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                disabled={busy || (medicine.requiresPrescription && !rxOk)}
                onClick={() => void send()}
              >
                {busy ? t('flow.sending') : t('flow.send')}
              </button>
            </div>
          </>
        )}

        {step === 3 && chosen && requestId && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }} data-testid="request-sent">
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--ok-bg)',
                color: 'var(--ok)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <IconCheck width={40} height={40} />
            </div>
            <p>{t('flow.sentText', { pharmacy: chosen.name, minutes: RESPONSE_MINUTES })}</p>
            <Link to={`/requests/${requestId}`} className="btn">
              {t('flow.follow')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

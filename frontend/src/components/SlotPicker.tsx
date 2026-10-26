import { useEffect, useMemo, useState } from 'react';
import { useFeatures } from '../lib/features';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { useToast } from '../lib/toast';
import { ErrorBox } from './ui';

interface Offer {
  slots: string[];
  chosen: { start: string; mode: 'pickup' | 'delivery' | null } | null;
}

/** Day and time of a slot in the pharmacy's time zone (Europe/Paris). */
const dayKey = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const timeOf = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** The patient picks a pickup time (or a simulated delivery time) inside the pharmacy's opening hours. */
export function SlotPicker({ orderId, status }: { orderId: string; status: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const features = useFeatures();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup');
  const [error, setError] = useState<string | null>(null);
  const open = ['accepted', 'preparing', 'ready'].includes(status);

  useEffect(() => {
    if (!open) return;
    api<Offer>(`/patient/orders/${orderId}/slots`)
      .then((o) => {
        setOffer(o);
        if (o.chosen?.mode) setMode(o.chosen.mode);
      })
      .catch(() => setOffer({ slots: [], chosen: null }));
  }, [orderId, open, status]);

  const days = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of offer?.slots ?? []) m.set(dayKey(s, locale), [...(m.get(dayKey(s, locale)) ?? []), s]);
    return m;
  }, [offer, locale]);
  useEffect(() => {
    const first = [...days.keys()][0];
    if (first && !days.has(day)) setDay(first);
  }, [days, day]);

  if (!open || !offer || !features.slots) return null;
  const save = async () => {
    setError(null);
    try {
      await api(`/patient/orders/${orderId}/slot`, { method: 'PUT', body: { start, mode } });
      toast(t('slot.saved'));
      setOffer({ ...offer, chosen: { start, mode } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };
  return (
    <section className="card stack" aria-labelledby="slot-h" data-testid="slot-picker">
      <h2 id="slot-h">{t('slot.title')}</h2>
      {offer.chosen && (
        <p className="alert ok" role="status" style={{ margin: 0 }} data-testid="slot-chosen">
          {t(offer.chosen.mode === 'delivery' ? 'slot.chosenDelivery' : 'slot.chosenPickup', {
            day: dayKey(offer.chosen.start, locale),
            time: timeOf(offer.chosen.start, locale),
          })}
        </p>
      )}
      {offer.slots.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('slot.none')}
        </p>
      ) : (
        <>
          {error && <ErrorBox message={error} />}
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 16 }}>
            <legend className="sr-only">{t('slot.mode')}</legend>
            <label className="check">
              <input type="radio" name="slot-mode" checked={mode === 'pickup'} onChange={() => setMode('pickup')} />
              <span>{t('slot.pickup')}</span>
            </label>
            <label className="check">
              <input type="radio" name="slot-mode" checked={mode === 'delivery'} onChange={() => setMode('delivery')} />
              <span>{t('slot.delivery')}</span>
            </label>
          </fieldset>
          {mode === 'delivery' && (
            <p className="alert info small" style={{ margin: 0 }}>
              {t('slot.deliverySimulated')}
            </p>
          )}
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="field">
              <span>{t('slot.day')}</span>
              <select
                className="input"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setStart('');
                }}
              >
                {[...days.keys()].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('slot.time')}</span>
              <select className="input" value={start} onChange={(e) => setStart(e.target.value)} data-testid="slot-time">
                <option value="">{t('slot.choose')}</option>
                {(days.get(day) ?? []).map((s) => (
                  <option key={s} value={s}>
                    {timeOf(s, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn" style={{ width: 'fit-content' }} disabled={!start} onClick={() => void save()}>
            {t('slot.save')}
          </button>
        </>
      )}
    </section>
  );
}

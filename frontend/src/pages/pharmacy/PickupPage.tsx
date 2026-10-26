import { useEffect, useState, type FormEvent } from 'react';
import { ForBadge, type ForMember } from '../../components/FamilyBits';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { ErrorBox } from '../../components/ui';

interface Preview {
  orderId: string;
  forMember?: ForMember | null;
  patientName: string;
  items: { id: string; name: string; dosage: string; quantity: number; excluded: boolean }[];
}

/**
 * Pickup at the counter. The patient's QR code opens this page with the order and the code in the link; the pharmacist
 * sees who it is for and what to hand over, then confirms with one tap. Without a code in the link, the code is typed.
 */
export function PickupPage() {
  const { ref = '' } = useParams();
  const { t } = useI18n();
  const [orderId, codeFromLink] = ref.split('.');
  const [code, setCode] = useState(codeFromLink ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async (c: string) => {
    setError(null);
    setBusy(true);
    try {
      setPreview(await api<Preview>('/pharmacy/pickup/check', { method: 'POST', body: { orderId, code: c } }));
    } catch (e) {
      setPreview(null);
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (codeFromLink) void check(codeFromLink);
    // The link is read once when the page opens.
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/pharmacy/orders/${orderId}/pickup`, { method: 'POST', body: { code } });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560, margin: '0 auto' }} data-testid="pickup-page">
      <Link to="/pharmacy" className="small">
        ← {t('nav.dashboard')}
      </Link>
      <h1>{t('pickup.title')}</h1>
      {error && <ErrorBox message={error} />}
      {done ? (
        <div className="card stack" role="status" data-testid="pickup-done">
          <svg className="check-draw" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 48, height: 48 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M7 12.5l3.5 3.5L17 9" />
          </svg>
          <strong>{t('pickup.done')}</strong>
          <Link to="/pharmacy" className="btn">
            {t('pickup.back')}
          </Link>
        </div>
      ) : preview ? (
        <div className="card stack" data-testid="pickup-preview">
          <p className="muted small" style={{ margin: 0 }}>
            {t('pickup.for')}
          </p>
          <strong style={{ fontSize: '1.4rem' }}>{preview.patientName}</strong>
          <ForBadge member={preview.forMember} />
          <ul className="plain-list">
            {preview.items
              .filter((i) => !i.excluded)
              .map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.name} {i.dosage}
                </li>
              ))}
          </ul>
          <button type="button" className="btn" disabled={busy} onClick={() => void confirm()} data-testid="pickup-confirm">
            {t('pickup.confirm')}
          </button>
        </div>
      ) : (
        <form
          className="card stack"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void check(code);
          }}
        >
          <label className="field">
            <span>{t('pickup.code')}</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              data-testid="pickup-code"
              required
            />
          </label>
          <button className="btn" type="submit" disabled={busy || code.trim().length < 4}>
            {t('pickup.check')}
          </button>
        </form>
      )}
    </div>
  );
}

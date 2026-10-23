/**
 * Development and e2e only (the route exists only when import.meta.env.DEV, the API refuses it in production):
 * a stand-in for Stripe's hosted payment page, so the whole flow can be tried without Stripe keys.
 * It never collects a real card: only the two Stripe test numbers are meaningful.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { ApiError, api } from '../../lib/api';

export default function FakeStripePage() {
  const { t } = useI18n();
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const navigate = useNavigate();
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ outcome: 'paid' | 'declined' }>(`/dev/fake-stripe/${sessionId}/complete`, { method: 'POST', body: { card } });
      if (r.outcome === 'declined') {
        setError(t('pay.fake.declined'));
        return;
      }
      navigate(`/orders/${orderId}?payment=return`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stack" style={{ maxWidth: 460, margin: '40px auto', padding: 16 }} data-testid="fake-stripe">
      <div className="alert warn">{t('pay.fake.notice')}</div>
      <form className="card stack" onSubmit={pay}>
        <h1 style={{ fontSize: '1.4rem' }}>{t('pay.fake.title')}</h1>
        <div className="field">
          <label htmlFor="fake-card">{t('pay.fake.card')}</label>
          <input
            id="fake-card"
            className="input"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        {error && (
          <div className="alert error" role="alert" data-testid="fake-stripe-error">
            {error}
          </div>
        )}
        <button className="btn" type="submit" disabled={busy} data-testid="fake-stripe-pay">
          {t('pay.fake.pay')}
        </button>
        <Link to={`/orders/${orderId}?payment=cancelled`}>{t('pay.fake.back')}</Link>
      </form>
    </main>
  );
}

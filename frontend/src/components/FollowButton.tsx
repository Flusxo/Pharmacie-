import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Followed {
  medicineId: string;
  name: string;
  dosage: string;
}

/** "Notify me when it is back in stock" on a medicine page (patients only). One notice, then it stops. */
export function FollowButton({ medicineId }: { medicineId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role !== 'patient') return;
    api<{ items: Followed[] }>('/patient/watches')
      .then((r) => setFollowing(r.items.some((i) => i.medicineId === medicineId)))
      .catch(() => setFollowing(false));
  }, [user?.role, medicineId]);
  if (user?.role !== 'patient' || following === null) return null;
  const hasAddress = user.patient?.latitude != null;
  const toggle = async () => {
    setError(null);
    try {
      if (following) await api(`/patient/watches/${medicineId}`, { method: 'DELETE' });
      else {
        await api('/patient/watches', { method: 'POST', body: { medicineId } });
        toast(t('follow.on'));
      }
      setFollowing(!following);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };
  return (
    <div className="stack" style={{ gap: 6 }} data-testid="follow">
      <button type="button" className="btn secondary" aria-pressed={following} onClick={() => void toggle()} data-testid="follow-button">
        {following ? t('follow.stop') : t('follow.start')}
      </button>
      <span className="muted small">{following ? t('follow.onNote') : t('follow.note')}</span>
      {!hasAddress && (
        <span className="small">
          {t('follow.needAddress')} <Link to="/profile">{t('follow.addAddress')}</Link>
        </span>
      )}
      {error && <span className="alert error small">{error}</span>}
    </div>
  );
}

/** The medicines a patient follows, with a way to stop (account page). */
export function FollowedList() {
  const { t } = useI18n();
  const [items, setItems] = useState<Followed[] | null>(null);
  const load = useCallback(
    () =>
      api<{ items: Followed[] }>('/patient/watches')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!items) return null;
  return (
    <section className="card stack" aria-labelledby="followed-h" data-testid="followed">
      <h2 id="followed-h">{t('follow.listTitle')}</h2>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('follow.listEmpty')}
        </p>
      ) : (
        items.map((i) => (
          <div key={i.medicineId} className="row between">
            <Link to={`/medicines/${i.medicineId}`}>
              {i.name} <span className="muted small">{i.dosage}</span>
            </Link>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => void api(`/patient/watches/${i.medicineId}`, { method: 'DELETE' }).then(load)}
            >
              {t('follow.stop')}
            </button>
          </div>
        ))
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ForBadge } from '../../components/FamilyBits';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { usePlace } from '../../lib/location';
import { useToast } from '../../lib/toast';
import { formatDateTime, formatKm, formatPrice, formatTime } from '../../lib/format';
import type { OptionsResponse, PharmacyOption, RequestDetails, RequestSummary } from '../../lib/types';
import { PackImage } from '../../components/PackImage';
import { CardSkeleton, Empty, ErrorBox, OpenBadge, RxBadge, StatusBadge } from '../../components/ui';
import { LocationControl } from '../../components/LocationControl';
import { FileManager } from '../../components/PrivateFiles';

export function RequestsPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<RequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: RequestSummary[] }>('/patient/requests')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [t]);
  return (
    <div className="stack">
      <h1>{t('requests.title')}</h1>
      {error && <ErrorBox message={error} />}
      {!items && !error && <CardSkeleton />}
      {items?.length === 0 && <Empty art="cut-bag">{t('requests.empty')}</Empty>}
      {items?.map((r) => (
        <div key={r.id} className="stack" style={{ gap: 6 }}>
          <Link
            to={r.orderId ? `/orders/${r.orderId}` : `/requests/${r.id}`}
            className="card lift row between"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="stack" style={{ gap: 2 }}>
              <strong>{r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</strong>
              <ForBadge member={r.forMember} />
              <span className="muted small">
                {formatDateTime(r.createdAt, locale)}
                {r.pharmacyName ? ` · ${r.pharmacyName}` : ''}
                {r.source === 'doctor' ? ` · ${t('requests.byDoctor')}` : ''}
              </span>
            </span>
            <StatusBadge status={r.orderStatus ?? r.status} />
          </Link>
          {['delivered', 'cancelled', 'refused', 'expired', 'rejected'].includes(r.orderStatus ?? r.status) && r.items[0] && (
            <Link
              to={`/search?q=${encodeURIComponent(r.items[0].name)}`}
              className="btn ghost small"
              style={{ width: 'fit-content' }}
              data-testid="order-again"
            >
              {t('requests.again')}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function OptionRow({
  o,
  partial,
  onChoose,
  busy,
}: {
  o: PharmacyOption;
  partial: boolean;
  onChoose: (o: PharmacyOption, partial: boolean) => void;
  busy: boolean;
}) {
  const { t, locale } = useI18n();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pharmacy-row" data-testid="option-row">
      <div className="stack" style={{ gap: 4 }}>
        <strong>{o.name}</strong>
        <span className="muted small">
          {o.city} {o.distanceKm != null ? `· ${formatKm(o.distanceKm, locale)}` : ''} · {formatPrice(o.totalPriceEur, locale)}
        </span>
        <span className="row" style={{ gap: 6 }}>
          {partial ? <span className="badge warn">{t('flow.partial')}</span> : <span className="badge ok">{t('med.inStock')}</span>}
          <OpenBadge hours={o.openingHours} onDuty={o.onDuty} />
        </span>
        {partial && (
          <>
            <span className="small">{t('flow.partialMissing', { items: o.missing.map((m) => m.name).join(', ') })}</span>
            <label className="check small">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span>{t('flow.partialConfirm')}</span>
            </label>
          </>
        )}
      </div>
      <button type="button" className="btn small" disabled={busy || (partial && !confirm)} onClick={() => onChoose(o, partial)}>
        {t('med.chooseThis')}
      </button>
    </div>
  );
}

export function RequestDetailsPage() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { place } = usePlace();
  const [req, setReq] = useState<RequestDetails | null>(null);
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ request: RequestDetails }>(`/patient/requests/${id}`);
      setReq(r.request);
      if (r.request.status === 'received') {
        setOptions(await api<OptionsResponse>(`/patient/requests/${id}/options`, { query: { lat: place.lat, lon: place.lon } }));
      } else setOptions(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }, [id, place.lat, place.lon, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!req || !['sent_to_pharmacy', 'awaiting_patient_approval'].includes(req.status)) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [req, load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!req) return error ? <ErrorBox message={error} /> : <CardSkeleton lines={5} />;
  const current = req.pharmacies.find((p) => p.response === 'pending');
  const refused = req.pharmacies.filter((p) => p.response === 'refused' || p.response === 'expired');

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link to="/requests" className="small">
        ← {t('requests.title')}
      </Link>
      <ForBadge member={req.forMember} />
      <div className="row between">
        <h1 style={{ margin: 0 }}>{t('flow.title')}</h1>
        <StatusBadge status={req.status} />
      </div>
      <p className="muted small">
        {formatDateTime(req.createdAt, locale)}
        {req.doctorName ? ` · ${t('requests.fromDoctor', { doctor: `Dr ${req.doctorName}` })}` : ''}
      </p>
      {error && <ErrorBox message={error} />}

      <section className="card stack">
        {req.items.map((i) => (
          <div key={i.id} className="line-item" style={{ opacity: i.excluded ? 0.5 : 1 }}>
            <PackImage name={i.name} dosage={i.dosage} form={i.form} category={i.category} rx={i.requiresPrescription} />
            <span className="stack" style={{ gap: 2 }}>
              <strong>
                {i.quantity} × {i.name}
              </strong>
              <span className="row" style={{ gap: 6 }}>
                <RxBadge rx={i.requiresPrescription} />
                {i.excluded && <span className="badge warn">{t('requests.excluded')}</span>}
              </span>
            </span>
          </div>
        ))}
        {req.instructions && (
          <div className="alert info">
            <strong>{t('requests.instructions')} :</strong> {req.instructions}
          </div>
        )}
      </section>

      {req.status !== 'cancelled' && req.status !== 'expired' && (
        <FileManager
          title={t('files.rxTitle')}
          help={t('files.rxHelp')}
          listPath={`/patient/requests/${req.id}/files`}
          uploadPath={`/patient/requests/${req.id}/files`}
          deletePath={(fid) => `/patient/files/${fid}`}
          testId="rx-files"
        />
      )}

      {refused.map((p) => (
        <div key={p.id} className="alert warn">
          {t('requests.refusedBy', { pharmacy: p.name })}
        </div>
      ))}

      {req.status === 'sent_to_pharmacy' && current && (
        <div className="alert info" role="status">
          {t('requests.waitingFor', { pharmacy: current.name, time: formatTime(current.answerBy, locale) })}
        </div>
      )}

      {req.status === 'awaiting_patient_approval' && req.substitution && (
        <section className="card stack" aria-live="polite">
          <p>{t('requests.substitution', { proposed: `${req.substitution.proposedName}`, original: req.substitution.originalName })}</p>
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(`/patient/requests/${id}/substitutions/${req.substitution!.id}`, { method: 'POST', body: { approve: true } }),
                )
              }
            >
              {t('requests.approve')}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(`/patient/requests/${id}/substitutions/${req.substitution!.id}`, { method: 'POST', body: { approve: false } }),
                )
              }
            >
              {t('requests.decline')}
            </button>
          </div>
        </section>
      )}

      {req.status === 'received' && options && (
        <section className="card stack" aria-labelledby="opts">
          <h2 id="opts">{t('requests.choosePharmacy')}</h2>
          <p className="muted small">{t('requests.optionsLead')}</p>
          <LocationControl compact />
          {options.full.length === 0 && options.partial.length === 0 && <Empty>{t('requests.noOptions')}</Empty>}
          <div>
            {options.full.map((o) => (
              <OptionRow
                key={o.id}
                o={o}
                partial={false}
                busy={busy}
                onChoose={(opt) => void act(() => api(`/patient/requests/${id}/choose`, { method: 'POST', body: { pharmacyId: opt.id } }))}
              />
            ))}
            {options.partial.map((o) => (
              <OptionRow
                key={o.id}
                o={o}
                partial
                busy={busy}
                onChoose={(opt) =>
                  void act(() =>
                    api(`/patient/requests/${id}/choose`, { method: 'POST', body: { pharmacyId: opt.id, acceptPartial: true } }),
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {req.orderId && (
        <Link className="btn" to={`/orders/${req.orderId}`}>
          {t('requests.viewOrder')}
        </Link>
      )}
      {['received', 'sent_to_pharmacy', 'awaiting_patient_approval'].includes(req.status) && (
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => void act(() => api(`/patient/requests/${id}/cancel`, { method: 'POST' }), t('requests.cancelled'))}
        >
          {t('requests.cancel')}
        </button>
      )}
    </div>
  );
}

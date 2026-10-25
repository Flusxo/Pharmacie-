import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { duration, easeOut } from '../../motion';
import { useI18n } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { OnboardingTour } from '../../components/Tour';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDate, formatDateTime } from '../../lib/format';
import { MedicinePicker, Tabs, type MedicineHit } from '../../components/dash';
import { CardSkeleton, Empty, ErrorBox, RxBadge, StatusBadge } from '../../components/ui';

interface LinkedPatient {
  id: string;
  confirmed: boolean;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  email: string;
}
interface Template {
  id: string;
  name: string;
  instructions: string | null;
  items: { medicineId: string; name: string; dosage: string; quantity: number }[];
}
interface SentRequest {
  id: string;
  status: string;
  instructions: string | null;
  createdAt: string;
  orderStatus: string | null;
  patientName: string;
  items: { name: string; dosage: string; quantity: number }[];
}
interface DraftItem {
  medicineId: string;
  name: string;
  dosage: string;
  requiresPrescription: boolean;
  quantity: number;
}

type Tab = 'patients' | 'new' | 'templates' | 'history';

export function DoctorDashboard() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('patients');
  const [patients, setPatients] = useState<LinkedPatient[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [history, setHistory] = useState<SentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [patientId, setPatientId] = useState('');
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [sent, setSent] = useState(false);
  const [patientQ, setPatientQ] = useState('');

  const load = useCallback(() => {
    void api<{ items: LinkedPatient[] }>('/doctor/patients')
      .then((r) => setPatients(r.items))
      .catch(() => setPatients([]));
    void api<{ items: Template[] }>('/doctor/templates')
      .then((r) => setTemplates(r.items))
      .catch(() => setTemplates([]));
    void api<{ items: SentRequest[] }>('/doctor/requests')
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) toast(ok);
      load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
      return false;
    }
  };

  const addItem = (m: MedicineHit) =>
    setDraft((d) =>
      d.some((x) => x.medicineId === m.id)
        ? d
        : [...d, { medicineId: m.id, name: m.name, dosage: m.dosage, requiresPrescription: m.requiresPrescription, quantity: 1 }],
    );
  const confirmed = (patients ?? []).filter((p) => p.confirmed);
  const body = () => ({
    items: draft.map((d) => ({ medicineId: d.medicineId, quantity: d.quantity })),
    instructions: instructions || null,
  });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <OnboardingTour role="doctor" />
      <div>
        <h1 style={{ marginBottom: 4 }}>{user?.displayName}</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {t('doc.title')} · {t('doc.privacy')}
        </p>
      </div>
      {error && <ErrorBox message={error} />}
      <Tabs<Tab>
        label={t('doc.title')}
        value={tab}
        onChange={(k) => {
          setTab(k);
          setSent(false);
        }}
        tabs={[
          { key: 'patients', label: t('doc.tabPatients') },
          { key: 'new', label: t('doc.tabNew') },
          { key: 'templates', label: t('doc.tabTemplates') },
          { key: 'history', label: t('doc.tabHistory') },
        ]}
      />

      {tab === 'patients' && (
        <div className="stack">
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void api<{ message: string }>('/doctor/links', { method: 'POST', body: { email: linkEmail } })
                .then((r) => {
                  toast(r.message);
                  setLinkEmail('');
                  load();
                })
                .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error')));
            }}
          >
            <h3 style={{ margin: 0 }}>{t('doc.linkTitle')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('doc.linkHint')}
            </p>
            <div className="row">
              <label className="sr-only" htmlFor="link-email">
                {t('login.email')}
              </label>
              <input
                id="link-email"
                className="input"
                style={{ flex: 1 }}
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder={t('login.email')}
              />
              <button className="btn" type="submit" disabled={!linkEmail}>
                {t('doc.linkSend')}
              </button>
            </div>
          </form>
          {!patients ? (
            <CardSkeleton />
          ) : patients.length === 0 ? (
            <Empty>{t('doc.noPatients')}</Empty>
          ) : (
            <>
              <label className="sr-only" htmlFor="doc-search">
                {t('dash.search')}
              </label>
              <input
                id="doc-search"
                className="input"
                placeholder={t('dash.search')}
                value={patientQ}
                onChange={(e) => setPatientQ(e.target.value)}
              />
              <AnimatePresence initial={false}>
                {patients
                  .filter((p) => `${p.firstName ?? ''} ${p.lastName ?? ''} ${p.email}`.toLowerCase().includes(patientQ.toLowerCase()))
                  .map((p) => (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: duration.base, ease: easeOut }}
                      className="card row between"
                      data-testid="doctor-patient"
                    >
                      <span className="stack" style={{ gap: 2 }}>
                        <strong>{p.confirmed ? `${p.firstName} ${p.lastName}` : p.email}</strong>
                        <span className="muted small">
                          {p.confirmed && p.birthDate ? t('doc.born', { date: formatDate(p.birthDate, locale) }) : p.email}
                        </span>
                      </span>
                      <span className="row">
                        <span className={`badge ${p.confirmed ? 'ok' : 'warn'}`}>
                          {p.confirmed ? t('doc.confirmed') : t('doc.pending')}
                        </span>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => void run(() => api(`/doctor/links/${p.id}`, { method: 'DELETE' }))}
                        >
                          {t('doc.unlink')}
                        </button>
                      </span>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      {tab === 'new' && (
        <div className="card stack">
          {sent ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }} data-testid="doctor-sent">
              <motion.div
                className="paper-plane"
                aria-hidden="true"
                initial={{ x: -60, y: 30, rotate: -20, opacity: 0 }}
                animate={{ x: [-60, 0, 90], y: [30, 0, -50], rotate: [-20, 0, 15], opacity: [0, 1, 0] }}
                transition={{ duration: duration.slow * 2, ease: easeOut, times: [0, 0.4, 1] }}
              >
                ✈︎
              </motion.div>
              <p>{t('doc.sent')}</p>
              <button type="button" className="btn secondary" onClick={() => setSent(false)}>
                {t('doc.tabNew')}
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="doc-patient">{t('doc.choosePatient')}</label>
                <select id="doc-patient" className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                  <option value="">{t('doc.selectPatient')}</option>
                  {confirmed.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
              {templates && templates.length > 0 && (
                <div className="field">
                  <label htmlFor="doc-tpl">{t('doc.useTemplate')}</label>
                  <select
                    id="doc-tpl"
                    className="input"
                    value=""
                    onChange={(e) => {
                      const tpl = templates.find((x) => x.id === e.target.value);
                      if (!tpl) return;
                      setDraft(tpl.items.map((i) => ({ ...i, requiresPrescription: false })));
                      setInstructions(tpl.instructions ?? '');
                    }}
                  >
                    <option value="">—</option>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <MedicinePicker id="doc-med" label={t('dash.medicineSearch')} onPick={addItem} />
              {draft.map((d) => (
                <div key={d.medicineId} className="row between">
                  <span>
                    <strong>{d.name}</strong> <span className="muted small">{d.dosage}</span> <RxBadge rx={d.requiresPrescription} />
                  </span>
                  <span className="row">
                    <label className="sr-only" htmlFor={`q-${d.medicineId}`}>
                      {t('dash.quantity')}
                    </label>
                    <select
                      id={`q-${d.medicineId}`}
                      className="input input-sm"
                      value={d.quantity}
                      onChange={(e) =>
                        setDraft((all) => all.map((x) => (x.medicineId === d.medicineId ? { ...x, quantity: Number(e.target.value) } : x)))
                      }
                    >
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setDraft((all) => all.filter((x) => x.medicineId !== d.medicineId))}
                    >
                      {t('dash.remove')}
                    </button>
                  </span>
                </div>
              ))}
              <div className="field">
                <label htmlFor="doc-instr">{t('dash.instructions')}</label>
                <textarea id="doc-instr" className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  disabled={!patientId || draft.length === 0}
                  onClick={() =>
                    void run(() => api('/doctor/requests', { method: 'POST', body: { patientId, ...body() } })).then((ok) => {
                      if (ok) {
                        setSent(true);
                        setDraft([]);
                        setInstructions('');
                      }
                    })
                  }
                >
                  {t('doc.send')}
                </button>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160 }}
                  aria-label={t('doc.templateName')}
                  placeholder={t('doc.templateName')}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={draft.length === 0 || templateName.trim().length < 2}
                  onClick={() =>
                    void run(
                      () => api('/doctor/templates', { method: 'POST', body: { name: templateName, ...body() } }),
                      t('doc.templateSaved'),
                    ).then(() => setTemplateName(''))
                  }
                >
                  {t('doc.saveTemplate')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'templates' &&
        (!templates ? (
          <CardSkeleton />
        ) : templates.length === 0 ? (
          <Empty>{t('doc.noTemplates')}</Empty>
        ) : (
          templates.map((tpl) => (
            <div key={tpl.id} className="card row between">
              <span className="stack" style={{ gap: 2 }}>
                <strong>{tpl.name}</strong>
                <span className="muted small">{tpl.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</span>
                {tpl.instructions && <span className="small">{tpl.instructions}</span>}
              </span>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => void run(() => api(`/doctor/templates/${tpl.id}`, { method: 'DELETE' }))}
              >
                {t('dash.remove')}
              </button>
            </div>
          ))
        ))}

      {tab === 'history' &&
        (!history ? (
          <CardSkeleton />
        ) : history.length === 0 ? (
          <Empty>{t('doc.noHistory')}</Empty>
        ) : (
          history.map((r) => (
            <div key={r.id} className="card row between">
              <span className="stack" style={{ gap: 2 }}>
                <strong>{r.patientName}</strong>
                <span className="muted small">
                  {formatDateTime(r.createdAt, locale)} · {r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                </span>
              </span>
              <StatusBadge status={r.orderStatus ?? r.status} />
            </div>
          ))
        ))}
    </div>
  );
}

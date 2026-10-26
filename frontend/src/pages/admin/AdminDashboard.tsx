import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { FeatureSwitches } from '../../components/admin/FeatureSwitches';
import { WeeklySummary } from '../../components/admin/WeeklySummary';
import { Link } from 'react-router-dom';
import { specialityLabel, useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDateTime } from '../../lib/format';
import type { Medicine } from '../../lib/types';
import { Kpi, ReasonDialog, Tabs } from '../../components/dash';
import { m as motion } from 'framer-motion';
import { AnimatedNumber } from '../../components/motion';
import { duration, easeOut, stagger } from '../../motion';
import { CardSkeleton, Empty, ErrorBox, RxBadge, StatusBadge } from '../../components/ui';
import { AnalyticsPanel } from '../../components/admin/AnalyticsPanel';
import { IntegrationsPanel } from '../../components/admin/IntegrationsPanel';
import { FileManager } from '../../components/PrivateFiles';
import { MedicineReviews } from '../../components/admin/MedicineReviews';

type Tab =
  | 'verify'
  | 'reviews'
  | 'users'
  | 'pharmacies'
  | 'doctors'
  | 'medicines'
  | 'orders'
  | 'reports'
  | 'messages'
  | 'audit'
  | 'performance'
  | 'analytics';
type Row = Record<string, unknown>;

interface Stats {
  usersByRole: Record<string, number>;
  pendingVerifications: number;
  requestsToday: number;
  ordersByStatus: Record<string, number>;
  openReports: number;
  openContactMessages: number;
  pendingMedicines?: number;
  avgResponseMinutes7d: number | null;
}
interface Dialog {
  title: string;
  required: boolean;
  confirm: string;
  action: (reason: string) => Promise<unknown>;
  ok: string;
}

const FORMS = ['tablet', 'capsule', 'syrup', 'drops', 'cream', 'sachet', 'spray', 'inhaler', 'pen', 'lozenge'];
const str = (v: unknown) => (v == null ? '' : String(v));

/** Generic loader for one list endpoint. */
function useList<T = Row>(path: string, query?: Record<string, string | undefined>) {
  const [items, setItems] = useState<T[] | null>(null);
  const key = JSON.stringify(query ?? {});
  const load = useCallback(() => {
    void api<{ items: T[] }>(path, { query: JSON.parse(key) as Record<string, string> })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [path, key]);
  useEffect(load, [load]);
  return { items, load };
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const CHART_ORDER = ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

/** Orders by status: bars grow when the chart scrolls into view. */
function OrdersChart({ byStatus }: { byStatus: Record<string, number> }) {
  const { t } = useI18n();
  const max = Math.max(1, ...Object.values(byStatus));
  return (
    <section className="card stack" aria-labelledby="orders-chart">
      <h3 id="orders-chart" style={{ margin: 0 }}>
        {t('adm.ordersChart')}
      </h3>
      <div className="bar-chart" role="list">
        {CHART_ORDER.map((st, i) => {
          const n = byStatus[st] ?? 0;
          return (
            <div key={st} className="bar-col" role="listitem" aria-label={`${t(`status.${st}` as MessageKey)} : ${n}`}>
              <span className="bar-value">{n}</span>
              <motion.span
                className={`bar bar-${st}`}
                style={{ height: `${(n / max) * 100}%`, originY: 1 }}
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: duration.slow, ease: easeOut, delay: i * stagger }}
              />
              <span className="bar-label">{t(`status.${st}` as MessageKey)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AdminDashboard() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.staff?.staffRole ?? 'support';
  const canModerate = role === 'admin' || role === 'moderator';
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<Tab>('verify');
  // The reviewer's checklist per applicant: all three must be ticked before approving.
  const [ticks, setTicks] = useState<Record<string, { registry?: boolean; name?: boolean; document?: boolean }>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [userFilter, setUserFilter] = useState<{ role?: string; status?: string; q?: string }>({});
  const [medQ, setMedQ] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [editing, setEditing] = useState<Partial<Medicine> | null>(null);
  const [staffForm, setStaffForm] = useState({ email: '', password: '', fullName: '', staffRole: 'support' });
  const [categories, setCategories] = useState<string[]>([]);

  const loadStats = useCallback(() => {
    void api<Stats>('/admin/stats')
      .then(setStats)
      .catch(() => {});
  }, []);
  useEffect(loadStats, [loadStats]);
  useEffect(() => {
    void api<{ items: { category: string }[] }>('/medicines/categories')
      .then((r) => setCategories(r.items.map((c) => c.category)))
      .catch(() => {});
  }, []);

  const verifications = useList('/admin/verifications');
  const users = useList('/admin/users', userFilter);
  const pharmacies = useList('/admin/pharmacies');
  const doctors = useList('/admin/doctors');
  const medicines = useList<Medicine & { deletedAt: string | null }>('/admin/medicines', { q: medQ || undefined });
  const orders = useList('/admin/orders', { status: orderStatus || undefined });
  const reports = useList('/admin/reports');
  const [messageStatus, setMessageStatus] = useState<'open' | 'handled' | ''>('open');
  const messages = useList('/admin/contact-messages', { status: messageStatus || undefined });
  const audit = useList('/admin/audit');
  const performance = useList('/admin/performance');

  const refreshAll = () => {
    loadStats();
    for (const l of [verifications, users, pharmacies, doctors, medicines, reports, messages, audit, performance]) l.load();
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) toast(ok);
      refreshAll();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
      return false;
    }
  };
  const ask = (d: Dialog) => setDialog(d);

  const totalUsers = stats ? Object.values(stats.usersByRole).reduce((a, b) => a + b, 0) : 0;
  const activeOrders = stats
    ? Object.entries(stats.ordersByStatus)
        .filter(([k]) => !['delivered', 'cancelled'].includes(k))
        .reduce((a, [, v]) => a + v, 0)
    : 0;

  const saveMedicine = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const body = {
      cip13: editing.cip13,
      name: editing.name,
      activeSubstance: editing.activeSubstance,
      form: editing.form,
      dosage: editing.dosage,
      category: editing.category,
      requiresPrescription: !!editing.requiresPrescription,
      imageUrl: editing.imageUrl || null,
      description: editing.description ?? '',
      ageNote: editing.ageNote ?? '',
      descriptionEn: editing.descriptionEn ?? '',
      ageNoteEn: editing.ageNoteEn ?? '',
    };
    void run(
      () =>
        editing.id ? api(`/admin/medicines/${editing.id}`, { method: 'PATCH', body }) : api('/admin/medicines', { method: 'POST', body }),
      t('dash.saved'),
    ).then((ok) => ok && setEditing(null));
  };
  const medField = (k: keyof Medicine, label: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`m-${k}`}>{label}</label>
      <input
        id={`m-${k}`}
        className="input"
        type={type}
        value={str(editing?.[k])}
        onChange={(e) => setEditing((m) => ({ ...m, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>{t('adm.title')}</h1>
        <p className="muted small" style={{ margin: 0 }} data-testid="staff-role">
          {t('adm.roleNote', { role })}
        </p>
        <p className="small" style={{ margin: '6px 0 0' }}>
          <Link to="/admin/design">{t('ds.link')}</Link>
        </p>
      </div>
      {stats ? (
        <div className="grid cols-4">
          <Kpi
            label={t('adm.kpiPending')}
            value={<AnimatedNumber value={stats.pendingVerifications} />}
            tone={stats.pendingVerifications ? 'warn' : 'ok'}
          />
          <Kpi label={t('adm.kpiRequests')} value={<AnimatedNumber value={stats.requestsToday} />} tone="info" />
          <Kpi label={t('adm.kpiActiveOrders')} value={<AnimatedNumber value={activeOrders} />} tone="info" />
          <Kpi label={t('adm.kpiReports')} value={<AnimatedNumber value={stats.openReports} />} tone={stats.openReports ? 'warn' : 'ok'} />
          <Kpi
            label={t('adm.kpiMessages')}
            value={<AnimatedNumber value={stats.openContactMessages} />}
            tone={stats.openContactMessages ? 'info' : 'ok'}
          />
          <Kpi label={t('adm.kpiUsers')} value={<AnimatedNumber value={totalUsers} />} />
          <Kpi
            label={t('adm.kpiResponse')}
            value={stats.avgResponseMinutes7d != null ? t('ph.minutes', { n: stats.avgResponseMinutes7d }) : '—'}
          />
        </div>
      ) : (
        <CardSkeleton lines={2} />
      )}
      {stats && <OrdersChart byStatus={stats.ordersByStatus} />}
      {error && <ErrorBox message={error} />}
      <Tabs<Tab>
        label={t('adm.title')}
        value={tab}
        onChange={setTab}
        tabs={(
          [
            'verify',
            'reviews',
            'users',
            'pharmacies',
            'doctors',
            'medicines',
            'orders',
            'reports',
            'messages',
            'audit',
            'performance',
            'analytics',
          ] as const
        ).map((k) => ({
          key: k,
          label: t(`adm.tab${k === 'verify' ? 'Verify' : k.charAt(0).toUpperCase() + k.slice(1)}` as MessageKey),
        }))}
      />

      {tab === 'verify' &&
        (!verifications.items ? (
          <CardSkeleton />
        ) : verifications.items.length === 0 ? (
          <Empty>{t('adm.noPending')}</Empty>
        ) : (
          verifications.items.map((v) => (
            <div key={str(v.id)} className="card row between" data-testid="verification">
              <span className="stack" style={{ gap: 2 }}>
                <strong>{str(v.name)}</strong>
                <span className="muted small">
                  {t(v.kind === 'doctor' ? 'login.tabDoctor' : 'login.tabPharmacy')} · {t('adm.registry', { n: str(v.registryNumber) })} ·{' '}
                  {str(v.detail)} · {str(v.email)}
                </span>
                {v.rejectionReason ? <span className="badge bad">{str(v.rejectionReason)}</span> : null}
                <FileManager
                  readOnly
                  collapsed
                  title={t('files.verifStaff')}
                  listPath={`/admin/users/${str(v.id)}/files`}
                  testId="verification-docs"
                />
                {canModerate && (
                  <fieldset className="stack" style={{ gap: 4, border: 0, padding: 0, margin: '6px 0 0' }} data-testid="checklist">
                    <legend className="small muted">{t('adm.checklist')}</legend>
                    {(['registry', 'name', 'document'] as const).map((k) => (
                      <label key={k} className="check small">
                        <input
                          type="checkbox"
                          checked={!!ticks[str(v.id)]?.[k]}
                          onChange={(e) => setTicks((s) => ({ ...s, [str(v.id)]: { ...s[str(v.id)], [k]: e.target.checked } }))}
                        />
                        <span>{t(`adm.check.${k}` as MessageKey)}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </span>
              {canModerate && (
                <span className="row">
                  <button
                    type="button"
                    className="btn small"
                    disabled={!(ticks[str(v.id)]?.registry && ticks[str(v.id)]?.name && ticks[str(v.id)]?.document)}
                    onClick={() =>
                      void run(
                        () => api(`/admin/verify/${str(v.kind)}/${str(v.id)}`, { method: 'POST', body: { decision: 'approve' } }),
                        t('adm.approved'),
                      )
                    }
                  >
                    {t('adm.approve')}
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() =>
                      ask({
                        title: `${t('adm.reject')} — ${str(v.name)}`,
                        required: true,
                        confirm: t('adm.reject'),
                        ok: t('adm.rejected'),
                        action: (reason) =>
                          api(`/admin/verify/${str(v.kind)}/${str(v.id)}`, { method: 'POST', body: { decision: 'reject', reason } }),
                      })
                    }
                  >
                    {t('adm.reject')}
                  </button>
                </span>
              )}
            </div>
          ))
        ))}

      {tab === 'reviews' && <MedicineReviews canModerate={canModerate} onChanged={refreshAll} />}
      {tab === 'analytics' && (
        <>
          <WeeklySummary />
          <AnalyticsPanel />
          <FeatureSwitches canChange={role === 'admin'} />
          <IntegrationsPanel />
        </>
      )}

      {tab === 'users' && (
        <div className="stack">
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              aria-label={t('dash.search')}
              placeholder={t('dash.search')}
              onChange={(e) => setUserFilter((f) => ({ ...f, q: e.target.value || undefined }))}
            />
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label={t('dash.role')}
              onChange={(e) => setUserFilter((f) => ({ ...f, role: e.target.value || undefined }))}
            >
              <option value="">{t('dash.all')}</option>
              {['patient', 'doctor', 'pharmacy', 'staff'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label={t('dash.status')}
              onChange={(e) => setUserFilter((f) => ({ ...f, status: e.target.value || undefined }))}
            >
              <option value="">{t('dash.all')}</option>
              {['pending', 'active', 'suspended'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {!users.items ? (
            <CardSkeleton />
          ) : (
            <Table head={[t('dash.name'), t('dash.email'), t('dash.role'), t('dash.status'), t('dash.actions')]}>
              {users.items.map((u) => {
                const id = str(u.id);
                const canTouch = canModerate && id !== user?.id && (u.role !== 'staff' || isAdmin);
                return (
                  <tr key={id}>
                    <td>{str(u.name)}</td>
                    <td>{str(u.email)}</td>
                    <td>
                      {str(u.role)}
                      {u.staffRole ? ` (${str(u.staffRole)})` : ''}
                    </td>
                    <td>
                      <StatusBadge status={str(u.status)} /> {u.locked ? <span className="badge bad">{t('adm.locked')}</span> : null}
                    </td>
                    <td>
                      {canTouch &&
                        (u.status === 'suspended' ? (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() =>
                              ask({
                                title: `${t('adm.reactivate')} — ${str(u.email)}`,
                                required: true,
                                confirm: t('adm.reactivate'),
                                ok: t('dash.saved'),
                                action: (reason) => api(`/admin/users/${id}/reactivate`, { method: 'POST', body: { reason } }),
                              })
                            }
                          >
                            {t('adm.reactivate')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() =>
                              ask({
                                title: `${t('adm.suspend')} — ${str(u.email)}`,
                                required: true,
                                confirm: t('adm.suspend'),
                                ok: t('dash.saved'),
                                action: (reason) => api(`/admin/users/${id}/suspend`, { method: 'POST', body: { reason } }),
                              })
                            }
                          >
                            {t('adm.suspend')}
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          {isAdmin && (
            <form
              className="card stack"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api('/admin/staff', { method: 'POST', body: staffForm }), t('adm.staffCreated')).then(
                  (ok) => ok && setStaffForm({ email: '', password: '', fullName: '', staffRole: 'support' }),
                );
              }}
            >
              <h3 style={{ margin: 0 }}>{t('adm.createStaff')}</h3>
              <div className="grid cols-2">
                <input
                  className="input"
                  aria-label={t('adm.fullName')}
                  placeholder={t('adm.fullName')}
                  value={staffForm.fullName}
                  onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
                />
                <input
                  className="input"
                  type="email"
                  aria-label={t('login.email')}
                  placeholder={t('login.email')}
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                />
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  aria-label={t('login.password')}
                  placeholder={t('login.password')}
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                />
                <select
                  className="input"
                  aria-label={t('acc.staffRole')}
                  value={staffForm.staffRole}
                  onChange={(e) => setStaffForm({ ...staffForm, staffRole: e.target.value })}
                >
                  {['support', 'moderator', 'admin'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button className="btn" type="submit" disabled={!staffForm.email || !staffForm.password || !staffForm.fullName}>
                {t('adm.createStaff')}
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'pharmacies' &&
        (!pharmacies.items ? (
          <CardSkeleton />
        ) : (
          <Table head={[t('dash.name'), t('dash.city'), 'FINESS', t('dash.status'), t('adm.stockItems')]}>
            {pharmacies.items.map((p) => (
              <tr key={str(p.id)}>
                <td>{str(p.name)}</td>
                <td>{str(p.city)}</td>
                <td>{str(p.finess)}</td>
                <td>
                  <span className={`badge ${p.verified ? 'ok' : 'warn'}`}>{p.verified ? t('adm.verified') : t('adm.notVerified')}</span>{' '}
                  {p.paused ? <span className="badge warn">{t('adm.pausedBadge')}</span> : null} <StatusBadge status={str(p.status)} />
                </td>
                <td>{str(p.inStockItems)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'doctors' &&
        (!doctors.items ? (
          <CardSkeleton />
        ) : (
          <Table head={[t('dash.name'), 'RPPS', t('acc.speciality'), t('dash.status'), t('adm.patients')]}>
            {doctors.items.map((d) => (
              <tr key={str(d.id)}>
                <td>
                  Dr {str(d.firstName)} {str(d.lastName)}
                </td>
                <td>{str(d.rpps)}</td>
                <td>{specialityLabel(str(d.speciality), t)}</td>
                <td>
                  <span className={`badge ${d.verified ? 'ok' : 'warn'}`}>{d.verified ? t('adm.verified') : t('adm.notVerified')}</span>{' '}
                  <StatusBadge status={str(d.status)} />
                </td>
                <td>{str(d.confirmedPatients)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'medicines' && (
        <div className="stack">
          <div className="row">
            <input
              className="input"
              style={{ flex: 1 }}
              aria-label={t('dash.search')}
              placeholder={t('dash.search')}
              value={medQ}
              onChange={(e) => setMedQ(e.target.value)}
            />
            {canModerate && (
              <button
                type="button"
                className="btn"
                onClick={() => setEditing({ form: 'tablet', category: categories[0] ?? 'pain', requiresPrescription: false })}
              >
                {t('adm.newMedicine')}
              </button>
            )}
          </div>
          {editing && canModerate && (
            <form className="card stack" onSubmit={saveMedicine}>
              <h3 style={{ margin: 0 }}>{editing.id ? `${t('adm.editMedicine')} — ${editing.name}` : t('adm.newMedicine')}</h3>
              <div className="grid cols-2">
                {medField('name', t('dash.name'))}
                {medField('cip13', 'CIP13')}
                {medField('activeSubstance', t('med.substance'))}
                {medField('dosage', t('med.dosage'))}
                <div className="field">
                  <label htmlFor="m-form">{t('med.form')}</label>
                  <select
                    id="m-form"
                    className="input"
                    value={str(editing.form)}
                    onChange={(e) => setEditing((m) => ({ ...m, form: e.target.value }))}
                  >
                    {FORMS.map((f) => (
                      <option key={f} value={f}>
                        {t(`form.${f}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="m-cat">{t('adm.category')}</label>
                  <select
                    id="m-cat"
                    className="input"
                    value={str(editing.category)}
                    onChange={(e) => setEditing((m) => ({ ...m, category: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {t(`cat.${c}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </div>
                {medField('imageUrl', t('adm.imageUrl'), 'url')}
                {medField('ageNote', t('adm.ageNote'))}
                {medField('ageNoteEn', t('adm.ageNoteEn'))}
              </div>
              <div className="field">
                <label htmlFor="m-desc">{t('adm.description')}</label>
                <textarea
                  id="m-desc"
                  className="input"
                  value={str(editing.description)}
                  onChange={(e) => setEditing((m) => ({ ...m, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="m-desc-en">{t('adm.descriptionEn')}</label>
                <textarea
                  id="m-desc-en"
                  className="input"
                  value={str(editing.descriptionEn)}
                  onChange={(e) => setEditing((m) => ({ ...m, descriptionEn: e.target.value }))}
                />
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!editing.requiresPrescription}
                  onChange={(e) => setEditing((m) => ({ ...m, requiresPrescription: e.target.checked }))}
                />
                <span>{t('adm.rx')}</span>
              </label>
              <div className="row">
                <button className="btn" type="submit">
                  {t('common.save')}
                </button>
                <button className="btn ghost" type="button" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
          {!medicines.items ? (
            <CardSkeleton />
          ) : (
            <Table head={[t('dash.name'), 'CIP13', t('adm.category'), t('dash.actions')]}>
              {medicines.items.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name} <span className="muted small">{m.dosage}</span> <RxBadge rx={m.requiresPrescription} />
                  </td>
                  <td>{m.cip13}</td>
                  <td>{t(`cat.${m.category}` as MessageKey)}</td>
                  <td>
                    {canModerate && (
                      <span className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn ghost small" onClick={() => setEditing(m)}>
                          {t('adm.editMedicine')}
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() =>
                            ask({
                              title: `${t('adm.deleteMedicine')} — ${m.name}`,
                              required: true,
                              confirm: t('adm.deleteMedicine'),
                              ok: t('dash.saved'),
                              action: (reason) => api(`/admin/medicines/${m.id}`, { method: 'DELETE', body: { reason } }),
                            })
                          }
                        >
                          {t('adm.deleteMedicine')}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="stack">
          <select
            className="input"
            style={{ width: 'auto' }}
            aria-label={t('dash.status')}
            value={orderStatus}
            onChange={(e) => setOrderStatus(e.target.value)}
          >
            <option value="">{t('dash.all')}</option>
            {['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
          {!orders.items ? (
            <CardSkeleton />
          ) : (
            <Table head={[t('dash.date'), t('order.pharmacy'), t('dash.patient'), t('dash.items'), t('dash.status'), t('pay.title')]}>
              {orders.items.map((o) => (
                <tr key={str(o.id)}>
                  <td>{formatDateTime(str(o.createdAt), locale)}</td>
                  <td>{str(o.pharmacyName)}</td>
                  <td>{str(o.patientName)}</td>
                  <td>{str(o.itemCount)}</td>
                  <td>
                    <StatusBadge status={str(o.status)} />
                  </td>
                  <td data-testid="admin-order-payment">
                    {o.paymentStatus ? t(`pay.status.${str(o.paymentStatus)}` as MessageKey) : t('pay.status.none')}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === 'reports' &&
        (!reports.items ? (
          <CardSkeleton />
        ) : reports.items.length === 0 ? (
          <Empty>{t('dash.empty')}</Empty>
        ) : (
          reports.items.map((r) => (
            <div key={str(r.id)} className="card stack">
              <div className="row between">
                <strong>{str(r.subject)}</strong>
                <span className={`badge ${r.status === 'open' ? 'warn' : 'ok'}`}>
                  {r.status === 'open' ? t('adm.open') : t('adm.closed')}
                </span>
              </div>
              <p style={{ margin: 0 }}>{str(r.message)}</p>
              {r.targetText ? (
                <blockquote className="alert info small" style={{ margin: 0 }} data-testid="report-target">
                  <strong>{t(r.targetType === 'review' ? 'adm.targetReview' : 'adm.targetMessage')} :</strong> {str(r.targetText)}{' '}
                  {r.targetHidden ? <span className="badge bad">{t('adm.hidden')}</span> : null}
                </blockquote>
              ) : null}
              {!!r.targetText && canModerate && (
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ alignSelf: 'flex-start' }}
                  data-testid="toggle-hidden"
                  onClick={() =>
                    ask({
                      title: `${t(r.targetHidden ? 'adm.show' : 'adm.hide')} — ${str(r.subject)}`,
                      required: true,
                      confirm: t(r.targetHidden ? 'adm.show' : 'adm.hide'),
                      ok: t('adm.moderated'),
                      action: (reason) =>
                        api(`/admin/moderation/${str(r.targetType)}/${str(r.targetId)}`, {
                          method: 'POST',
                          body: { hidden: !r.targetHidden, reason },
                        }),
                    })
                  }
                >
                  {t(r.targetHidden ? 'adm.show' : 'adm.hide')}
                </button>
              )}
              <span className="muted small">
                {str(r.reporterRole)} · {str(r.reporterEmail)} · {formatDateTime(str(r.createdAt), locale)}
              </span>
              {r.resolution ? <span className="small">→ {str(r.resolution)}</span> : null}
              {r.status === 'open' && (
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    ask({
                      title: `${t('adm.resolve')} — ${str(r.subject)}`,
                      required: true,
                      confirm: t('adm.resolve'),
                      ok: t('adm.resolved'),
                      action: (resolution) => api(`/admin/reports/${str(r.id)}/resolve`, { method: 'POST', body: { resolution } }),
                    })
                  }
                >
                  {t('adm.resolve')}
                </button>
              )}
            </div>
          ))
        ))}

      {tab === 'messages' && (
        <div className="stack" data-testid="contact-messages">
          <div className="row">
            <label className="sr-only" htmlFor="msg-status">
              {t('dash.status')}
            </label>
            <select
              id="msg-status"
              className="input"
              style={{ width: 'auto' }}
              value={messageStatus}
              onChange={(e) => setMessageStatus(e.target.value as 'open' | 'handled' | '')}
            >
              <option value="open">{t('adm.msgOpen')}</option>
              <option value="handled">{t('adm.msgHandled')}</option>
              <option value="">{t('adm.msgAll')}</option>
            </select>
          </div>
          {!messages.items ? (
            <CardSkeleton />
          ) : messages.items.length === 0 ? (
            <Empty>{t('dash.empty')}</Empty>
          ) : (
            messages.items.map((m) => (
              <article key={str(m.id)} className="card stack" data-testid="contact-message">
                <div className="row between">
                  <strong>{str(m.subject)}</strong>
                  <span className={`badge ${m.handledAt ? 'ok' : 'info'}`}>{m.handledAt ? t('adm.msgHandled') : t('adm.msgOpen')}</span>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{str(m.message)}</p>
                <span className="muted small">
                  {str(m.name)} · {str(m.email)} · {t(`pub.contact.topic.${str(m.topic)}` as MessageKey)} · {str(m.language).toUpperCase()}{' '}
                  · {formatDateTime(str(m.createdAt), locale)}
                </span>
                {m.handledAt ? (
                  <span className="small muted">{t('adm.msgHandledBy', { who: str(m.handledBy) })}</span>
                ) : (
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void run(() => api(`/admin/contact-messages/${str(m.id)}/handle`, { method: 'POST' }), t('adm.msgDone'))}
                  >
                    {t('adm.msgMark')}
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {tab === 'audit' &&
        (!audit.items ? (
          <CardSkeleton />
        ) : (
          <Table head={[t('dash.date'), t('adm.actor'), t('adm.action'), t('adm.target'), t('dash.reason')]}>
            {audit.items.map((a) => (
              <tr key={str(a.id)}>
                <td>{formatDateTime(str(a.createdAt), locale)}</td>
                <td>
                  {str(a.actorName)} <span className="muted small">{str(a.actorRole)}</span>
                </td>
                <td>{str(a.action)}</td>
                <td className="small">{str(a.target)}</td>
                <td>{str(a.reason)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'performance' &&
        (!performance.items ? (
          <CardSkeleton />
        ) : (
          <Table
            head={[
              t('dash.name'),
              t('adm.received'),
              t('ph.sumAccepted'),
              t('ph.sumRefused'),
              t('ph.sumExpired'),
              t('adm.acceptRate'),
              t('adm.avgResponse'),
              t('adm.activeOrders'),
            ]}
          >
            {performance.items.map((p) => (
              <tr key={str(p.id)}>
                <td>
                  {str(p.name)} <span className="muted small">{str(p.city)}</span>
                </td>
                <td>{str(p.received)}</td>
                <td>{str(p.accepted)}</td>
                <td>{str(p.refused)}</td>
                <td>{str(p.expired)}</td>
                <td>{p.acceptanceRate != null ? `${str(p.acceptanceRate)} %` : '—'}</td>
                <td>{p.avgResponseMinutes != null ? t('ph.minutes', { n: str(p.avgResponseMinutes) }) : '—'}</td>
                <td>{str(p.activeOrders)}</td>
              </tr>
            ))}
          </Table>
        ))}

      {dialog && (
        <ReasonDialog
          title={dialog.title}
          required={dialog.required}
          confirmLabel={dialog.confirm}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            const d = dialog;
            setDialog(null);
            void run(() => d.action(reason), d.ok);
          }}
        />
      )}
    </div>
  );
}

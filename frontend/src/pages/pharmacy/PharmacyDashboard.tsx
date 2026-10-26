import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDateTime, formatPrice, formatTime } from '../../lib/format';
import type { OrderStatus } from '../../lib/types';
import { CountdownRing, Kpi, MedicinePicker, ReasonDialog, Tabs, type MedicineHit } from '../../components/dash';
import { CardSkeleton, Empty, ErrorBox, RxBadge, StatusBadge } from '../../components/ui';
import { ShelfVisual, useCan3D } from '../../components/three/ThreeVisuals';
import { PackImage } from '../../components/PackImage';
import { ProposeMedicine } from '../../components/pharmacy/ProposeMedicine';
import { ActivityTab, TeamTab } from '../../components/pharmacy/TeamPanel';
import { BarcodeScan } from '../../components/pharmacy/BarcodeScan';
import { OnboardingTour } from '../../components/Tour';
import { ProfileTab } from '../../components/pharmacy/ProfileTab';
import { TodayBoard } from '../../components/pharmacy/TodayBoard';
import { FileManager } from '../../components/PrivateFiles';
import { OrderMessages } from '../../components/OrderMessages';
import { AnimatePresence, m as motion } from 'framer-motion';
import { AnimatedNumber, Pop } from '../../components/motion';
import { duration, easeOut } from '../../motion';

interface IncomingItem {
  id: string;
  medicineId: string;
  name: string;
  dosage: string;
  form: string;
  category: string;
  requiresPrescription: boolean;
  quantity: number;
  excluded: boolean;
  inStock: number;
}
interface Incoming {
  id: string;
  status: string;
  source: 'patient' | 'doctor';
  instructions: string | null;
  hasPrescriptionNote: boolean;
  createdAt: string;
  sentAt: string;
  answerBy: string;
  patientName: string;
  items: IncomingItem[];
}
interface PharmacyOrder {
  id: string;
  slotStart?: string | null;
  slotMode?: 'pickup' | 'delivery' | null;
  requestId: string;
  status: OrderStatus;
  createdAt: string;
  cancelRequestedAt: string | null;
  paymentStatus?: string | null;
  patientName: string;
  source: 'patient' | 'doctor';
  instructions: string | null;
  items: {
    id: string;
    name: string;
    dosage: string;
    form: string;
    category: string;
    quantity: number;
    excluded: boolean;
    requiresPrescription: boolean;
    priceEur: number | null;
  }[];
  history: { status: OrderStatus; changedAt: string }[];
}
interface StockRow {
  medicineId: string;
  cip13: string;
  name: string;
  dosage: string;
  form: string;
  category: string;
  requiresPrescription: boolean;
  quantity: number;
  priceEur: number;
  lowStockThreshold: number;
  low: boolean;
}
interface HistoryRow {
  id: number;
  name: string;
  oldQty: number | null;
  newQty: number;
  reason: string;
  changedAt: string;
}
interface CsvRow {
  line: number;
  cip13: string;
  name: string | null;
  oldQuantity: number | null;
  quantity: number | null;
  priceEur: number | null;
  error: string | null;
}

/** Valid next statuses (mirrors the server's NEXT_STATUS; the server still checks every move). */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

type Tab = 'incoming' | 'orders' | 'today' | 'inventory' | 'summary' | 'activity' | 'profile' | 'team';
const ORDER_STEPS: OrderStatus[] = ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

function useRun() {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setError(null);
      try {
        await fn();
        if (ok) toast(ok);
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t('common.error'));
        return false;
      }
    },
    [t, toast],
  );
  return { error, run, setError };
}

function IncomingTab({ onChange }: { onChange: () => void }) {
  const { t, locale } = useI18n();
  const { error, run } = useRun();
  const [items, setItems] = useState<Incoming[] | null>(null);
  const [refuseId, setRefuseId] = useState<string | null>(null);
  const [generic, setGeneric] = useState<{
    requestId: string;
    itemId: string;
    options: { id: string; name: string; dosage: string }[];
  } | null>(null);

  const load = useCallback(
    () =>
      api<{ items: Incoming[] }>('/pharmacy/incoming')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  const after = async () => {
    await load();
    onChange();
  };

  const openGeneric = async (requestId: string, item: IncomingItem) => {
    const r = await api<{ generics: { id: string; name: string; dosage: string }[] }>(`/medicines/${item.medicineId}`);
    setGeneric({ requestId, itemId: item.id, options: r.generics });
  };

  if (!items) return <CardSkeleton lines={4} />;
  return (
    <div className="stack">
      {error && <ErrorBox message={error} />}
      {items.length === 0 && <Empty>{t('ph.noIncoming')}</Empty>}
      <AnimatePresence initial={false}>
        {items.map((r) => (
          <motion.article
            key={r.id}
            className="card stack incoming-card glow-in"
            data-testid="incoming-request"
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0, transition: { duration: duration.base, ease: easeOut } }}
            exit={{ opacity: 0, rotateX: 75, y: -16, transition: { duration: duration.base, ease: easeOut } }}
            style={{ transformPerspective: 800 }}
          >
            <div className="row between">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{r.patientName}</strong>
                <span className="muted small">
                  {formatDateTime(r.sentAt, locale)} · {t('ph.answerIn', { time: formatTime(r.answerBy, locale) })}
                </span>
              </div>
              {r.status === 'awaiting_patient_approval' ? (
                <span className="badge warn">{t('ph.waitingPatient')}</span>
              ) : (
                <CountdownRing until={r.answerBy} />
              )}
            </div>
            <FileManager
              readOnly
              collapsed
              title={t('files.rxPharmacy')}
              listPath={`/pharmacy/requests/${r.id}/files`}
              testId="rx-files-pharmacy"
            />
            <div className="row" style={{ gap: 6 }}>
              {r.source === 'doctor' && <span className="badge info">{t('dash.fromDoctor')}</span>}
              {r.hasPrescriptionNote && <span className="badge info">{t('dash.prescriptionStated')}</span>}
            </div>
            <ul className="plain-list">
              {r.items.map((i) => (
                <li key={i.id} className="row between" style={{ opacity: i.excluded ? 0.5 : 1 }}>
                  <span>
                    <span className="thumb">
                      <PackImage name={i.name} dosage={i.dosage} form={i.form} category={i.category} rx={i.requiresPrescription} />
                    </span>
                    <strong>
                      {i.quantity} × {i.name}
                    </strong>{' '}
                    <span className={`badge ${i.inStock >= i.quantity ? 'ok' : 'bad'}`}>{t('ph.inStock', { n: i.inStock })}</span>{' '}
                    <RxBadge rx={i.requiresPrescription} />
                  </span>
                  {!i.excluded && r.status === 'sent_to_pharmacy' && (
                    <button type="button" className="btn ghost small" onClick={() => void openGeneric(r.id, i)}>
                      {t('ph.proposeGeneric')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {r.instructions && (
              <p className="small">
                <strong>{t('dash.instructions')} :</strong> {r.instructions}
              </p>
            )}
            {r.status === 'sent_to_pharmacy' && (
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void run(() => api(`/pharmacy/requests/${r.id}/accept`, { method: 'POST' }), t('ph.accepted')).then(after)}
                >
                  {t('ph.accept')}
                </button>
                <button type="button" className="btn secondary" onClick={() => setRefuseId(r.id)}>
                  {t('ph.refuse')}
                </button>
              </div>
            )}
          </motion.article>
        ))}
      </AnimatePresence>
      {refuseId && (
        <ReasonDialog
          title={t('ph.refuse')}
          required={false}
          confirmLabel={t('ph.refuse')}
          onClose={() => setRefuseId(null)}
          onConfirm={(reason) => {
            const id = refuseId;
            setRefuseId(null);
            void run(
              () => api(`/pharmacy/requests/${id}/refuse`, { method: 'POST', body: { reason: reason || null } }),
              t('ph.refused'),
            ).then(after);
          }}
        />
      )}
      {generic && (
        <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setGeneric(null)}>
          <div className="sheet stack" role="dialog" aria-modal="true" aria-label={t('ph.chooseGeneric')}>
            <h2>{t('ph.chooseGeneric')}</h2>
            {generic.options.length === 0 && <p className="muted">{t('ph.noGeneric')}</p>}
            {generic.options.map((g) => (
              <button
                key={g.id}
                type="button"
                className="btn secondary"
                onClick={() => {
                  const g0 = generic;
                  setGeneric(null);
                  void run(
                    () =>
                      api(`/pharmacy/requests/${g0.requestId}/substitutions`, {
                        method: 'POST',
                        body: { itemId: g0.itemId, proposedMedicineId: g.id },
                      }),
                    t('ph.proposed'),
                  ).then(after);
                }}
              >
                {g.name} · {g.dosage}
              </button>
            ))}
            <button type="button" className="btn ghost" onClick={() => setGeneric(null)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ o, onDone }: { o: PharmacyOrder; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { error, run } = useRun();
  const [checked, setChecked] = useState(false);
  const next = NEXT_STATUS[o.status];
  const forward = next.find((s) => s !== 'cancelled');
  const needsRx = o.status === 'accepted' && o.items.some((i) => i.requiresPrescription && !i.excluded);
  const move = (status: OrderStatus) =>
    void run(
      () => api(`/pharmacy/orders/${o.id}/status`, { method: 'PATCH', body: { status, prescriptionChecked: checked } }),
      t('ph.statusUpdated', { status: t(`status.${status}` as MessageKey) }),
    ).then(onDone);
  return (
    <article className="card stack" data-testid="pharmacy-order">
      <div className="order-progress" aria-hidden="true">
        <motion.span
          initial={false}
          animate={{ scaleX: o.status === 'cancelled' ? 0 : ORDER_STEPS.indexOf(o.status) / (ORDER_STEPS.length - 1) }}
          transition={{ duration: duration.slow, ease: easeOut }}
        />
      </div>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <strong>{o.patientName}</strong>
          <span className="muted small">{formatDateTime(o.createdAt, locale)}</span>
          {o.slotStart && (
            <span className="badge info" data-testid="order-slot">
              {t(o.slotMode === 'delivery' ? 'slot.badgeDelivery' : 'slot.badgePickup', { when: formatDateTime(o.slotStart, locale) })}
            </span>
          )}
        </div>
        <span className="row" style={{ gap: 8 }}>
          {o.paymentStatus && (
            <span className="badge info" data-testid="order-payment">
              {t(`pay.status.${o.paymentStatus}` as MessageKey)}
            </span>
          )}
          <StatusBadge status={o.status} />
          {o.status === 'ready' && (
            <Link to={`/pickup/${o.id}`} className="btn small" data-testid="pickup-link">
              {t('pickup.open')}
            </Link>
          )}
          <Link to={`/orders/${o.id}/print`} className="btn secondary small" data-testid="print-slip">
            {t('order.print')}
          </Link>
        </span>
      </div>
      <ul className="plain-list">
        {o.items.map((i) => (
          <li key={i.id} style={{ opacity: i.excluded ? 0.5 : 1 }}>
            <span className="thumb">
              <PackImage name={i.name} dosage={i.dosage} form={i.form} category={i.category} rx={i.requiresPrescription} />
            </span>
            {i.quantity} × {i.name} {i.excluded && <span className="badge warn">{t('requests.excluded')}</span>}{' '}
            <RxBadge rx={i.requiresPrescription} />
          </li>
        ))}
      </ul>
      <FileManager
        readOnly
        collapsed
        title={t('files.rxPharmacy')}
        listPath={`/pharmacy/requests/${o.requestId}/files`}
        testId="rx-files-order"
      />
      <OrderMessages orderId={o.id} side="pharmacy" collapsed />
      {o.instructions && (
        <p className="small">
          <strong>{t('dash.instructions')} :</strong> {o.instructions}
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {o.cancelRequestedAt && next.length > 0 && (
        <div className="alert warn row between">
          <span>{t('ph.cancelRequested')}</span>
          <span className="row">
            <button
              type="button"
              className="btn small"
              onClick={() =>
                void run(() => api(`/pharmacy/orders/${o.id}/cancellation`, { method: 'POST', body: { approve: true } })).then(onDone)
              }
            >
              {t('ph.approveCancel')}
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() =>
                void run(() => api(`/pharmacy/orders/${o.id}/cancellation`, { method: 'POST', body: { approve: false } })).then(onDone)
              }
            >
              {t('ph.declineCancel')}
            </button>
          </span>
        </div>
      )}
      {needsRx && (
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t('ph.prescriptionChecked')}</span>
        </label>
      )}
      {next.length > 0 && (
        <div className="row">
          {forward && (
            <button type="button" className="btn" disabled={needsRx && !checked} onClick={() => move(forward)} data-testid="order-next">
              {t('ph.moveTo', { status: t(`status.${forward}` as MessageKey) })}
            </button>
          )}
          <button type="button" className="btn secondary" onClick={() => move('cancelled')}>
            {t('ph.cancelOrder')}
          </button>
        </div>
      )}
    </article>
  );
}

function OrdersTab() {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const [items, setItems] = useState<PharmacyOrder[] | null>(null);
  const load = useCallback(
    () =>
      api<{ items: PharmacyOrder[] }>('/pharmacy/orders', { query: { scope: all ? 'all' : 'active' } })
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [all],
  );
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span>{t('ph.showAll')}</span>
      </label>
      {!items ? (
        <CardSkeleton lines={4} />
      ) : items.length === 0 ? (
        <Empty>{t('ph.noOrders')}</Empty>
      ) : (
        items.map((o) => <OrderCard key={o.id} o={o} onDone={() => void load()} />)
      )}
    </div>
  );
}

function StockLine({ row, onSaved, onHistory }: { row: StockRow; onSaved: () => void; onHistory: () => void }) {
  const { t } = useI18n();
  const { error, run } = useRun();
  const [qty, setQty] = useState(String(row.quantity));
  const [price, setPrice] = useState(String(row.priceEur));
  const [low, setLow] = useState(String(row.lowStockThreshold));
  const dirty = qty !== String(row.quantity) || price !== String(row.priceEur) || low !== String(row.lowStockThreshold);
  const save = () =>
    void run(
      () =>
        api(`/pharmacy/inventory/${row.medicineId}`, {
          method: 'PUT',
          body: { quantity: Number(qty), priceEur: Number(price.replace(',', '.')), lowStockThreshold: Number(low) },
        }),
      t('dash.saved'),
    ).then((ok) => ok && onSaved());
  return (
    <tr className={row.low ? 'row-low' : ''} data-testid="stock-row">
      <td>
        <span className="thumb">
          <PackImage name={row.name} dosage={row.dosage} form={row.form} category={row.category} rx={row.requiresPrescription} />
        </span>
        <strong>{row.name}</strong>
        <div className="muted small">
          {row.cip13} <RxBadge rx={row.requiresPrescription} />
        </div>
        {error && <div className="field-error">{error}</div>}
      </td>
      <td>
        <input
          className="input input-sm"
          aria-label={`${t('dash.quantity')} ${row.name}`}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        {row.low && <span className="badge warn">{t('med.lowStock')}</span>}
      </td>
      <td>
        <input
          className="input input-sm"
          aria-label={`${t('ph.price')} ${row.name}`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td>
        <input
          className="input input-sm"
          aria-label={`${t('ph.threshold')} ${row.name}`}
          inputMode="numeric"
          value={low}
          onChange={(e) => setLow(e.target.value)}
        />
      </td>
      <td>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn small" disabled={!dirty} onClick={save}>
            {t('common.save')}
          </button>
          <button type="button" className="btn ghost small" onClick={onHistory}>
            {t('ph.history')}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              void run(() => api(`/pharmacy/inventory/${row.medicineId}`, { method: 'DELETE' }), t('dash.saved')).then(
                (ok) => ok && onSaved(),
              )
            }
          >
            {t('dash.remove')}
          </button>
        </div>
      </td>
    </tr>
  );
}

function InventoryTab({ onChange }: { onChange: () => void }) {
  const { t, locale } = useI18n();
  const { error, run } = useRun();
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adding, setAdding] = useState<MedicineHit | null>(null);
  const [addQty, setAddQty] = useState('10');
  const [addPrice, setAddPrice] = useState('');
  const [history, setHistory] = useState<{ name: string; items: HistoryRow[] } | null>(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ rows: CsvRow[]; errors: number } | null>(null);
  const [view, setView] = useState<'table' | 'shelf'>('table');
  const can3D = useCan3D('shelf', 2);

  const load = useCallback(
    () =>
      api<{ items: StockRow[] }>('/pharmacy/inventory', { query: { low: lowOnly ? '1' : undefined, q: q || undefined } })
        .then((r) => setRows(r.items))
        .catch(() => setRows([])),
    [lowOnly, q],
  );
  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);
  const reload = () => {
    void load();
    onChange();
  };

  return (
    <div className="stack">
      {error && <ErrorBox message={error} />}
      <section className="card stack">
        <h3>{t('ph.addMedicine')}</h3>
        {adding ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  api(`/pharmacy/inventory/${adding.id}`, {
                    method: 'PUT',
                    body: { quantity: Number(addQty), priceEur: Number(addPrice.replace(',', '.')), lowStockThreshold: 5 },
                  }),
                t('dash.saved'),
              ).then((ok) => {
                if (ok) {
                  setAdding(null);
                  setAddPrice('');
                  reload();
                }
              });
            }}
          >
            <strong>
              {adding.name} {adding.dosage}
            </strong>
            <input
              className="input input-sm"
              aria-label={t('dash.quantity')}
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              inputMode="numeric"
            />
            <input
              className="input input-sm"
              aria-label={t('ph.price')}
              placeholder={t('ph.price')}
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              inputMode="decimal"
            />
            <button className="btn small" type="submit" disabled={!addPrice}>
              {t('dash.add')}
            </button>
            <button className="btn ghost small" type="button" onClick={() => setAdding(null)}>
              {t('common.cancel')}
            </button>
          </form>
        ) : (
          <MedicinePicker id="stock-add" label={t('dash.medicineSearch')} onPick={setAdding} />
        )}
      </section>

      <ProposeMedicine onSaved={reload} />

      <div className="row between">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span className="sr-only">{t('dash.search')}</span>
          <input className="input" placeholder={t('dash.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <BarcodeScan onCode={setQ} />
        <label className="check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          <span>{t('ph.lowOnly')}</span>
        </label>
      </div>
      {can3D && (
        <Tabs<'table' | 'shelf'>
          label={t('ph.viewLabel')}
          value={view}
          onChange={setView}
          tabs={[
            { key: 'table', label: t('ph.viewTable') },
            { key: 'shelf', label: t('ph.viewShelf') },
          ]}
        />
      )}
      {can3D && view === 'shelf' && rows && (
        <ShelfVisual items={rows.map((r) => ({ id: r.medicineId, name: r.name, quantity: r.quantity, low: r.low }))} />
      )}
      <div className="card table-wrap" hidden={can3D && view === 'shelf'}>
        {!rows ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <p className="muted">{t('dash.empty')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('dash.name')}</th>
                <th>{t('dash.quantity')}</th>
                <th>{t('ph.price')}</th>
                <th>{t('ph.threshold')}</th>
                <th>{t('dash.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <StockLine
                  key={`${r.medicineId}-${r.quantity}-${r.priceEur}-${r.lowStockThreshold}`}
                  row={r}
                  onSaved={reload}
                  onHistory={() =>
                    void api<{ items: HistoryRow[] }>('/pharmacy/inventory/history', { query: { medicineId: r.medicineId } }).then((h) =>
                      setHistory({ name: r.name, items: h.items }),
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {history && (
        <section className="card stack" aria-live="polite">
          <div className="row between">
            <h3 style={{ margin: 0 }}>{t('ph.historyFor', { name: history.name })}</h3>
            <button type="button" className="btn ghost small" onClick={() => setHistory(null)}>
              {t('common.close')}
            </button>
          </div>
          {history.items.length === 0 && <p className="muted">{t('dash.empty')}</p>}
          {history.items.map((h) => (
            <div key={h.id} className="row between small">
              <span>
                {h.oldQty ?? '—'} → <strong>{h.newQty}</strong> · {t(`ph.reason.${h.reason}` as MessageKey)}
              </span>
              <span className="muted">{formatDateTime(h.changedAt, locale)}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h3>{t('ph.csvTitle')}</h3>
        <p className="muted small">{t('ph.csvHint')}</p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label={t('ph.csvTitle')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then(setCsv);
          }}
        />
        <textarea
          className="input"
          rows={4}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          aria-label="CSV"
          style={{ fontFamily: 'monospace' }}
        />
        <div className="row">
          <button
            type="button"
            className="btn secondary"
            disabled={!csv.trim()}
            onClick={() =>
              void run(async () =>
                setPreview(
                  await api<{ rows: CsvRow[]; errors: number }>('/pharmacy/inventory/csv', { method: 'POST', body: { csv, dryRun: true } }),
                ),
              )
            }
          >
            {t('ph.csvPreview')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!preview || preview.errors > 0}
            onClick={() =>
              void run(
                async () => {
                  const r = await api<{ applied: number }>('/pharmacy/inventory/csv', { method: 'POST', body: { csv, dryRun: false } });
                  setPreview(null);
                  setCsv('');
                  reload();
                  return r;
                },
                t('ph.csvApplied', { n: preview?.rows.length ?? 0 }),
              )
            }
          >
            {t('ph.csvApply')}
          </button>
        </div>
        {preview && (
          <div className="table-wrap">
            {preview.errors > 0 && <div className="alert error">{t('ph.csvErrors', { n: preview.errors })}</div>}
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ph.csvLine')}</th>
                  <th>CIP13</th>
                  <th>{t('dash.name')}</th>
                  <th>{t('dash.quantity')}</th>
                  <th>{t('ph.price')}</th>
                  <th>{t('dash.status')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.cip13}</td>
                    <td>{r.name ?? '—'}</td>
                    <td>
                      {r.oldQuantity ?? '—'} → {r.quantity ?? '—'}
                    </td>
                    <td>{r.priceEur != null ? formatPrice(r.priceEur, locale) : '—'}</td>
                    <td>{r.error ? <span className="badge bad">{r.error}</span> : <span className="badge ok">{t('ph.csvRowOk')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

interface Summary {
  received: number;
  accepted: number;
  refused: number;
  expired: number;
  pending: number;
  avgResponseMinutes: number | null;
  activeOrders: number;
  lowStock: number;
}

export function PharmacyDashboard() {
  const { t, locale } = useI18n();
  const { user, refresh } = useAuth();
  const { error, run } = useRun();
  const role = user?.memberRole ?? 'owner';
  const [tab, setTab] = useState<Tab>(role === 'assistant' ? 'orders' : 'incoming');
  const allowedTabs: Tab[] =
    role === 'assistant'
      ? ['orders', 'today', 'summary']
      : role === 'pharmacist'
        ? ['incoming', 'orders', 'today', 'inventory', 'summary', 'activity', 'profile']
        : ['incoming', 'orders', 'today', 'inventory', 'summary', 'activity', 'profile', 'team'];
  const [summary, setSummary] = useState<Summary | null>(null);
  const loadSummary = useCallback(
    () =>
      api<Summary>('/pharmacy/summary')
        .then(setSummary)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void loadSummary();
    const id = setInterval(() => void loadSummary(), 15_000);
    return () => clearInterval(id);
  }, [loadSummary]);
  const paused = !!user?.pharmacy?.paused;
  // Other panels (the board) can ask to open a tab.
  useEffect(() => {
    const go = (e: Event) => {
      const to = (e as CustomEvent<Tab>).detail;
      if (allowedTabs.includes(to)) setTab(to);
    };
    window.addEventListener('counter:tab', go);
    return () => window.removeEventListener('counter:tab', go);
  });

  return (
    <div className="stack" style={{ gap: 20 }}>
      {role !== 'assistant' && <OnboardingTour role="pharmacy" />}
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 4 }}>{user?.pharmacy?.name ?? t('ph.title')}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {t('ph.title')}
          </p>
        </div>
        {role === 'owner' && (
          <label className="check switch">
            <input
              type="checkbox"
              checked={paused}
              onChange={(e) =>
                void run(() => api('/pharmacy/settings', { method: 'PATCH', body: { paused: e.target.checked } }).then(refresh))
              }
              data-testid="pause-switch"
            />
            <span>{t('ph.paused')}</span>
          </label>
        )}
      </div>
      {role !== 'assistant' && !paused && (
        <label className="row small" style={{ gap: 8 }}>
          {t('ph.break')}
          <select
            className="input"
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (minutes) void run(() => api('/pharmacy/settings', { method: 'PATCH', body: { breakMinutes: minutes } }).then(refresh));
            }}
            data-testid="break-select"
          >
            <option value="">{t('ph.breakChoose')}</option>
            {[15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {t('ph.minutes', { n: m })}
              </option>
            ))}
          </select>
        </label>
      )}
      {paused && (
        <div className="alert warn">
          {user?.pharmacy?.pausedUntil ? t('ph.breakUntil', { time: formatTime(user.pharmacy.pausedUntil, locale) }) : t('ph.pausedOn')}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      <Tabs<Tab>
        label={t('ph.title')}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            key: 'incoming' as Tab,
            label: (
              <>
                {t('ph.tabIncoming')}
                {summary?.pending ? (
                  <Pop k={summary.pending}>
                    <span className="count-badge">{summary.pending}</span>
                  </Pop>
                ) : null}
              </>
            ),
          },
          {
            key: 'orders' as Tab,
            label: (
              <>
                {t('ph.tabOrders')}
                {summary?.activeOrders ? (
                  <Pop k={summary.activeOrders}>
                    <span className="count-badge">{summary.activeOrders}</span>
                  </Pop>
                ) : null}
              </>
            ),
          },
          { key: 'today' as Tab, label: t('ph.tabToday') },
          { key: 'inventory' as Tab, label: t('ph.tabInventory') },
          { key: 'summary' as Tab, label: t('ph.tabSummary') },
          { key: 'activity' as Tab, label: t('ph.tabActivity') },
          { key: 'profile' as Tab, label: t('ph.tabProfile') },
          { key: 'team' as Tab, label: t('ph.tabTeam') },
        ].filter((x) => allowedTabs.includes(x.key as Tab))}
      />
      {tab === 'incoming' && <IncomingTab onChange={() => void loadSummary()} />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'today' && <TodayBoard incoming={summary?.pending ?? 0} />}
      {tab === 'inventory' && <InventoryTab onChange={() => void loadSummary()} />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'summary' &&
        (summary ? (
          <div className="grid cols-4">
            <Kpi label={t('ph.sumReceived')} value={<AnimatedNumber value={summary.received} />} tone="info" />
            <Kpi label={t('ph.sumAccepted')} value={<AnimatedNumber value={summary.accepted} />} tone="ok" />
            <Kpi label={t('ph.sumRefused')} value={<AnimatedNumber value={summary.refused} />} tone="bad" />
            <Kpi label={t('ph.sumExpired')} value={<AnimatedNumber value={summary.expired} />} tone="warn" />
            <Kpi label={t('ph.sumPending')} value={<AnimatedNumber value={summary.pending} />} tone="warn" />
            <Kpi
              label={t('ph.sumAvg')}
              value={summary.avgResponseMinutes != null ? t('ph.minutes', { n: summary.avgResponseMinutes }) : '—'}
            />
            <Kpi label={t('ph.sumActive')} value={<AnimatedNumber value={summary.activeOrders} />} tone="info" />
            <Kpi label={t('ph.sumLow')} value={<AnimatedNumber value={summary.lowStock} />} tone={summary.lowStock ? 'warn' : 'ok'} />
          </div>
        ) : (
          <CardSkeleton />
        ))}
      {tab === 'summary' && summary && summary.lowStock > 0 && <LowStockList />}
    </div>
  );
}

/** The reorder list as a CSV file: what to order to get back to twice the low-stock threshold. */
function exportReorder(rows: StockRow[]): void {
  const lines = ['cip13,name,dosage,in_stock,threshold,suggested_order'].concat(
    rows.map((r) =>
      [
        r.cip13,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.dosage.replace(/"/g, '""')}"`,
        r.quantity,
        r.lowStockThreshold,
        Math.max(1, r.lowStockThreshold * 2 - r.quantity),
      ].join(','),
    ),
  );
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reorder-list.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** The medicines at or under their low-stock threshold, most urgent first. */
function LowStockList() {
  const { t } = useI18n();
  const [rows, setRows] = useState<StockRow[] | null>(null);
  useEffect(() => {
    api<{ items: StockRow[] }>('/pharmacy/inventory', { query: { low: '1' } })
      .then((r) => setRows([...r.items].sort((a, b) => a.quantity - b.quantity)))
      .catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="card stack" aria-labelledby="low-list" data-testid="low-stock-list">
      <div className="row between">
        <h2 id="low-list" style={{ margin: 0 }}>
          {t('ph.lowList')}
        </h2>
        <button type="button" className="btn secondary small" onClick={() => exportReorder(rows)} data-testid="reorder-export">
          {t('ph.reorderExport')}
        </button>
      </div>
      <ul className="stack" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.medicineId} className="row between">
            <span>
              {r.name} <span className="muted small">{r.dosage}</span>
            </span>
            <span className="badge warn">{t('ph.lowLeft', { n: r.quantity, min: r.lowStockThreshold })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { OrderStatus } from '../../lib/types';
import { CardSkeleton, ErrorBox } from '../ui';

interface BoardOrder {
  id: string;
  slotStart?: string | null;
  slotMode?: 'pickup' | 'delivery' | null;
  status: OrderStatus;
  patientName: string;
  items: { id: string; name: string; dosage: string; quantity: number; excluded: boolean; requiresPrescription: boolean }[];
}

/** The columns and the only move each one accepts (the same rule as the server: one step forward). */
const COLUMNS: { status: OrderStatus; label: MessageKey; next: OrderStatus | null }[] = [
  { status: 'accepted', label: 'board.toPrepare', next: 'preparing' },
  { status: 'preparing', label: 'board.preparing', next: 'ready' },
  { status: 'ready', label: 'board.ready', next: null },
];

/**
 * "Today": the orders of the day as a board. Drag a card to the next column, or use its button (keyboard friendly).
 * Only valid moves are accepted. A prescription item must be confirmed as checked before the order is prepared.
 */
export function TodayBoard({ incoming }: { incoming: number }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [orders, setOrders] = useState<BoardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BoardOrder | null>(null);

  const load = useCallback(
    () =>
      api<{ items: BoardOrder[] }>('/pharmacy/orders', { query: { scope: 'active' } })
        .then((r) => setOrders(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error'))),
    [t],
  );
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const move = async (o: BoardOrder, to: OrderStatus) => {
    setError(null);
    const needsRx = to === 'preparing' && o.items.some((i) => i.requiresPrescription && !i.excluded);
    if (needsRx && !window.confirm(t('board.confirmRx'))) return;
    try {
      await api(`/pharmacy/orders/${o.id}/status`, { method: 'PATCH', body: { status: to, prescriptionChecked: needsRx } });
      toast(t('ph.statusUpdated', { status: t(`status.${to}` as MessageKey) }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  const onDrop = (e: DragEvent, column: (typeof COLUMNS)[number]) => {
    e.preventDefault();
    const o = dragging;
    setDragging(null);
    const from = COLUMNS.find((c) => c.status === o?.status);
    if (o && from?.next === column.status) void move(o, column.status);
  };

  if (!orders) return error ? <ErrorBox message={error} /> : <CardSkeleton lines={4} />;
  return (
    <div className="stack" style={{ gap: 12 }} data-testid="today-board">
      {error && <ErrorBox message={error} />}
      <p className="muted small" style={{ margin: 0 }}>
        {t('board.help')}
      </p>
      <div className="board">
        <section className="board-col" aria-label={t('board.waiting')}>
          <h3>
            {t('board.waiting')} <span className="count-badge">{incoming}</span>
          </h3>
          <p className="muted small">{t('board.waitingHelp')}</p>
          {incoming > 0 && (
            <button
              type="button"
              className="btn secondary small"
              onClick={() => window.dispatchEvent(new CustomEvent('counter:tab', { detail: 'incoming' }))}
            >
              {t('board.openRequests')}
            </button>
          )}
        </section>
        {COLUMNS.map((col) => {
          // Orders with a chosen time come first, the soonest on top.
          const cards = orders
            .filter((o) => o.status === col.status)
            .sort((a, b) => (a.slotStart ?? '9').localeCompare(b.slotStart ?? '9'));
          const valid = dragging ? COLUMNS.find((c) => c.status === dragging.status)?.next === col.status : false;
          return (
            <section
              key={col.status}
              className={`board-col ${valid ? 'valid' : ''}`}
              aria-label={t(col.label)}
              onDragOver={(e) => valid && e.preventDefault()}
              onDrop={(e) => onDrop(e, col)}
              data-testid={`board-${col.status}`}
            >
              <h3>
                {t(col.label)} <span className="count-badge">{cards.length}</span>
              </h3>
              {cards.length === 0 && <p className="muted small">{t('board.empty')}</p>}
              {cards.map((o) => (
                <article
                  key={o.id}
                  className="board-card"
                  draggable={col.next !== null}
                  onDragStart={() => setDragging(o)}
                  onDragEnd={() => setDragging(null)}
                  data-testid="board-card"
                >
                  <strong>{o.patientName}</strong>
                  {o.slotStart && (
                    <span className="badge info" style={{ width: 'fit-content' }}>
                      {t(o.slotMode === 'delivery' ? 'slot.badgeDelivery' : 'slot.badgePickup', {
                        when: new Date(o.slotStart).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
                      })}
                    </span>
                  )}
                  <ul className="plain-list small">
                    {o.items
                      .filter((i) => !i.excluded)
                      .map((i) => (
                        <li key={i.id}>
                          {i.quantity} × {i.name}
                        </li>
                      ))}
                  </ul>
                  {col.next && (
                    <button type="button" className="btn small" onClick={() => void move(o, col.next!)} data-testid="board-next">
                      {t(col.status === 'accepted' ? 'board.startPreparing' : 'board.markReady')}
                    </button>
                  )}
                  {col.status === 'ready' && (
                    <Link to={`/pickup/${o.id}`} className="btn small">
                      {t('pickup.open')}
                    </Link>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

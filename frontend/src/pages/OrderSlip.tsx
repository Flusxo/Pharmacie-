/**
 * Printable order slip (patient: own order; pharmacy: one of its orders, patient as "First L.").
 * Print styles hide the app chrome; the slip is a demonstration document only.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/fr';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime, formatPrice } from '../lib/format';
import type { OrderItem, OrderStatus } from '../lib/types';
import { CardSkeleton, ErrorBox } from '../components/ui';

interface SlipOrder {
  id: string;
  status: OrderStatus;
  createdAt: string;
  patientName?: string;
  hasPrescriptionNote?: boolean;
  source?: 'patient' | 'doctor';
  pharmacy: { name: string; address: string; city: string; phone: string | null };
  items: OrderItem[];
}

export function OrderSlipPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [order, setOrder] = useState<SlipOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPharmacy = user?.role === 'pharmacy';

  useEffect(() => {
    const path = isPharmacy ? `/pharmacy/orders/${id}` : `/patient/orders/${id}`;
    api<{ order: SlipOrder }>(path)
      .then((r) => setOrder(r.order))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [id, isPharmacy, t]);

  if (error) return <ErrorBox message={error} />;
  if (!order) return <CardSkeleton />;
  const items = order.items.filter((i) => !i.excluded);
  const total = items.reduce((s, i) => s + (i.priceEur ?? 0) * i.quantity, 0);
  const hasRx = items.some((i) => i.requiresPrescription);
  const patient = isPharmacy ? order.patientName : user?.displayName;

  return (
    <div className="stack slip-page">
      <div className="row between no-print">
        <Link to={isPharmacy ? '/pharmacy' : `/orders/${order.id}`}>← {t('common.back')}</Link>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('slip.print')}
        </button>
      </div>

      <article className="card slip" aria-labelledby="slip-title" data-testid="order-slip">
        <header className="row between slip-head">
          <div>
            <div className="brand">
              counter<span>.</span>
            </div>
            <h1 id="slip-title">{t('slip.title')}</h1>
          </div>
          <dl className="slip-meta">
            <dt>{t('slip.ref')}</dt>
            <dd>{order.id.slice(0, 8).toUpperCase()}</dd>
            <dt>{t('slip.date')}</dt>
            <dd>{formatDateTime(order.createdAt, locale)}</dd>
            <dt>{t('slip.status')}</dt>
            <dd>{t(`status.${order.status}` as MessageKey)}</dd>
          </dl>
        </header>

        <div className="grid cols-2 slip-parties">
          <section>
            <h2>{t('slip.pharmacy')}</h2>
            <p>
              <strong>{order.pharmacy.name}</strong>
              <br />
              {order.pharmacy.address}
              {order.pharmacy.phone && (
                <>
                  <br />
                  {order.pharmacy.phone}
                </>
              )}
            </p>
          </section>
          <section>
            <h2>{t('slip.patient')}</h2>
            <p>
              <strong>{patient}</strong>
              {order.source === 'doctor' && (
                <>
                  <br />
                  {t('slip.fromDoctor')}
                </>
              )}
            </p>
          </section>
        </div>

        <table className="slip-table">
          <thead>
            <tr>
              <th scope="col">{t('slip.qty')}</th>
              <th scope="col">{t('slip.medicine')}</th>
              <th scope="col" className="num">
                {t('slip.unit')}
              </th>
              <th scope="col" className="num">
                {t('slip.lineTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.quantity}</td>
                <td>
                  {i.name}
                  {!i.name.includes(i.dosage) && <span className="muted"> · {i.dosage}</span>}
                  {i.requiresPrescription && <span className="slip-rx"> Rx</span>}
                </td>
                <td className="num">{formatPrice(i.priceEur ?? 0, locale)}</td>
                <td className="num">{formatPrice((i.priceEur ?? 0) * i.quantity, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('order.total')}</td>
              <td className="num">
                <strong>{formatPrice(total, locale)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>

        {hasRx && (
          <p className="slip-check">
            <span className="box" aria-hidden="true" /> {t('slip.rxChecked')}
          </p>
        )}
        <p className="small muted slip-notice">{t('slip.notice')}</p>
      </article>
    </div>
  );
}

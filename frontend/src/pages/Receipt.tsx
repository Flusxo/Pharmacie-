/** Printable receipt of a test-mode payment (patient only). Demonstration document: no real money moved. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatDateTime, formatPrice } from '../lib/format';
import { CardSkeleton, ErrorBox } from '../components/ui';

interface ReceiptData {
  number: string;
  orderId: string;
  date: string;
  pharmacy: { name: string; address: string; city: string };
  lines: { name: string; dosage: string; quantity: number; unitCents: number; totalCents: number }[];
  totalCents: number;
  status: string;
  testMode: boolean;
}

export function ReceiptPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ receipt: ReceiptData }>(`/patient/orders/${id}/receipt`)
      .then((r) => setReceipt(r.receipt))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [id, t]);

  if (error) return <ErrorBox message={error} />;
  if (!receipt) return <CardSkeleton />;
  return (
    <div className="stack slip-page">
      <div className="row between no-print">
        <Link to={`/orders/${receipt.orderId}`}>← {t('common.back')}</Link>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('slip.print')}
        </button>
      </div>
      <article className="card slip" aria-labelledby="receipt-title" data-testid="receipt">
        <header className="row between slip-head">
          <div>
            <div className="brand">
              counter<span>.</span>
            </div>
            <h1 id="receipt-title">{t('receipt.title')}</h1>
          </div>
          <dl className="slip-meta">
            <dt>{t('receipt.number')}</dt>
            <dd>{receipt.number}</dd>
            <dt>{t('slip.date')}</dt>
            <dd>{formatDateTime(receipt.date, locale)}</dd>
            <dt>{t('slip.status')}</dt>
            <dd>{t(`pay.status.${receipt.status}` as MessageKey)}</dd>
          </dl>
        </header>
        <section>
          <h2>{t('slip.pharmacy')}</h2>
          <p>
            <strong>{receipt.pharmacy.name}</strong>
            <br />
            {receipt.pharmacy.address}, {receipt.pharmacy.city}
          </p>
        </section>
        <table className="slip-table">
          <thead>
            <tr>
              <th>{t('receipt.item')}</th>
              <th>{t('receipt.qty')}</th>
              <th>{t('receipt.unit')}</th>
              <th>{t('receipt.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.name} — {l.dosage}
                </td>
                <td>{l.quantity}</td>
                <td>{formatPrice(l.unitCents / 100, locale)}</td>
                <td>{formatPrice(l.totalCents / 100, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>{t('order.total')}</th>
              <th>{formatPrice(receipt.totalCents / 100, locale)}</th>
            </tr>
          </tfoot>
        </table>
        <p className="alert info small">{t('receipt.testNote')}</p>
      </article>
    </div>
  );
}

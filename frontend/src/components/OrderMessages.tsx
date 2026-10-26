import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useFeatures } from '../lib/features';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';
import { ErrorBox } from './ui';

interface Message {
  id: number;
  senderRole: 'patient' | 'pharmacy';
  body: string;
  createdAt: string;
  hidden: boolean;
}

/**
 * A short text thread on one order between the patient and the pharmacy. Not for medical advice: the notice says so and
 * points to the pharmacist. Any message can be reported; staff can hide it.
 */
export function OrderMessages({
  orderId,
  side,
  collapsed = false,
}: {
  orderId: string;
  side: 'patient' | 'pharmacy';
  collapsed?: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsed);
  const features = useFeatures();
  const base = `/${side}/orders/${orderId}/messages`;

  const load = useCallback(
    () =>
      api<{ items: Message[] }>(base)
        .then((r) => setItems(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error'))),
    [base, t],
  );
  useEffect(() => {
    if (!open) return;
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [open, load]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await api(base, { method: 'POST', body: { body: text } });
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };
  const report = async (m: Message) => {
    const reason = window.prompt(t('msg.reportPrompt'));
    if (!reason || reason.trim().length < 3) return;
    try {
      await api(`/${side}/messages/${m.id}/report`, { method: 'POST', body: { reason } });
      toast(t('msg.reported'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const body = (
    <div className="stack" style={{ gap: 10 }} data-testid="messages">
      <p className="alert info small" role="note" style={{ margin: 0 }}>
        {t('msg.notice')}
      </p>
      {error && <ErrorBox message={error} />}
      {items?.length === 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          {t('msg.none')}
        </p>
      )}
      <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }} aria-live="polite">
        {items?.map((m) => (
          <li key={m.id} className="message" data-from={m.senderRole === side ? 'me' : 'them'} data-testid="message">
            <span className="muted small">
              {t(m.senderRole === 'patient' ? 'msg.patient' : 'msg.pharmacy')} · {formatDateTime(m.createdAt, locale)}
            </span>
            <span>{m.hidden ? <em className="muted">{t('msg.removed')}</em> : m.body}</span>
            {!m.hidden && m.senderRole !== side && (
              <button type="button" className="link-btn small" onClick={() => void report(m)}>
                {t('msg.report')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!features.messages && (
        <p className="alert warn small" role="status" style={{ margin: 0 }} data-testid="messages-off">
          {t('feat.messagesOff')}
        </p>
      )}
      <form className="row" style={{ gap: 8, display: features.messages ? undefined : 'none' }} onSubmit={send}>
        <label className="field" style={{ flex: 1 }}>
          <span className="sr-only">{t('msg.label')}</span>
          <input
            className="input"
            value={text}
            maxLength={500}
            placeholder={t('msg.placeholder')}
            onChange={(e) => setText(e.target.value)}
            data-testid="message-input"
          />
        </label>
        <button className="btn" type="submit" disabled={!text.trim()}>
          {t('msg.send')}
        </button>
      </form>
    </div>
  );
  if (!collapsed)
    return (
      <section className="card stack" aria-labelledby={`msg-${orderId}`}>
        <h2 id={`msg-${orderId}`}>{t('msg.title')}</h2>
        {body}
      </section>
    );
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('msg.title')}</summary>
      {open && body}
    </details>
  );
}

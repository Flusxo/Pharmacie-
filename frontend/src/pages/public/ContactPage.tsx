/** Contact form: validated here and by the API, saved for staff (admin dashboard → Messages). */
import { useState, type FormEvent } from 'react';
import { m as motion } from 'framer-motion';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { PublicHero } from '../../components/public/Sections';
import { HeroArt } from '../../components/public/HeroArt';
import { CutOut } from '../../components/public/Media';
import { IconCheck, IconClock, IconMail, IconPhone, IconPin } from '../../components/Icons';
import { duration, easeOut } from '../../motion';

const TOPICS = ['patient', 'pharmacy', 'doctor', 'press', 'other'] as const;
type Topic = (typeof TOPICS)[number];
interface Form {
  name: string;
  email: string;
  topic: Topic;
  subject: string;
  message: string;
  noHealthData: boolean;
  website: string;
}
const EMPTY: Form = { name: '', email: '', topic: 'patient', subject: '', message: '', noHealthData: false, website: '' };

function validate(f: Form): Partial<Record<keyof Form, MessageKey>> {
  const e: Partial<Record<keyof Form, MessageKey>> = {};
  if (f.name.trim().length < 2) e.name = 'pub.contact.errRequired';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'pub.contact.errEmail';
  if (f.subject.trim().length < 3) e.subject = 'pub.contact.errSubject';
  if (f.message.trim().length < 10) e.message = 'pub.contact.errMessage';
  if (!f.noHealthData) e.noHealthData = 'pub.contact.errConsent';
  return e;
}

export function ContactPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const errors = validate(form);
  const show = (k: keyof Form) => (touched ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      await api('/contact', { method: 'POST', body: { ...form, website: form.website || undefined } });
      setSent(true);
      setForm(EMPTY);
      setTouched(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: 'name' | 'email' | 'subject', label: MessageKey, type = 'text', auto?: string) => (
    <div className="field">
      <label htmlFor={`c-${k}`}>{t(label)}</label>
      <input
        id={`c-${k}`}
        className="input"
        type={type}
        autoComplete={auto}
        value={form[k]}
        aria-invalid={!!show(k)}
        aria-describedby={show(k) ? `c-${k}-err` : undefined}
        onChange={(e) => set(k, e.target.value)}
      />
      {show(k) && (
        <span id={`c-${k}-err`} className="field-error">
          {t(show(k)!)}
        </span>
      )}
    </div>
  );

  return (
    <div className="pub-page">
      <PublicHero
        eyebrow={t('pub.contact.eyebrow')}
        title={t('pub.contact.title')}
        lead={t('pub.contact.lead')}
        visual={<HeroArt kind="contact" />}
      />
      <div className="contact-grid">
        {sent ? (
          <motion.section
            className="card glass stack contact-sent"
            role="status"
            data-testid="contact-sent"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: duration.base, ease: easeOut }}
          >
            <span className="sent-check" aria-hidden="true">
              <IconCheck width={34} height={34} />
            </span>
            <h2>{t('pub.contact.sentTitle')}</h2>
            <p>{t('pub.contact.sentText')}</p>
            <button type="button" className="btn secondary" onClick={() => setSent(false)}>
              {t('pub.contact.another')}
            </button>
          </motion.section>
        ) : (
          <form className="card glass stack" onSubmit={submit} noValidate data-testid="contact-form" aria-labelledby="page-title">
            <div className="grid cols-2">
              {field('name', 'pub.contact.name', 'text', 'name')}
              {field('email', 'pub.contact.email', 'email', 'email')}
            </div>
            <div className="grid cols-2">
              <div className="field">
                <label htmlFor="c-topic">{t('pub.contact.topic')}</label>
                <select id="c-topic" className="input" value={form.topic} onChange={(e) => set('topic', e.target.value as Topic)}>
                  {TOPICS.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`pub.contact.topic.${tp}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              {field('subject', 'pub.contact.subject')}
            </div>
            <div className="field">
              <label htmlFor="c-message">{t('pub.contact.message')}</label>
              <textarea
                id="c-message"
                className="input"
                rows={6}
                maxLength={2000}
                value={form.message}
                aria-invalid={!!show('message')}
                aria-describedby="c-message-count"
                onChange={(e) => set('message', e.target.value)}
              />
              <span className="row between small">
                <span className="field-error">{show('message') ? t(show('message')!) : ''}</span>
                <span id="c-message-count" className="muted">
                  {t('pub.contact.count', { n: form.message.length })}
                </span>
              </span>
            </div>
            {/* Honeypot: hidden from people and screen readers, filled only by bots. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="c-website">{t('pub.contact.honeypot')}</label>
              <input
                id="c-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.noHealthData}
                aria-invalid={!!show('noHealthData')}
                onChange={(e) => set('noHealthData', e.target.checked)}
              />
              <span>{t('pub.contact.noHealth')}</span>
            </label>
            {show('noHealthData') && <span className="field-error">{t(show('noHealthData')!)}</span>}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? t('pub.contact.sending') : t('pub.contact.send')}
            </button>
          </form>
        )}
        <aside className="card glass stack contact-details" aria-labelledby="contact-details-title">
          <CutOut id="cut-envelope" className="contact-cutout" />
          <h2 id="contact-details-title">{t('pub.contact.detailsTitle')}</h2>
          <p className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <IconPin width={20} height={20} style={{ flex: 'none' }} /> {t('pub.footer.address')}
          </p>
          <p className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <IconPhone width={20} height={20} style={{ flex: 'none' }} /> {t('pub.footer.phone')}
          </p>
          <p className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <IconMail width={20} height={20} style={{ flex: 'none' }} /> {t('pub.footer.email')}
          </p>
          <p className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <IconClock width={20} height={20} style={{ flex: 'none' }} /> {t('pub.footer.hours')}
          </p>
          <p className="muted small">{t('pub.contact.detailsNote')}</p>
        </aside>
      </div>
    </div>
  );
}

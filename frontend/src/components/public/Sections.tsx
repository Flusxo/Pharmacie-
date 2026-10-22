/** Building blocks of the public pages: hero, feature grid, numbered steps, FAQ, call to action. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, type MessageKey } from '../../i18n';
import { Reveal } from '../motion';
import { IconArrowRight, IconShield } from '../Icons';

export function PublicHero({
  eyebrow,
  title,
  lead,
  actions,
  visual,
  id = 'page-title',
}: {
  eyebrow: string;
  title: string;
  lead: string;
  actions?: ReactNode;
  visual?: ReactNode;
  id?: string;
}) {
  return (
    <section className="pub-hero" aria-labelledby={id}>
      <div className="pub-hero-copy glass">
        <span className="eyebrow">{eyebrow}</span>
        <h1 id={id}>{title}</h1>
        <p className="lead">{lead}</p>
        {actions && <div className="row pub-hero-actions">{actions}</div>}
      </div>
      {visual && (
        <div className="pub-hero-visual" aria-hidden="true">
          {visual}
        </div>
      )}
    </section>
  );
}

export function Section({ title, lead, children, id }: { title: string; lead?: string; children: ReactNode; id: string }) {
  return (
    <section className="pub-section" aria-labelledby={id}>
      <div className="pub-section-head">
        <h2 id={id}>{title}</h2>
        {lead && <p className="muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export interface Feature {
  icon: ReactNode;
  title: MessageKey;
  text: MessageKey;
  to?: string;
}

export function FeatureGrid({ items }: { items: Feature[] }) {
  const { t } = useI18n();
  return (
    <div className="feature-grid">
      {items.map((f, i) => (
        <Reveal key={f.title} index={i} className="card feature glass">
          <span className="feature-icon">{f.icon}</span>
          <h3>{t(f.title)}</h3>
          <p className="muted">{t(f.text)}</p>
          {f.to && (
            <Link to={f.to} className="link-arrow">
              {t('pub.cta.learnMore')} <IconArrowRight width={16} height={16} />
            </Link>
          )}
        </Reveal>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: { title?: MessageKey; text: MessageKey }[] }) {
  const { t } = useI18n();
  return (
    <ol className="pub-steps">
      {items.map((s, i) => (
        <Reveal as="li" key={s.text} index={i} className="pub-step glass">
          <span className="pub-step-n" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <span className="sr-only">{t('pub.stepN', { n: i + 1 })}</span>
            {s.title && <h3>{t(s.title)}</h3>}
            <p className={s.title ? 'muted' : undefined}>{t(s.text)}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}

export function Faq({ items, id = 'faq' }: { items: { q: MessageKey; a: MessageKey }[]; id?: string }) {
  const { t } = useI18n();
  return (
    <div className="faq" id={id}>
      {items.map((f) => (
        <details key={f.q} className="faq-item glass">
          <summary>{t(f.q)}</summary>
          <p>{t(f.a)}</p>
        </details>
      ))}
    </div>
  );
}

export function SimNote() {
  const { t } = useI18n();
  return (
    <p className="sim-note" role="note" data-testid="sim-note">
      <IconShield width={20} height={20} />
      <span>{t('pub.simNote')}</span>
    </p>
  );
}

export function CtaBand({ title, text, actions }: { title: string; text: string; actions: ReactNode }) {
  return (
    <section className="cta-band" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div className="row">{actions}</div>
    </section>
  );
}

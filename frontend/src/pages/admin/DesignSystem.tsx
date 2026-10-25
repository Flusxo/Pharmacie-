import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { RxBadge } from '../../components/ui';

/** Colour tokens shown on the page (the CSS variable names in styles/app.css). */
const COLORS = ['brand', 'accent', 'ink', 'ink-2', 'muted', 'line', 'surface', 'surface-2', 'ok', 'warn', 'bad', 'info', 'focus'];
const RADII = ['radius-sm', 'radius', 'radius-lg'];

/** Staff-only reference of the shared look: tokens, type, buttons, cards, glass, states. Follows light and dark live. */
export function DesignSystemPage() {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setValues(Object.fromEntries([...COLORS, ...RADII].map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return (
    <div className="stack" style={{ gap: 28 }} data-testid="design-system">
      <Link to="/admin" className="small">
        ← {t('nav.dashboard')}
      </Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>{t('ds.title')}</h1>
        <p className="muted">{t('ds.lead')}</p>
      </header>

      <section className="card stack" aria-labelledby="ds-colors">
        <h2 id="ds-colors">{t('ds.colors')}</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {COLORS.map((n) => (
            <div key={n} className="stack" style={{ gap: 6 }}>
              <span style={{ height: 56, borderRadius: 'var(--radius-sm)', background: `var(--${n})`, border: '1px solid var(--line)' }} />
              <code className="small">--{n}</code>
              <span className="muted small">{values[n]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="ds-type">
        <h2 id="ds-type">{t('ds.type')}</h2>
        <p className="muted small">{t('ds.typeNote')}</p>
        <h1 style={{ margin: 0 }}>{t('ds.sample1')}</h1>
        <h2 style={{ margin: 0 }}>{t('ds.sample2')}</h2>
        <h3 style={{ margin: 0 }}>{t('ds.sample3')}</h3>
        <p style={{ margin: 0 }}>{t('ds.body')}</p>
        <p className="muted small" style={{ margin: 0 }}>
          {t('ds.small')}
        </p>
      </section>

      <section className="card stack" aria-labelledby="ds-buttons">
        <h2 id="ds-buttons">{t('ds.buttons')}</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn">
            {t('ds.primary')}
          </button>
          <button type="button" className="btn secondary">
            {t('ds.secondary')}
          </button>
          <button type="button" className="btn ghost">
            {t('ds.ghost')}
          </button>
          <button type="button" className="btn small">
            {t('ds.small')}
          </button>
          <button type="button" className="btn" disabled>
            {t('ds.disabled')}
          </button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span className="badge ok">{t('ds.ok')}</span>
          <span className="badge warn">{t('ds.warn')}</span>
          <span className="badge info">{t('ds.info')}</span>
          <span className="badge neutral">{t('ds.neutral')}</span>
          <RxBadge rx />
        </div>
      </section>

      <section className="card stack" aria-labelledby="ds-forms">
        <h2 id="ds-forms">{t('ds.forms')}</h2>
        <div className="grid cols-2">
          <label className="field">
            <span>{t('ds.field')}</span>
            <input className="input" placeholder={t('ds.placeholder')} />
          </label>
          <label className="field">
            <span>{t('ds.select')}</span>
            <select className="input">
              <option>{t('ds.optionA')}</option>
              <option>{t('ds.optionB')}</option>
            </select>
          </label>
        </div>
        <label className="check switch">
          <input type="checkbox" defaultChecked />
          <span>{t('ds.switch')}</span>
        </label>
      </section>

      <section className="grid cols-2" aria-labelledby="ds-surfaces">
        <h2 id="ds-surfaces" className="sr-only">
          {t('ds.surfaces')}
        </h2>
        <div className="card stack">
          <strong>{t('ds.card')}</strong>
          <p className="muted small" style={{ margin: 0 }}>
            {t('ds.cardNote')}
          </p>
          <div className="card">{t('ds.nested')}</div>
        </div>
        <div className="glass stack" style={{ padding: 20, borderRadius: 'var(--radius)' }}>
          <strong>{t('ds.glass')}</strong>
          <p className="muted small" style={{ margin: 0 }}>
            {t('ds.glassNote')}
          </p>
        </div>
      </section>

      <section className="card stack" aria-labelledby="ds-radius">
        <h2 id="ds-radius">{t('ds.radius')}</h2>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          {RADII.map((n) => (
            <div key={n} className="stack" style={{ gap: 6, alignItems: 'center' }}>
              <span
                style={{
                  width: 88,
                  height: 64,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: `var(--${n})`,
                  boxShadow: 'var(--shadow-1)',
                }}
              />
              <code className="small">--{n}</code>
              <span className="muted small">{values[n]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="ds-loading">
        <h2 id="ds-loading">{t('ds.loading')}</h2>
        <div className="row" style={{ gap: 24 }}>
          <span className="capsule-spinner" role="img" aria-label={t('common.loading')} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <span className="sk sk-title" />
            <span className="sk sk-line" />
            <span className="sk sk-line short" />
          </div>
        </div>
      </section>
    </div>
  );
}

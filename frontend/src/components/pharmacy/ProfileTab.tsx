import { useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { ErrorBox } from '../ui';

const SERVICES = ['vaccination', 'blood_pressure', 'orthopedics', 'homeopathy', 'baby_corner', 'night_service'];
const LANGUAGES = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt'];
const ACCESSIBILITY = ['step_free', 'wide_door', 'hearing_loop', 'parking'];

function Group({
  title,
  codes,
  prefix,
  value,
  onChange,
}: {
  title: string;
  codes: string[];
  prefix: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
      <legend>
        <strong>{title}</strong>
      </legend>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {codes.map((c) => (
          <label key={c} className="check">
            <input
              type="checkbox"
              checked={value.includes(c)}
              onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))}
            />
            <span>{t(`${prefix}.${c}` as MessageKey)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** What the pharmacy shows on its public page: services, languages spoken, accessibility. */
export function ProfileTab() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const ph = user?.pharmacy;
  const [services, setServices] = useState<string[]>(ph?.services ?? []);
  const [languages, setLanguages] = useState<string[]>(ph?.languages ?? []);
  const [access, setAccess] = useState<string[]>(ph?.accessibility ?? []);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/pharmacy/profile', { method: 'PATCH', body: { services, languages, accessibility: access } });
      await refresh();
      toast(t('pp.saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };
  return (
    <form className="card stack" onSubmit={save} data-testid="profile-form">
      <p className="muted small">{t('pp.editIntro')}</p>
      {error && <ErrorBox message={error} />}
      <Group title={t('pp.services')} codes={SERVICES} prefix="pp.service" value={services} onChange={setServices} />
      <Group title={t('pp.languages')} codes={LANGUAGES} prefix="pp.lang" value={languages} onChange={setLanguages} />
      <Group title={t('pp.accessibility')} codes={ACCESSIBILITY} prefix="pp.access" value={access} onChange={setAccess} />
      <button className="btn" type="submit">
        {t('pp.save')}
      </button>
    </form>
  );
}

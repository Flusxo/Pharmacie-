/** Account page: optional two-step verification (TOTP) for doctor, pharmacy and staff accounts. */
import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { User } from '../lib/types';
import { QrCode } from './QrCode';

const codeProps = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  pattern: '[0-9]{6}',
  maxLength: 6,
};

export function TwoStepSection({ user }: { user: User }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      setSetup(await api<{ secret: string; otpauthUrl: string }>('/auth/totp/setup', { method: 'POST' }));
      setCode('');
    });
  const enable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api('/auth/totp/enable', { method: 'POST', body: { code } });
      setSetup(null);
      setCode('');
      await refresh();
      toast(t('twoStep.enabled'));
    });
  };
  const disable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api('/auth/totp/disable', { method: 'POST', body: { password, code } });
      setPassword('');
      setCode('');
      await refresh();
      toast(t('twoStep.disabled'));
    });
  };

  return (
    <section className="card stack" aria-labelledby="two-step" data-testid="two-step">
      <div className="row between">
        <h2 id="two-step">{t('twoStep.title')}</h2>
        <span className={`badge ${user.totpEnabled ? 'ok' : 'neutral'}`}>{user.totpEnabled ? t('twoStep.on') : t('twoStep.off')}</span>
      </div>
      <p className="muted">{t('twoStep.intro')}</p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {!user.totpEnabled && !setup && (
        <button type="button" className="btn secondary" onClick={() => void start()} disabled={busy}>
          {t('twoStep.start')}
        </button>
      )}

      {!user.totpEnabled && setup && (
        <form className="two-step-setup" onSubmit={enable}>
          <QrCode text={setup.otpauthUrl} label={t('twoStep.qrLabel')} />
          <div className="stack">
            <p>{t('twoStep.scan')}</p>
            <code className="secret-key" data-testid="totp-secret">
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
            <a href={setup.otpauthUrl} className="small">
              {t('twoStep.openApp')}
            </a>
            <div className="field">
              <label htmlFor="totp-code">{t('twoStep.code')}</label>
              <input
                id="totp-code"
                className="input"
                {...codeProps}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => setSetup(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn" disabled={busy || code.length !== 6}>
                {t('twoStep.enable')}
              </button>
            </div>
          </div>
        </form>
      )}

      {user.totpEnabled && (
        <form className="stack" onSubmit={disable}>
          <p className="small muted">{t('twoStep.disableHint')}</p>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="totp-pw">{t('login.password')}</label>
              <input
                id="totp-pw"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="totp-off-code">{t('twoStep.code')}</label>
              <input
                id="totp-off-code"
                className="input"
                {...codeProps}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <button type="submit" className="btn secondary" disabled={busy || !password || code.length !== 6}>
            {t('twoStep.disable')}
          </button>
        </form>
      )}
    </section>
  );
}

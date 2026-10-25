/**
 * First-visit onboarding tour for patients (3 steps). Non-blocking: a small card that points at the
 * real controls (search box, map, requests) and never covers the page with a backdrop.
 * Remembered per browser (a convenience; replay from the account page).
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { duration, easeOut } from '../motion';

export const TOUR_KEY = 'counter.tour';
export type TourRole = 'patient' | 'doctor' | 'pharmacy';
const STEPS_BY_ROLE = {
  patient: ['search', 'map', 'requests'],
  doctor: ['dLink', 'dRequest', 'dTemplates'],
  pharmacy: ['pIncoming', 'pStock', 'pSummary'],
} as const;
/** The patient flag keeps its original name; each other role has its own (first login of that role). */
const keyOf = (role: TourRole) => (role === 'patient' ? TOUR_KEY : `${TOUR_KEY}.${role}`);

function readDone(role: TourRole): boolean {
  try {
    return localStorage.getItem(keyOf(role)) === 'done';
  } catch {
    return true;
  }
}
export function resetTour(): void {
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    // Storage unavailable: the tour simply shows again next time.
  }
}

/** The visible element for a step (nav items exist in both the top bar and the phone tab bar). */
const targetFor = (step: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${step}"]`)].find((el) => el.offsetParent !== null) ?? null;

export function OnboardingTour({ role = 'patient' }: { role?: TourRole }) {
  const { t } = useI18n();
  const STEPS: readonly string[] = STEPS_BY_ROLE[role];
  const [open, setOpen] = useState(() => !readDone(role));
  const [i, setI] = useState(0);
  const step = STEPS[i];

  const finish = useCallback(() => {
    try {
      localStorage.setItem(keyOf(role), 'done');
    } catch {
      // Not remembered; harmless.
    }
    setOpen(false);
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const el = targetFor(step);
    el?.classList.add('tour-target');
    if (step === 'search') el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    document.addEventListener('keydown', esc);
    return () => {
      el?.classList.remove('tour-target');
      document.removeEventListener('keydown', esc);
    };
  }, [open, step, finish]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="tour-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-title"
          data-testid="tour"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: duration.base, ease: easeOut }}
        >
          <div className="row between">
            <span className="small muted">{t('tour.progress', { n: i + 1, total: STEPS.length })}</span>
            <button type="button" className="link-btn small" onClick={finish}>
              {t('tour.skip')}
            </button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: duration.fast, ease: easeOut }}
            >
              <h2 id="tour-title">{t(`tour.${step}Title` as MessageKey)}</h2>
              <p>{t(`tour.${step}Text` as MessageKey)}</p>
            </motion.div>
          </AnimatePresence>
          <div className="row between">
            <span className="tour-dots" aria-hidden="true">
              {STEPS.map((s, k) => (
                <span key={s} className={k === i ? 'on' : ''} />
              ))}
            </span>
            <span className="row" style={{ gap: 8 }}>
              {i > 0 && (
                <button type="button" className="btn secondary small" onClick={() => setI(i - 1)}>
                  {t('common.back')}
                </button>
              )}
              <button type="button" className="btn small" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}>
                {i < STEPS.length - 1 ? t('tour.next') : t('tour.done')}
              </button>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Scroll story: the steps of an explanation, each tied to ONE live 3D object on the persistent canvas behind the
 * page (see three/compositions.ts, items with `story`). While a step crosses the middle of the screen its object flies
 * in, turns and assembles; the previous one flies out. No picture frames: the objects sit directly on the page.
 * Without 3D (Low / Off tier) the same steps show a small cut-out picture instead (transparent, with a soft shadow).
 */
import { useEffect, useRef } from 'react';
import { useI18n, type MessageKey } from '../../i18n';
import { Picture, hasPicture } from '../Picture';
import { setStoryStep } from '../../three/story';

export interface StoryStep {
  title?: MessageKey;
  text: MessageKey;
  /** cut-out picture shown when there is no live 3D */
  fallback?: string;
}

export function StorySection({ id, steps, labelKey }: { id: string; steps: StoryStep[]; labelKey: MessageKey }) {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // The step that crosses the middle band of the screen is the active one; outside the section there is none.
    const visible = new Set<number>();
    const pick = () => setStoryStep(visible.size ? Math.min(...visible) : -1);
    const stepObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.step);
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        }
        pick();
      },
      { rootMargin: '-38% 0px -38% 0px' },
    );
    items.current.forEach((n) => n && stepObs.observe(n));
    const sectionObs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) setStoryStep(-1);
    });
    sectionObs.observe(el);
    return () => {
      stepObs.disconnect();
      sectionObs.disconnect();
      setStoryStep(-1);
    };
  }, [steps.length]);

  return (
    <section ref={root} className="story-live" id={id} aria-label={t(labelKey)} data-testid="story-live">
      <ol className="story-live-steps">
        {steps.map((s, i) => (
          <li
            key={i}
            ref={(n) => {
              items.current[i] = n;
            }}
            data-step={i}
            className="story-live-step"
            data-testid="story-live-step"
          >
            <div className="glass story-live-card">
              <span className="pub-step-n" aria-hidden="true">
                {i + 1}
              </span>
              {s.title && <h3>{t(s.title)}</h3>}
              <p>{t(s.text)}</p>
            </div>
            {s.fallback && hasPicture(s.fallback) && (
              <div className="story-live-fallback" aria-hidden="true">
                <Picture id={s.fallback} alt="" sizes="260px" effects={['float']} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

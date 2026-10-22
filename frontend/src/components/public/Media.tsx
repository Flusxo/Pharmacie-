/** Picture layouts for the public pages: a captioned band, a gallery, a floating cut-out and the pinned story. */
import { useRef, useState } from 'react';
import { useMotionValueEvent, useScroll } from 'framer-motion';
import { useI18n, type MessageKey } from '../../i18n';
import { Picture, hasPicture } from '../Picture';

const alt = (id: string) => `img.${id}` as MessageKey;

/** Wide picture with slow parallax and a glass caption. */
export function ImageBand({ id, heading, body }: { id: string; heading: MessageKey; body: MessageKey }) {
  const { t } = useI18n();
  if (!hasPicture(id)) return null;
  return (
    <figure className="picture-band" style={{ margin: 0 }}>
      <Picture id={id} alt={t(alt(id))} sizes="(max-width: 1240px) 100vw, 1200px" effects={['parallax', 'zoom']} />
      <figcaption className="picture-caption glass">
        <h3>{t(heading)}</h3>
        <p>{t(body)}</p>
      </figcaption>
    </figure>
  );
}

/** Three (or more) pictures with captions; hover tilt and slow zoom. */
export function Gallery({ ids }: { ids: string[] }) {
  const { t } = useI18n();
  const shown = ids.filter(hasPicture);
  if (!shown.length) return null;
  return (
    <div className="gallery" data-testid="gallery">
      {shown.map((id) => (
        <figure key={id}>
          <Picture id={id} alt={t(alt(id))} sizes="(max-width: 860px) 100vw, 33vw" effects={['tilt', 'zoom']} />
          <figcaption>{t(alt(id))}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Floating cut-out object with a soft shadow. */
export function CutOut({ id, className = '' }: { id: string; className?: string }) {
  const { t } = useI18n();
  return <Picture id={id} alt={t(alt(id))} sizes="240px" className={`cutout-aside ${className}`} effects={['float', 'tilt']} />;
}

/**
 * Pinned scrollytelling: the picture stays while the captions scroll by; each caption brings its picture.
 * The captions are a real list; with reduced motion the pictures simply switch.
 */
export function Story({ steps }: { steps: { id: string; title: MessageKey; text: MessageKey }[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.6', 'end 0.6'] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setActive(Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length)))));
  const shown = steps.filter((s) => hasPicture(s.id));
  if (!shown.length) return null;
  return (
    <section className="story" aria-label={t('pub.story.label')} data-testid="story" data-active={active}>
      <div className="story-stage">
        {steps.map((s, i) => (
          <div key={s.id} style={{ opacity: i === active ? 1 : 0 }} aria-hidden={i !== active}>
            <Picture id={s.id} alt={t(alt(s.id))} sizes="(max-width: 860px) 100vw, 55vw" effects={['zoom']} priority={i === 0} />
          </div>
        ))}
      </div>
      <ol className="story-steps" ref={ref}>
        {steps.map((s, i) => (
          <li key={s.id} className={`story-step ${i === active ? 'active' : ''}`}>
            <div className="glass">
              <h3>{t(s.title)}</h3>
              <p>{t(s.text)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

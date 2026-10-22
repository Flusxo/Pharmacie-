import { useState, type PointerEvent } from 'react';
import { useI18n } from '../i18n';
import { useReducedMotion } from '../lib/settings';
import { MED_VIEWS, medPictureId, type MedView } from '../lib/medicine';
import { hasPicture } from './Picture';
import { PackImage } from './PackImage';

interface Props {
  name: string;
  dosage: string;
  form: string;
  category: string;
  imageUrl?: string | null;
  rx?: boolean;
}

/** Photo mode of the medicine page: the rendered pictures (front, three-quarter, cap off) with a hover zoom and a gentle float. */
export function MedicineGallery({ name, dosage, form, category, imageUrl, rx }: Props) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const views = MED_VIEWS.filter((v) => hasPicture(medPictureId(name, dosage, v)));
  const [view, setView] = useState<MedView>('front');
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = views.includes(view) ? view : 'front';

  if (imageUrl || views.length === 0) {
    return <PackImage name={name} dosage={dosage} form={form} category={category} imageUrl={imageUrl} rx={rx} />;
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  return (
    <div className="med-gallery" data-testid="med-gallery">
      <div
        className={`med-gallery-main ${reduced ? '' : 'float'}`}
        onPointerMove={onMove}
        onPointerLeave={() => setZoom(null)}
        style={zoom ? { transform: 'scale(1.55)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
      >
        <PackImage name={name} dosage={dosage} form={form} category={category} rx={rx} view={current} />
      </div>
      {views.length > 1 && (
        <div className="med-gallery-thumbs" role="tablist" aria-label={t('med.photoViews')}>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={current === v}
              aria-label={t(`med.view.${v}`)}
              data-testid={`med-view-${v}`}
              onClick={() => setView(v)}
            >
              <PackImage name={name} dosage={dosage} form={form} category={category} rx={rx} view={v} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

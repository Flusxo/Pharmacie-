import type { Lang } from '../i18n';
import type { Medicine } from './types';

/** Medicine texts in the UI language (French if no English version was written). */
export function medicineText(m: Pick<Medicine, 'description' | 'ageNote' | 'descriptionEn' | 'ageNoteEn'>, lang: Lang) {
  return {
    description: (lang === 'en' && m.descriptionEn) || m.description,
    ageNote: (lang === 'en' && m.ageNoteEn) || m.ageNote,
  };
}

/** Picture id of a rendered medicine pack (see scripts/render-assets.ts --meds): the name + dosage as a slug. */
export type MedView = 'front' | 'angle' | 'open';
export const MED_VIEWS: MedView[] = ['front', 'angle', 'open'];
export function medSlug(name: string, dosage: string): string {
  return `${name} ${dosage}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
export const medPictureId = (name: string, dosage: string, view: MedView) => `med-${medSlug(name, dosage)}-${view}`;

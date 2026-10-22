import type { Lang } from '../i18n';
import type { Medicine } from './types';

/** Medicine texts in the UI language (French if no English version was written). */
export function medicineText(m: Pick<Medicine, 'description' | 'ageNote' | 'descriptionEn' | 'ageNoteEn'>, lang: Lang) {
  return {
    description: (lang === 'en' && m.descriptionEn) || m.description,
    ageNote: (lang === 'en' && m.ageNoteEn) || m.ageNote,
  };
}

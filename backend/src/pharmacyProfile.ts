import { z } from 'zod';

/** Short codes a pharmacy can tick on its profile page; the site shows them translated. */
export const SERVICES = ['vaccination', 'blood_pressure', 'orthopedics', 'homeopathy', 'baby_corner', 'night_service'] as const;
export const LANGUAGES = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt'] as const;
export const ACCESSIBILITY = ['step_free', 'wide_door', 'hearing_loop', 'parking'] as const;

export const profileBody = z.object({
  services: z.array(z.enum(SERVICES)).max(SERVICES.length),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length),
  accessibility: z.array(z.enum(ACCESSIBILITY)).max(ACCESSIBILITY.length),
});

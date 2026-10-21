import type { OpeningHours } from './types';

const TZ = 'Europe/Paris';

/** 4.5 -> "4,50 €" (fr) / "€4.50" (en). */
export function formatPrice(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
}

/** DD/MM/YYYY in Europe/Paris (fr-FR and en-GB both use this order). */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export function formatKm(km: number | null | undefined, locale: string): string {
  if (km === null || km === undefined) return '';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** Current weekday and minutes since midnight in Europe/Paris. */
export function parisNow(now = new Date()): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const wd = parts
    .find((p) => p.type === 'weekday')!
    .value.toLowerCase()
    .slice(0, 3);
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return { day: wd as Day, minutes: h * 60 + m };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export type OpenState = { kind: 'duty' } | { kind: 'open'; closesAt: string } | { kind: 'closed'; opensAt: string | null };

/** "Open now / Closes at 19:30 / Closed" from opening hours + on-duty weekdays. */
export function openState(hours: OpeningHours, onDuty: string[], now = new Date()): OpenState {
  const { day, minutes } = parisNow(now);
  if (onDuty.includes(day)) return { kind: 'duty' };
  const today = hours[day] ?? [];
  for (const [from, to] of today) {
    if (minutes >= toMin(from) && minutes < toMin(to)) return { kind: 'open', closesAt: to };
  }
  const later = today.find(([from]) => toMin(from) > minutes);
  return { kind: 'closed', opensAt: later ? later[0] : null };
}

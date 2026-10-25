/**
 * Starts downloading the code of a page when the pointer or keyboard focus reaches a link to it, so the click finds it
 * ready. The import() calls are the same ones App.tsx lazy-loads, so the bundler shares the chunk. Skipped when the
 * visitor asked the browser to save data, and each page is fetched once.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  '/home': () => import('../pages/patient/Home'),
  '/search': () => import('../pages/patient/Search'),
  '/map': () => import('../pages/patient/MapPage'),
  '/requests': () => import('../pages/patient/Requests'),
  '/profile': () => import('../pages/Profile'),
  '/pharmacy': () => import('../pages/pharmacy/PharmacyDashboard'),
  '/doctor': () => import('../pages/doctor/DoctorDashboard'),
  '/admin': () => import('../pages/admin/AdminDashboard'),
  '/contact': () => import('../pages/public/ContactPage'),
};
const done = new Set<string>();

export function prefetchRoute(path: string): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData || done.has(path)) return;
  const load = loaders[path];
  if (!load) return;
  done.add(path);
  void load().catch(() => done.delete(path));
}

/** Props to spread on a link: prefetch on hover and on keyboard focus. */
export const prefetchProps = (to: string) => ({
  onPointerEnter: () => prefetchRoute(to),
  onFocus: () => prefetchRoute(to),
});

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePref = 'system' | 'auto' | 'light' | 'dark';

/** "Auto": dark from 19:00 to 07:00 local time, light the rest of the day. */
export const isNight = (d = new Date()): boolean => d.getHours() >= 19 || d.getHours() < 7;
export type GraphicsPref = 'auto' | 'ultra' | 'high' | 'medium' | 'low' | 'off';
interface Settings {
  theme: ThemePref;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  graphics: GraphicsPref;
  setGraphics: (g: GraphicsPref) => void;
}
const Ctx = createContext<Settings | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // ignore: per-viewer convenience only
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => read<ThemePref>('counter.theme', 'system'));
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => read<string>('counter.reduceMotion', 'false') === 'true');
  const [graphics, setGraphicsState] = useState<GraphicsPref>(() => read<GraphicsPref>('counter.graphics', 'auto'));
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const [night, setNight] = useState(() => isNight());
  useEffect(() => {
    if (theme !== 'auto') return;
    setNight(isNight());
    const id = setInterval(() => setNight(isNight()), 5 * 60_000);
    return () => clearInterval(id);
  }, [theme]);
  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme === 'auto' ? (night ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  const value = useMemo<Settings>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (t) => {
        setThemeState(t);
        write('counter.theme', t);
      },
      reduceMotion,
      setReduceMotion: (v) => {
        setReduceMotionState(v);
        write('counter.reduceMotion', String(v));
      },
      graphics,
      setGraphics: (g) => {
        setGraphicsState(g);
        write('counter.graphics', g);
      },
    }),
    [theme, resolvedTheme, reduceMotion, graphics],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings must be used inside SettingsProvider');
  return c;
}

/** True when the OS asks for reduced motion OR the user switched "Reduce animations" on. */
export function useReducedMotion(): boolean {
  const { reduceMotion } = useSettings();
  const [os, setOs] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => setOs(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduceMotion || os;
}

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';

/**
 * Saved pharmacies: kept in this browser only, per account (nothing is sent to the server). A convenience, so a
 * cleared browser forgets them; the pharmacy is still chosen freely at request time.
 */
const keyFor = (uid: string) => `counter.saved.${uid}`;
const EVENT = 'counter:saved';

function read(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(uid)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useSavedPharmacies() {
  const { user } = useAuth();
  const uid = user?.id ?? 'anonymous';
  const [ids, setIds] = useState<string[]>(() => read(uid));
  useEffect(() => {
    setIds(read(uid));
    const sync = () => setIds(read(uid));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);
  const toggle = useCallback(
    (id: string) => {
      const now = read(uid);
      const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
      try {
        localStorage.setItem(keyFor(uid), JSON.stringify(next));
      } catch {
        /* storage blocked: the heart just does not stick */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [uid],
  );
  return { saved: ids, isSaved: (id: string) => ids.includes(id), toggle };
}

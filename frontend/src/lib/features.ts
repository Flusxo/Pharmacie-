import { useEffect, useState } from 'react';
import { api } from './api';

export interface Features {
  messages: boolean;
  reviews: boolean;
  uploads: boolean;
  slots: boolean;
  signups: boolean;
}
const ALL_ON: Features = { messages: true, reviews: true, uploads: true, slots: true, signups: true };

let loaded: Features | null = null;
let inflight: Promise<Features> | null = null;
const listeners = new Set<(f: Features) => void>();

const load = () => {
  inflight ??= api<Features>('/features')
    .then((f) => {
      loaded = f;
      listeners.forEach((l) => l(f));
      return f;
    })
    .catch(() => ALL_ON)
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** Forget what was loaded (after staff change a switch). */
export const refreshFeatures = () => {
  loaded = null;
  return load();
};

/** Which features are switched on. Everything counts as on until the answer arrives (and if it never does). */
export function useFeatures(): Features {
  const [f, setF] = useState<Features>(loaded ?? ALL_ON);
  useEffect(() => {
    listeners.add(setF);
    if (!loaded) void load();
    else setF(loaded);
    return () => void listeners.delete(setF);
  }, []);
  return f;
}

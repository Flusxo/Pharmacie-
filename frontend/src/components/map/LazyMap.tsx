import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from '../ui';

const PharmacyMap = lazy(() => import('./PharmacyMap'));

/** Leaflet is loaded only when a map is shown. */
export function LazyMap(props: ComponentProps<typeof PharmacyMap>) {
  return (
    <Suspense fallback={<Skeleton h={typeof props.height === 'number' ? props.height : 420} r={22} />}>
      <PharmacyMap {...props} />
    </Suspense>
  );
}

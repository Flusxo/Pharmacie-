import type { ReactNode } from 'react';
import { IconCheck, IconClock, IconPin } from './Icons';

const DEFAULT_ICONS: ReactNode[] = [<IconPin key="a" />, <IconCheck key="b" />, <IconClock key="c" />];

/** Short supporting points: a small icon in an aligned column, then one line each. No bullets, no boxes. */
export function Points({ items, icons = DEFAULT_ICONS }: { items: string[]; icons?: ReactNode[] }) {
  return (
    <ul className="points">
      {items.map((text, i) => (
        <li key={text}>
          <span className="points-icon" aria-hidden="true">
            {icons[i % icons.length]}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

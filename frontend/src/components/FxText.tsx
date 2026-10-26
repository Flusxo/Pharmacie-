import type { ElementType, ReactNode } from 'react';

/**
 * A headline whose letters react to the pointer (see CursorFx): each letter has its own span so the one near the cursor can
 * lift a little and brighten toward the accent colour. Only headlines are split; the heading keeps its plain text as its
 * accessible name and the letters are hidden from screen readers. Words never break in the middle.
 */
export function FxHeadline({
  text,
  as: Tag = 'h1',
  id,
  className = '',
}: {
  text: string;
  as?: ElementType;
  id?: string;
  className?: string;
}) {
  const words = text.split(' ');
  return (
    <Tag id={id} className={`fx-headline ${className}`.trim()} aria-label={text} data-fx="letters">
      {words.map((w, wi) => (
        <span key={wi}>
          <span className="fx-w" aria-hidden="true">
            {[...w].map((ch, i) => (
              <span key={i} className="fx-l" data-c={ch}>
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}

/** A key word inside running text: the whole word brightens when the pointer is near (no splitting, no listeners). */
export function FxKey({ children }: { children: string }) {
  return (
    <span className="fx-key" data-fx="word" data-c={children}>
      {children}
    </span>
  );
}

export type { ReactNode };

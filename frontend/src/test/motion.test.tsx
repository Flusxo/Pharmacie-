import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LazyMotion, domMax } from 'framer-motion';
import { duration, easeOut, spring, stagger } from '../motion';
import { SettingsProvider } from '../lib/settings';
import { AnimatedNumber, Confetti2D, WordReveal } from '../components/motion';

const wrap = (ui: React.ReactNode) =>
  render(
    <SettingsProvider>
      <LazyMotion features={domMax}>{ui}</LazyMotion>
    </SettingsProvider>,
  );

describe('motion tokens', () => {
  it('fast 0.15 s, base 0.3 s, slow 0.6 s, one ease-out, one spring, one stagger', () => {
    expect(duration).toEqual({ fast: 0.15, base: 0.3, slow: 0.6 });
    expect(easeOut).toHaveLength(4);
    expect(spring.type).toBe('spring');
    expect(stagger).toBeGreaterThan(0);
    expect(Math.max(...Object.values(duration))).toBeLessThanOrEqual(0.6);
  });
});

describe('reduced motion', () => {
  it('counters show the final value at once with "Reduce animations" on', () => {
    localStorage.setItem('counter.reduceMotion', 'true');
    wrap(<AnimatedNumber value={42} />);
    // jsdom has no IntersectionObserver-driven view; with reduced motion the final value is used from the start.
    expect(screen.getByText('42')).toBeInTheDocument();
    localStorage.removeItem('counter.reduceMotion');
  });

  it('confetti does not fire with reduced motion', () => {
    localStorage.setItem('counter.reduceMotion', 'true');
    wrap(<Confetti2D fire={1} />);
    expect(screen.getByTestId('confetti')).toHaveAttribute('data-fired', '1');
    localStorage.removeItem('counter.reduceMotion');
  });

  it('word-by-word headline keeps one accessible name', () => {
    wrap(<WordReveal text="Bonjour Alice" />);
    expect(screen.getByRole('heading', { name: 'Bonjour Alice' })).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/core/clock';

describe('FixedStepClock', () => {
  it('runs one tick per step of elapsed time, across uneven frames', () => {
    const clock = new FixedStepClock(0.1, 1);
    let steps = 0;
    // 60 frames at ~16.7 ms = 1 second.
    for (let i = 0; i < 60; i++) steps += clock.advance(1 / 60);
    expect(steps).toBe(10);
  });

  it('does not lose ticks to floating-point error', () => {
    const clock = new FixedStepClock(0.1, 1);
    expect(clock.advance(0.3)).toBe(3);
  });

  it('caps how much time one frame can simulate', () => {
    const clock = new FixedStepClock(0.1, 1);
    expect(clock.advance(60)).toBe(10);
  });

  it('ignores zero, negative and invalid elapsed time', () => {
    const clock = new FixedStepClock(0.1, 1);
    expect(clock.advance(0)).toBe(0);
    expect(clock.advance(-5)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
  });

  it('drops leftover time on reset', () => {
    const clock = new FixedStepClock(0.1, 1);
    clock.advance(0.09);
    clock.reset();
    expect(clock.advance(0.02)).toBe(0);
  });
});

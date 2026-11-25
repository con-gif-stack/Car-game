import { describe, expect, it } from 'vitest';
import { PROFILES, simulate } from '../src/sim/simulate';

/*
 * The design doc's pacing rules, checked against the balance simulator.
 * If a data change breaks one of these, run `npm run simulate` to see the full timeline.
 */
describe.each(PROFILES)('balance: $name player', (profile) => {
  const result = simulate(profile);

  it('reaches the top part tier everywhere', () => {
    expect(result.finished).toBe(true);
  });

  it('never waits more than a week for the next part tier (the one-week rule)', () => {
    expect(result.longestTierWait.days).toBeLessThanOrEqual(7);
  });

  it('always has something to buy within two days', () => {
    expect(result.longestPurchaseGap.days).toBeLessThanOrEqual(2);
  });

  it('makes a first purchase on the first day', () => {
    expect(result.purchases[0]?.day ?? Infinity).toBeLessThan(1);
  });
});

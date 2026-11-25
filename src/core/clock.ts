/**
 * Turns variable frame times into a whole number of fixed-length ticks, so the simulation
 * runs at the same rate whatever the screen's frame rate is.
 */
export class FixedStepClock {
  private accumulator = 0;

  constructor(
    readonly stepSeconds: number,
    private readonly maxCatchUpSeconds: number,
  ) {
    if (!(stepSeconds > 0)) throw new Error('stepSeconds must be positive');
  }

  /** Adds real elapsed time and returns how many ticks should run now. */
  advance(elapsedSeconds: number): number {
    if (!(elapsedSeconds > 0)) return 0;
    this.accumulator += Math.min(elapsedSeconds, this.maxCatchUpSeconds);
    // The small epsilon stops floating-point error from dropping a tick (e.g. 0.3 / 0.1 = 2.9999…).
    const steps = Math.floor(this.accumulator / this.stepSeconds + 1e-9);
    this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds);
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

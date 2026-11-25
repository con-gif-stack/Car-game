/*
 * Idle economy numbers. Placeholders until balancing in Step 3; tune here, not in code.
 */
export const ECONOMY = {
  idleDriving: {
    /** Idle cruising speed with zero power (km/h). */
    baseSpeedKmh: 20,
    /** Extra idle speed per point of Power (km/h). */
    speedKmhPerPower: 0.35,
    /** Money earned per km driven. The starter car (58 hp, ~40 km/h) earns about 1 per second. */
    moneyPerKm: 90,
  },
  offline: {
    /** Longest time away that still earns (open question 5; placeholder). */
    capHours: 8,
    /** Share of the normal idle rate earned while away (1 = full rate). */
    efficiency: 1,
    /** Shorter absences are added straight away, without the "Welcome back" summary. */
    minSecondsForSummary: 60,
  },
} as const;

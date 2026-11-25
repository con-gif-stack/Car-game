/**
 * Prints the balance simulation for each player type: `npm run simulate`.
 * Tune numbers in src/data/economy.ts and src/data/vehicles.ts, then run this again.
 */
import { formatReport, PROFILES, simulate } from '../src/sim/simulate';

for (const profile of PROFILES) {
  console.log(formatReport(simulate(profile)));
  console.log('');
}

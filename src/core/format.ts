const NAMED_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Suffix for 1000^tier: K, M, B, … Dc, then aa, ab, … zz for bigger numbers. */
function suffixForTier(tier: number): string {
  const named = NAMED_SUFFIXES[tier];
  if (named !== undefined) return named;
  const index = tier - NAMED_SUFFIXES.length;
  return `${LETTERS[Math.floor(index / 26) % 26]}${LETTERS[index % 26]}`;
}

/**
 * Formats a number for display: whole numbers below 1,000, then three significant digits with
 * a suffix (1.23K, 45.6M, 789B). Values are rounded down, so a player never sees more than they have.
 */
export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '?';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1000) return sign + Math.floor(abs).toString();

  let tier = Math.floor(Math.log10(abs) / 3);
  let scaled = abs / 10 ** (tier * 3);
  // Correct any floating-point error in log10 near the tier boundaries.
  if (scaled >= 1000) {
    tier += 1;
    scaled /= 1000;
  } else if (scaled < 1) {
    tier -= 1;
    scaled *= 1000;
  }

  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = 10 ** decimals;
  const truncated = Math.floor(scaled * factor + 1e-9) / factor;
  return sign + truncated.toFixed(decimals) + suffixForTier(tier);
}

/** Formats a duration: 45s, 3m 12s, 2h 05m, 3d 04h. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) return `${days}d ${pad(hours)}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (minutes > 0) return `${minutes}m ${pad(secs)}s`;
  return `${secs}s`;
}

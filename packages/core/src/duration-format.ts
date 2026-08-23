/**
 * Formats a duration in seconds into a compact string (e.g., "1h 15m", "45m", "3m").
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) {
    throw new Error('Duration cannot be negative');
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

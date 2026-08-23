/**
 * Formats a distance in meters to a human-readable string.
 * - Under 1000m: Returns meters (e.g., "150m")
 * - 1000m and above: Returns kilometers with 1 decimal place (e.g., "1.2km")
 */
export function formatDistance(meters: number): string {
  if (meters < 0) {
    throw new Error('Distance cannot be negative');
  }

  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }

  const km = meters / 1000;
  // Format to 1 decimal place, but drop the decimal if it's .0
  const formattedKm = km.toFixed(1).replace(/\.0$/, '');
  return `${formattedKm}km`;
}

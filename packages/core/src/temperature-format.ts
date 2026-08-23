/**
 * Formats a temperature in Celsius.
 */
export function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}°C`;
}

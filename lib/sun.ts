/**
 * lib/sun.ts — where the sun is, from the clock alone.
 *
 * Low-precision solar position (the standard NOAA/Meeus simplification),
 * accurate to ~0.2° — far beyond what an ambient tint needs. Pure math:
 * no dependencies, no network, no permissions.
 */

const RAD = Math.PI / 180;

/** Solar elevation above the horizon, in degrees, at `date` over lat/lon. */
export function sunElevationDeg(date: Date, latDeg: number, lonDeg: number): number {
  // Days since J2000.0 (2000-01-01 12:00 UTC).
  const d = date.getTime() / 86_400_000 - 10_957.5;
  const g = RAD * ((357.529 + 0.98560028 * d) % 360); // mean anomaly
  const q = (280.459 + 0.98564736 * d) % 360; // mean longitude
  const L = RAD * (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)); // ecliptic longitude
  const e = RAD * (23.439 - 0.00000036 * d); // obliquity of the ecliptic
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const raDeg = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24;
  const lstDeg = (((gmstHours * 15 + lonDeg) % 360) + 360) % 360;
  const hourAngle = RAD * (((lstDeg - raDeg + 540) % 360) - 180);
  const lat = RAD * latDeg;
  const sinElev =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(sinElev) / RAD;
}

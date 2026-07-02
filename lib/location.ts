/**
 * lib/location.ts — where a feeling lands.
 *
 * The permission prompt appears at INTENT (first orb touch), never on page
 * load; by the time the gesture releases (~1–2 s later) the fix is usually
 * warm, so commit reads it synchronously and the bloom is never delayed by
 * the network or a dialog. Denied / unavailable → the caller falls back to
 * the viewport center (Ben's call).
 */

type Fix = { lng: number; lat: number; at: number };

let watchId: number | null = null;
let lastFix: Fix | null = null;
let denied = false;

/** Idempotent: begin (or keep) warming the location cache. */
export function armLocation(): void {
  if (watchId !== null || denied) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    denied = true;
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      lastFix = { lng: coords.longitude, lat: coords.latitude, at: Date.now() };
      // One good fix is enough — release the GPS (battery). Each orb touch
      // re-arms; maximumAge makes the refresh instant while the fix is warm.
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        denied = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    },
    { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
  );
}

/** The freshest known position, or null (not yet fixed / denied). */
export function currentFix(): { lng: number; lat: number } | null {
  return lastFix ? { lng: lastFix.lng, lat: lastFix.lat } : null;
}

/** True once the person has explicitly declined. */
export function locationDenied(): boolean {
  return denied;
}

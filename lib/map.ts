/**
 * Map constants. The base map is Mapbox dark; deck.gl draws the glow on top.
 * Real style tuning and camera behaviour land with the beautiful empty map.
 */

/** Public Mapbox token (client-side by design). */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Dark base so color reads only from the emotional glow. */
export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

/** Opening camera (placeholder — NYC). */
export const INITIAL_VIEW_STATE = {
  longitude: -73.9857,
  latitude: 40.7484,
  zoom: 11,
  pitch: 0,
  bearing: 0,
} as const;

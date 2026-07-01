/**
 * Map constants. The base map is Mapbox dark; deck.gl draws the glow on top.
 * Real style tuning and camera behaviour land with the beautiful empty map.
 */

/** Public Mapbox token (client-side by design). */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Dark base so color reads only from the emotional glow. */
export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

/**
 * Opening camera — Manhattan, tilted. The pitch + slight bearing give the map
 * weight the moment it loads (Apple-Maps-at-night feel).
 */
export const INITIAL_VIEW_STATE = {
  longitude: -73.98,
  latitude: 40.75,
  zoom: 11.2,
  pitch: 45,
  bearing: -18,
} as const;

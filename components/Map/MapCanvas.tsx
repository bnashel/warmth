"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { Map } from "react-map-gl/mapbox";
import { INITIAL_VIEW_STATE, MAP_STYLE, MAPBOX_TOKEN } from "@/lib/map";

/**
 * The full-screen base map. Client-only (mapbox needs the DOM).
 * Step 1: stock dark base + a weighty tilted camera. Custom style, glow, pulse,
 * and idle drift come in later steps.
 */
export default function MapCanvas() {
  if (!MAPBOX_TOKEN) return <MissingToken />;

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={MAP_STYLE}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      maxPitch={70}
      dragRotate
      pitchWithRotate
      touchZoomRotate
      touchPitch
      reuseMaps
    />
  );
}

/** Shown until NEXT_PUBLIC_MAPBOX_TOKEN is set — keeps dev/build working. */
function MissingToken() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <p className="max-w-sm text-sm leading-6 text-foreground/50">
        Add your Mapbox token to{" "}
        <code className="text-foreground/70">.env.local</code> as{" "}
        <code className="text-foreground/70">NEXT_PUBLIC_MAPBOX_TOKEN</code> to
        light up the map.
      </p>
    </div>
  );
}

"use client";

import { ATMOSPHERE } from "./tune";
import { worldFromUrl } from "./solar";

/* Colorless film grain (feTurbulence desaturated to zero — the one law holds
 * even for noise). A static 160px tile, composited once; costs no frames. */
const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

/**
 * Depth for the void: gentle vignette pulling the eye to the city, static
 * grain keeping the darkness from feeling digital — plus the whisper-quiet
 * Mapbox attribution (required by ToS; the one law has no chrome exception).
 * All single composited layers — zero per-frame cost.
 */
export function Atmosphere() {
  // THE PAPER WORLD: the same two layers become the sheet's MATERIAL —
  // dark fibers pressed INTO the paper (multiply, never white noise
  // floating above) and a warm vignette like light falling off a desk.
  const paper = worldFromUrl() === "paper";
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          background: paper
            ? `radial-gradient(140% 100% at 50% 44%, rgba(0,0,0,0) 55%, rgba(58,50,38,${ATMOSPHERE.paper.vignette}) 100%)`
            : `radial-gradient(140% 100% at 50% 44%, rgba(0,0,0,0) 52%, rgba(3,4,7,${ATMOSPHERE.vignette}) 100%)`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          backgroundImage: GRAIN_URI,
          backgroundRepeat: "repeat",
          opacity: paper ? ATMOSPHERE.paper.grain : ATMOSPHERE.grain,
          mixBlendMode: paper ? "multiply" : "normal",
        }}
      />
      <style>{`
        .mapboxgl-ctrl-attrib { background: transparent !important; }
        .mapboxgl-ctrl-attrib a { color: rgba(255,255,255,0.28) !important; font-size: 10px; }
        .mapboxgl-ctrl-logo { opacity: 0.32; }
        .mapboxgl-ctrl-attrib.mapboxgl-compact { background: rgba(10,11,15,0.6) !important; }
        .mapboxgl-ctrl-attrib-button {
          opacity: 0.3 !important;
          filter: grayscale(1) brightness(1.6);
          outline: none;
        }
        /* Keep ToS chrome clear of the iPhone home indicator. */
        .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right {
          margin-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </>
  );
}

export function MissingToken() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ maxWidth: 340, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
        set <code style={{ color: "rgba(255,255,255,0.7)" }}>NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
        <code style={{ color: "rgba(255,255,255,0.7)" }}>.env.local</code> and restart. the map
        renders here
      </p>
    </div>
  );
}

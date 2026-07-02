"use client";

import { Inter } from "next/font/google";
import { MAPBOX_TOKEN } from "@/lib/map";
import { ATMOSPHERE } from "./tune";
import MapStage from "./MapStage";

/* Colorless film grain (feTurbulence desaturated to zero — the one law holds
 * even for noise). A static 160px tile, composited once; costs no frames. */
const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * The map lab: Ink & Glow (Ben's pick — the other candidates are deleted),
 * with the glow test data always on. No chrome beyond a quiet, ToS-required
 * attribution.
 */
export default function MapLab() {
  return (
    <div
      className={inter.className}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0B0F",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {MAPBOX_TOKEN ? <MapStage /> : <MissingToken />}

      {/* Atmosphere: the void has depth. A gentle vignette pulls the eye to
          the city; static grain keeps the darkness from feeling digital.
          Both are single composited layers — zero per-frame cost. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          background: `radial-gradient(140% 100% at 50% 44%, rgba(0,0,0,0) 52%, rgba(3,4,7,${ATMOSPHERE.vignette}) 100%)`,
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
          opacity: ATMOSPHERE.grain,
        }}
      />

      {/* Mapbox attribution is required (ToS) — kept, but made quiet.
          The compact ⓘ toggle ships with a bright default icon; it gets the
          same whisper treatment as everything else (the one law has no
          exceptions for chrome). */}
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
      `}</style>
    </div>
  );
}

function MissingToken() {
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
        Set <code style={{ color: "rgba(255,255,255,0.7)" }}>NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
        <code style={{ color: "rgba(255,255,255,0.7)" }}>.env.local</code> and restart — the
        three map candidates render here.
      </p>
    </div>
  );
}

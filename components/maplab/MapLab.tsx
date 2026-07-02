"use client";

import { useState } from "react";
import { Inter } from "next/font/google";
import { MAPBOX_TOKEN } from "@/lib/map";
import { CANDIDATES, type CandidateId } from "./tune";
import MapStage from "./MapStage";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * The map lab: three full style candidates, switchable live ("1 2 3"),
 * judged with the fake glow always on. No chrome beyond the switcher and a
 * quiet, ToS-required attribution.
 */
export default function MapLab() {
  const [candidate, setCandidate] = useState<CandidateId>(1);

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
      {MAPBOX_TOKEN ? <MapStage candidate={candidate} /> : <MissingToken />}

      {/* Candidate switcher — whisper chrome, top-center. */}
      <div
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 20px)",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 22,
          zIndex: 10,
        }}
      >
        {([1, 2, 3] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={CANDIDATES[c].name}
            onClick={() => setCandidate(c)}
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              color: `rgba(255,255,255,${c === candidate ? 0.7 : 0.3})`,
              background: "none",
              border: "none",
              padding: "8px 6px",
              cursor: "pointer",
            }}
          >
            {c}
          </button>
        ))}
      </div>

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

"use client";

/**
 * components/Map/EmotionLegend.tsx — which color is which feeling.
 *
 * Five glowing dots and lowercase names, bottom-left above the account
 * chip: ambient, not a data-viz key. Colors flow straight from
 * lib/theme.ts (never hardcoded) and the list maps over EMOTIONS, so a
 * palette change or a sixth emotion arrives here for free. A soft
 * ink-glass backing keeps it legible over the night worlds AND the
 * paper world without belonging to either.
 */
import { EMOTIONS, EMOTION_HUES } from "@/lib/theme";

export default function EmotionLegend() {
  return (
    <div
      aria-label="what each color means"
      style={{
        position: "absolute",
        left: 16,
        bottom: "max(env(safe-area-inset-bottom), 96px)",
        zIndex: 9, // under the panels/chips, over the map
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(10,11,15,0.42)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(233,236,244,0.08)",
        pointerEvents: "none", // purely informative — never steals a tap
      }}
    >
      {EMOTIONS.map((e) => (
        <div key={e} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: EMOTION_HUES[e],
              boxShadow: `0 0 8px ${EMOTION_HUES[e]}, 0 0 2px ${EMOTION_HUES[e]}`,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 300,
              letterSpacing: "0.06em",
              color: "rgba(240,238,232,0.82)",
            }}
          >
            {e}
          </span>
        </div>
      ))}
    </div>
  );
}

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
 *
 * THE EMOTION LENS (private redesign, 2026-07-17): in the private view
 * the legend becomes a hand — tap a feeling and the map keeps only it
 * at full presence (where does my calm live?); tap again to release.
 * Public view stays purely informative, exactly as before.
 */
import { useEffect, useState } from "react";
import { EMOTIONS, EMOTION_HUES, type Emotion } from "@/lib/theme";
import { currentLens, onLensChange, setLens } from "@/lib/emotionLens";

export default function EmotionLegend({ interactive = false }: { interactive?: boolean }) {
  // Mirrors the lens store (OneScreen clears it on leaving private).
  const [active, setActive] = useState<Emotion | null>(null);
  useEffect(() => onLensChange(() => setActive(currentLens())), []);

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
        gap: interactive ? 3 : 7,
        padding: interactive ? "7px 8px" : "10px 12px",
        borderRadius: 14,
        background: "rgba(10,11,15,0.42)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(233,236,244,0.08)",
        // Purely informative in public — never steals a tap from the map.
        pointerEvents: interactive ? "auto" : "none",
        transition: "gap 300ms ease, padding 300ms ease",
      }}
    >
      {EMOTIONS.map((e) => {
        const dimmed = active !== null && active !== e;
        const row = (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: EMOTION_HUES[e],
                boxShadow:
                  active === e
                    ? `0 0 12px 2px ${EMOTION_HUES[e]}, 0 0 3px ${EMOTION_HUES[e]}`
                    : `0 0 8px ${EMOTION_HUES[e]}, 0 0 2px ${EMOTION_HUES[e]}`,
                opacity: dimmed ? 0.3 : 1,
                transition: "opacity 300ms ease, box-shadow 300ms ease",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: active === e ? 500 : 300,
                letterSpacing: "0.06em",
                color: `rgba(240,238,232,${dimmed ? 0.35 : 0.82})`,
                transition: "color 300ms ease",
              }}
            >
              {e}
            </span>
          </>
        );
        return interactive ? (
          <button
            key={e}
            type="button"
            aria-pressed={active === e}
            aria-label={`show only ${e}`}
            onClick={() => setLens(active === e ? null : e)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 4px",
              margin: 0,
              border: "none",
              borderRadius: 8,
              background: active === e ? "rgba(233,236,244,0.07)" : "transparent",
              cursor: "pointer",
              touchAction: "manipulation",
              transition: "background 300ms ease",
            }}
          >
            {/* Invisible reach (the house pattern): the row stays a
                whisper, the thumb gets closer to 44px. */}
            <span aria-hidden style={{ position: "absolute", inset: "-6px -8px" }} />
            {row}
          </button>
        ) : (
          <div key={e} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {row}
          </div>
        );
      })}
    </div>
  );
}

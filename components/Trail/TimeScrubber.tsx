"use client";

/**
 * components/Trail/TimeScrubber.tsx — drag back through your year
 * (private-mode redesign, 2026-07-17).
 *
 * A quiet hairline above the orb, private view only: the left end is the
 * journal's first day, the right end is now. Drag the thumb and the map
 * replays — lanterns kindle as their moments arrive, the month whispers
 * above your finger. Release near the right edge (or tap "now") and the
 * thumb springs home, the journal returns to the present.
 *
 * The scrub state itself lives outside React (lib/timeScrub.ts); the
 * trail pipeline reads it every push. This component is only the hand.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, animate } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { scrubTo } from "@/lib/timeScrub";

/** Within this fraction of the right edge the release means "back to now". */
const NOW_SNAP = 0.97;

function monthLabel(t: number): string {
  const d = new Date(t);
  const month = d.toLocaleDateString(undefined, { month: "long" });
  return d.getFullYear() === new Date().getFullYear() ? month : `${month} ${d.getFullYear()}`;
}

export function TimeScrubber({
  startMs,
  ink,
}: {
  /** The journal's first moment (epoch ms) — the left end of the line. */
  startMs: number;
  /** Loose-chrome ink color for the current ground (paperText upstream). */
  ink: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // 1 = now (live). Anything less = scrubbed into the past.
  const [frac, setFrac] = useState(1);
  const fracRef = useRef(1);
  const homing = useRef<{ stop: () => void } | null>(null);

  const apply = (f: number) => {
    fracRef.current = f;
    setFrac(f);
    scrubTo(f >= NOW_SNAP ? null : startMs + f * (Date.now() - startMs));
  };

  const fromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return fracRef.current;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
  };

  /** The spring home: the year re-kindles on the way back to now. */
  const goHome = () => {
    homing.current?.stop();
    homing.current = animate(fracRef.current, 1, {
      ...SPRING.settle,
      onUpdate: (v: number) => apply(v),
      onComplete: () => apply(1),
    });
  };

  // Leaving the private view (unmount) always returns the journal to now.
  useEffect(
    () => () => {
      homing.current?.stop();
      scrubTo(null);
    },
    [],
  );

  const live = frac >= NOW_SNAP && !dragging;
  return (
    <div
      style={{
        // Fills its placed wrapper (OneScreen owns the placement — a
        // transformed motion wrapper must be the containing block).
        position: "absolute",
        inset: 0,
        touchAction: "none",
        cursor: "pointer",
      }}
      onPointerDown={(e) => {
        homing.current?.stop();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        apply(fromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging) apply(fromClientX(e.clientX));
      }}
      onPointerUp={() => {
        setDragging(false);
        if (fracRef.current >= NOW_SNAP) goHome();
      }}
      onPointerCancel={() => {
        setDragging(false);
        goHome();
      }}
    >
      {/* The line: the journal's whole span. */}
      <div
        ref={trackRef}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 19,
          height: 2,
          borderRadius: 1,
          background: "rgba(233,236,244,0.13)",
        }}
      />
      {/* The lived part — everything the thumb has passed. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          width: `${frac * 100}%`,
          top: 19,
          height: 2,
          borderRadius: 1,
          background: "rgba(233,236,244,0.34)",
        }}
      />
      {/* The thumb. */}
      <motion.div
        animate={{ scale: dragging ? 1.35 : 1 }}
        transition={SPRING.snappy}
        style={{
          position: "absolute",
          left: `${frac * 100}%`,
          top: 20,
          x: "-50%",
          y: "-50%",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "rgba(16,17,22,0.9)",
          border: "1.5px solid rgba(233,236,244,0.75)",
          boxShadow: "0 1px 8px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
      {/* The month, whispered above the thumb while in the past. */}
      <AnimatePresence>
        {!live && (
          <motion.span
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: `${Math.min(92, Math.max(8, frac * 100))}%`,
              top: -16,
              x: "-50%",
              padding: "4px 11px",
              borderRadius: 999,
              background: "rgba(10,11,15,0.66)",
              border: "1px solid rgba(233,236,244,0.13)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "rgba(233,236,244,0.88)",
              fontSize: 11.5,
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {monthLabel(startMs + frac * (Date.now() - startMs))}
          </motion.span>
        )}
      </AnimatePresence>
      {/* "now" — always the right end; a tap brings the journal home. */}
      <button
        type="button"
        aria-label="Return to now"
        onClick={goHome}
        style={{
          position: "absolute",
          right: -12,
          top: -14,
          padding: "6px 12px",
          border: "none",
          background: "transparent",
          color: ink,
          opacity: live ? 0.42 : 0.85,
          fontSize: 10.5,
          letterSpacing: "0.08em",
          cursor: "pointer",
          transition: "opacity 300ms ease",
          touchAction: "manipulation",
        }}
      >
        now
      </button>
    </div>
  );
}

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
import { scrubTime, scrubTo } from "@/lib/timeScrub";

/** Within this fraction of the right edge the thumb means "now" (live). */
const NOW_SNAP = 0.97;
/** Releasing a drag this close to the edge springs the rest of the way
 *  home — a generous band, so "almost now" never strands the journal a
 *  breath in the past (design review blocker). */
const HOME_BAND = 0.94;

/** Where the thumb stands for the CURRENT scrub state — the hand may
 *  remount mid-scrub (a memory card hides it) and must pick up its
 *  place in time, never silently reset it (code review). */
function initFrac(startMs: number): number {
  const t = scrubTime();
  if (t === null) return 1;
  return Math.min(1, Math.max(0, (t - startMs) / Math.max(1, Date.now() - startMs)));
}

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
  const [frac, setFrac] = useState(() => initFrac(startMs));
  // The month under the thumb — derived in apply (never in render:
  // the frac→time mapping reads the clock, which render must not).
  const [label, setLabel] = useState(() =>
    monthLabel(startMs + initFrac(startMs) * (Date.now() - startMs)),
  );
  const fracRef = useRef(frac);
  const homing = useRef<{ stop: () => void } | null>(null);

  const apply = (f: number) => {
    // Clamped: the homing spring overshoots by design and must never
    // draw the thumb past the end of the line (code review).
    const c = Math.min(1, Math.max(0, f));
    fracRef.current = c;
    setFrac(c);
    setLabel(monthLabel(startMs + c * (Date.now() - startMs)));
    scrubTo(c >= NOW_SNAP ? null : startMs + c * (Date.now() - startMs));
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

  // Unmount stops the spring but KEEPS the scrub state — a memory card
  // hides the hand, and the user's place in time must survive it (code
  // review). Leaving the private view clears the scrub (OneScreen owns
  // that, alongside the lens).
  useEffect(
    () => () => {
      homing.current?.stop();
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
        // The "now" button owns its own tap — capturing here would
        // retarget the click and kill it (design review blocker).
        if ((e.target as HTMLElement).closest("button")) return;
        homing.current?.stop();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        apply(fromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging) apply(fromClientX(e.clientX));
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(false);
        if (fracRef.current >= HOME_BAND) goHome();
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
              // Clamped short of the right end — the chip must never sit
              // on the "now" label (design review; "now" also yields).
              left: `${Math.min(84, Math.max(8, frac * 100))}%`,
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
            {label}
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
          right: -14,
          top: -18,
          padding: "10px 14px",
          border: "none",
          background: "transparent",
          color: ink,
          // Yields while the month chip drifts near its corner.
          opacity: !live && frac > 0.86 ? 0 : live ? 0.42 : 0.85,
          fontSize: 10.5,
          letterSpacing: "0.08em",
          cursor: "pointer",
          transition: "opacity 300ms ease",
          touchAction: "manipulation",
        }}
      >
        {/* Invisible reach: the label stays a whisper, the thumb gets 44px. */}
        <span aria-hidden style={{ position: "absolute", inset: "-8px -6px" }} />
        now
      </button>
    </div>
  );
}

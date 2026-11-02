"use client";

/**
 * components/Trail/TimeScrubber.tsx — drag back through your year
 * (private-mode redesign, 2026-07-17; moved to the screen's side 07-27,
 * Eli: the bottom strip crowded the orb).
 *
 * A quiet vertical hairline on the right edge, private view only: the top
 * is now, the bottom is the journal's first day. Pull the thumb DOWN and
 * the map replays backward — lanterns kindle as their moments arrive, the
 * month whispers beside your thumb. Release near the top (or tap "now")
 * and the thumb springs home, the journal returns to the present.
 *
 * The scrub state itself lives outside React (lib/timeScrub.ts); the
 * trail pipeline reads it every push. This component is only the hand.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, animate } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { scrubTime, scrubTo } from "@/lib/timeScrub";

/** Within this fraction of the top end the thumb means "now" (live). */
const NOW_SNAP = 0.97;
/** Releasing a drag this close to the top springs the rest of the way
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
  /** The journal's first moment (epoch ms) — the bottom end of the line. */
  startMs: number;
  /** Loose-chrome ink color for the current ground (paperText upstream). */
  ink: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // 1 = now (live, the TOP of the line). Anything less = the past below.
  const [frac, setFrac] = useState(() => initFrac(startMs));
  // The month beside the thumb — derived in apply (never in render:
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

  /** Vertical: the top of the rail is now (frac 1); down is the past. */
  const fromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return fracRef.current;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, 1 - (clientY - r.top) / Math.max(1, r.height)));
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
  const thumbTop = (1 - frac) * 100;
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
        apply(fromClientY(e.clientY));
      }}
      onPointerMove={(e) => {
        if (dragging) apply(fromClientY(e.clientY));
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
      {/* The line: the journal's whole span, now standing upright. */}
      <div
        ref={trackRef}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: 2,
          marginLeft: -1,
          borderRadius: 1,
          background: "rgba(233,236,244,0.13)",
        }}
      />
      {/* The lived part — from the first day up to the thumb. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0,
          height: `${frac * 100}%`,
          left: "50%",
          width: 2,
          marginLeft: -1,
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
          top: `${thumbTop}%`,
          left: "50%",
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
      {/* The month, whispered beside the thumb while in the past. */}
      <AnimatePresence>
        {!live && (
          <motion.span
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 3 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              // To the LEFT of the rail, riding the thumb — clamped short
              // of both ends so it never touches "now" or the screen edge.
              top: `${Math.min(92, Math.max(6, thumbTop))}%`,
              right: "100%",
              marginRight: 10,
              y: "-50%",
              padding: "4px 11px",
              borderRadius: 999,
              background: "rgba(10,11,15,0.66)",
              border: "1px solid rgba(233,236,244,0.13)",
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
      {/* "now" — always the top end; a tap brings the journal home. */}
      <button
        type="button"
        aria-label="Return to now"
        onClick={goHome}
        style={{
          position: "absolute",
          top: -30,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 12px",
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
        {/* Invisible reach: the label stays a whisper, the thumb gets 44px. */}
        <span aria-hidden style={{ position: "absolute", inset: "-8px -6px" }} />
        now
      </button>
    </div>
  );
}

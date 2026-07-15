/**
 * THE AXES — Ben's motif. The public step draws two whisper axes
 * (where × what) and lets a miniature field of feeling breathe on the
 * plane; the private step grows a third receding axis (when) and the
 * feelings sprout ember-trails back along it, one thin thread linking
 * a few into a story. One component, mounted across both steps, so the
 * upgrade from two axes to three is seen, not cut to.
 *
 * SVG pathLength draws (the OrbFlow arc precedent); no SVG filters —
 * glow is layered circles, transform/opacity only.
 */
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EMOTION_HUES, EMOTIONS } from "@/lib/theme";

const W = 300;
const H = 250;
// plane origin (bottom-left) with margin for labels
const OX = 46;
const OY = H - 40;
const AX = W - 34; // x-axis end
const AY = 30; // y-axis top
// the time axis recedes up-right at ~-32°
const TLEN = 120;
const TX = OX + TLEN * Math.cos(-0.56);
const TY = OY + TLEN * Math.sin(-0.56);

const INK = (a: number) => `rgba(233,236,244,${a})`;

/** The miniature field: deterministic feelings on the plane (u,v ∈ 0..1
 *  along where/what), each with a strength that sets size and presence. */
const FIELD_DOTS: Array<{ u: number; v: number; e: keyof typeof EMOTION_HUES; s: number }> = [
  { u: 0.22, v: 0.68, e: "joy", s: 1.0 },
  { u: 0.52, v: 0.38, e: "calm", s: 0.7 },
  { u: 0.72, v: 0.74, e: "love", s: 0.9 },
  { u: 0.38, v: 0.2, e: "gratitude", s: 0.55 },
  { u: 0.62, v: 0.54, e: "energy", s: 0.75 },
  { u: 0.84, v: 0.3, e: "calm", s: 0.5 },
  { u: 0.14, v: 0.34, e: "love", s: 0.45 },
];

/** Which dots the time-thread strings together (indices, story order). */
const THREAD = [6, 3, 1, 4, 2];

const px = (d: { u: number; v: number }) => ({
  x: OX + d.u * (AX - OX),
  y: OY - d.v * (OY - AY),
});

export function AxesFigure({ axes, ghost = false }: { axes: 2 | 3; ghost?: boolean }) {
  const reduced = useReducedMotion();
  const draw = (delay: number) => ({
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: reduced
      ? { duration: 0.15, delay }
      : { pathLength: { duration: 1.1, ease: [0.3, 0, 0.2, 1], delay }, opacity: { duration: 0.3, delay } },
  });
  const threadPoints = THREAD.map((i) => px(FIELD_DOTS[i]));
  const threadD =
    `M ${threadPoints[0].x} ${threadPoints[0].y} ` +
    threadPoints
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ");

  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`}
      width="min(78vw, 340px)"
      style={{ display: "block", overflow: "visible", opacity: ghost ? 0.2 : 1 }}
      aria-hidden
    >
      {/* where — the ground */}
      <motion.line x1={OX} y1={OY} x2={AX} y2={OY} stroke={INK(0.3)} strokeWidth={1} {...draw(0.1)} />
      <motion.text
        x={AX}
        y={OY + 18}
        textAnchor="end"
        fill={INK(0.5)}
        style={{ fontSize: 10, letterSpacing: "0.16em" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        where
      </motion.text>

      {/* what — the feelings, the five hues strung along it */}
      <motion.line x1={OX} y1={OY} x2={OX} y2={AY} stroke={INK(0.3)} strokeWidth={1} {...draw(0.35)} />
      <motion.text
        x={OX - 10}
        y={AY + 4}
        textAnchor="end"
        fill={INK(0.5)}
        style={{ fontSize: 10, letterSpacing: "0.16em" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.5 }}
      >
        what
      </motion.text>
      {EMOTIONS.map((e, i) => (
        <motion.circle
          key={e}
          cx={OX}
          cy={OY - ((i + 1) / (EMOTIONS.length + 1)) * (OY - AY)}
          r={3}
          fill={EMOTION_HUES[e]}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.85 }}
          transition={{ delay: 0.5 + i * 0.09, duration: 0.4 }}
        />
      ))}

      {/* the feelings on the plane — a miniature field, breathing */}
      {FIELD_DOTS.map((d, i) => {
        const p = px(d);
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 + i * 0.14, duration: 0.7 }}
          >
            {/* halo — breathes; core — steady. Tight core, soft falloff. */}
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={10 * d.s + 4}
              fill={EMOTION_HUES[d.e]}
              animate={reduced ? { opacity: 0.16 } : { opacity: [0.1, 0.22], scale: [1, 1.12] }}
              transition={
                reduced
                  ? undefined
                  : {
                      duration: 2.5,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "mirror",
                      delay: i * 0.4,
                    }
              }
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            <circle cx={p.x} cy={p.y} r={2.4 + 1.8 * d.s} fill={EMOTION_HUES[d.e]} opacity={0.35 + 0.5 * d.s} />
          </motion.g>
        );
      })}

      {/* when — the third axis, and time made visible */}
      {axes === 3 && (
        <>
          <motion.line
            x1={OX}
            y1={OY}
            x2={TX}
            y2={TY}
            stroke={INK(0.3)}
            strokeWidth={1}
            strokeDasharray="3 4"
            {...draw(0.15)}
          />
          <motion.text
            x={TX + 8}
            y={TY - 4}
            fill={INK(0.5)}
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
          >
            when
          </motion.text>

          {/* ember-trails: each feeling remembers backward along time —
              older copies smaller and dimmer, settling to an ember floor */}
          {FIELD_DOTS.map((d, i) => {
            const p = px(d);
            return [1, 2].map((k) => (
              <motion.circle
                key={`${i}-${k}`}
                cx={p.x - k * 11 * Math.cos(-0.56)}
                cy={p.y - k * 11 * Math.sin(-0.56)}
                r={(2.4 + 1.8 * d.s) * (1 - k * 0.28)}
                fill={EMOTION_HUES[d.e]}
                initial={{ opacity: 0 }}
                animate={{ opacity: (0.35 + 0.5 * d.s) * (1 - k * 0.32) * 0.6 }}
                transition={{ delay: 0.5 + i * 0.1 + k * 0.16, duration: 0.6 }}
              />
            ));
          })}

          {/* the thread through time — one story, place to place */}
          <motion.path
            d={threadD}
            fill="none"
            stroke={INK(0.3)}
            strokeWidth={1}
            {...draw(1.2)}
          />
        </>
      )}
    </motion.svg>
  );
}

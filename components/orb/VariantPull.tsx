"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type Transition,
} from "framer-motion";
import {
  BURST,
  GLOW,
  INTENSITY,
  ORB,
  PULL,
  REDUCED_MOTION,
  SPRINGS,
  TEXT,
  clampStep,
  pulseAmpForStep,
  pulsePeriodForStep,
  scaleForStep,
} from "@/lib/feel";
import { EMOTIONS, EMOTION_HUES, type Emotion } from "@/lib/theme";
import {
  cancelTick,
  commitSwell,
  setHumLevel,
  startHum,
  stopHum,
  tick,
  unlockAudio,
} from "@/lib/sound";
import { Orb } from "./Orb";
import { CommitBurst } from "./CommitBurst";
import { usePulse, useOklchColor, useSessionFlag } from "./hooks";
import { mixHexRgbString } from "./oklch";
import type { VariantId } from "./LabShell";

/* Arc geometry — six dots on a 150° arc over the orb. Precomputed once. */
const ARC_START_DEG = -90 - PULL.arcDegrees / 2;
const DOT_POS = EMOTIONS.map((_, i) => {
  const deg = ARC_START_DEG + (PULL.arcDegrees / (EMOTIONS.length - 1)) * i;
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * PULL.arcRadiusPx, y: Math.sin(rad) * PULL.arcRadiusPx };
});
/* Horizontal span of the arc — thumb x maps across this. */
const ARC_SPAN = DOT_POS[DOT_POS.length - 1].x - DOT_POS[0].x;

type Phase = "idle" | "engaged" | "shaping" | "bursting";

/**
 * VARIANT A — PULL. The slot-machine gesture: press (dots fan out), slide to
 * choose a hue, hold a beat, pull upward to charge 1–7 (44px/step, rubber wall
 * past max), release to fire. Cancel = bring it back home and let go.
 *
 * All continuous motion runs through motion values — zero React re-renders on
 * pointermove. React state changes only on discrete transitions.
 */
export function VariantPull({
  hintWord,
  gestureDepth,
}: {
  variant: VariantId;
  hintWord: string;
  gestureDepth: MotionValue<number>;
}) {
  const reduced = useReducedMotion();
  /** Spring vs reduced-motion fade, per the spec's a11y rule. */
  const spring = (s: Transition): Transition =>
    reduced ? { duration: REDUCED_MOTION.fadeMs / 1000 } : s;

  /* ---------- discrete React state ---------- */
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [burst, setBurst] = useState<{ seed: number; rgb: string } | null>(null);
  const [hintDead, setHintDead] = useState(false);
  const [getHintFlag, setHintFlag] = useSessionFlag("warmth-lab-committed");
  useEffect(() => setHintDead(getHintFlag()), [getHintFlag]);

  /* ---------- continuous motion values ---------- */
  const stepScale = useMotionValue(1); // spring-chased per step
  const rubberExtra = useMotionValue(0); // continuous overstretch past max
  const pulsePeriod = useMotionValue<number>(ORB.breath.periodS);
  const pulseAmp = useMotionValue<number>((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
  const pulse = usePulse(pulsePeriod, pulseAmp);
  const scale = useTransform(() => (stepScale.get() + rubberExtra.get()) * pulse.get());
  const haloAlpha = useMotionValue<number>(GLOW.haloAlpha.rest);
  const { rgb, fadeTo, snapTo } = useOklchColor(ORB.restHue);

  /* ---------- gesture refs (never trigger renders) ---------- */
  const g = useRef({
    startX: 0,
    startY: 0,
    activeIdx: null as number | null,
    locked: false,
    shaping: false,
    shapeBaseY: 0,
    holdReadyAt: 0,
    step: 1,
    burstSeq: 0,
  });
  const scaleAnim = useRef<ReturnType<typeof animate> | null>(null);
  const colorAnim = useRef<ReturnType<typeof animate> | null>(null);

  function driveScale(target: number, s = spring(INTENSITY.spring)) {
    scaleAnim.current?.stop();
    scaleAnim.current = animate(stepScale, target, s);
  }

  /* ---------- gesture machine ---------- */
  function onPointerDown(e: React.PointerEvent) {
    if (phase === "bursting") return; // re-armed via BURST.rearmMs
    e.currentTarget.setPointerCapture(e.pointerId);
    unlockAudio();
    const st = g.current;
    st.startX = e.clientX;
    st.startY = e.clientY;
    st.locked = false;
    st.shaping = false;
    st.step = 1;
    st.holdReadyAt = performance.now() + PULL.holdBeforeShapeS * 1000;

    setPhase("engaged");
    animate(gestureDepth, 1, { duration: 0.15 });
    driveScale(PULL.pressScale, spring(SPRINGS.snappy)); // one-frame press response
    startHum();

    // Nearest dot activates immediately (center-biased on a clean press).
    updateChoice(e.clientX, true);
  }

  function updateChoice(clientX: number, initial = false) {
    const st = g.current;
    if (st.locked) return;
    const dx = clientX - st.startX;
    const t = Math.min(1, Math.max(0, (dx - DOT_POS[0].x) / ARC_SPAN));
    const idx = Math.round(t * (EMOTIONS.length - 1));
    if (idx !== st.activeIdx) {
      st.activeIdx = idx;
      st.holdReadyAt = performance.now() + PULL.holdBeforeShapeS * 1000; // hold resets
      setActiveIdx(idx); // discrete transition — allowed render
      fadeTo(EMOTION_HUES[EMOTIONS[idx]]); // 150ms OKLCH becoming
      if (!initial) tick(idx + 1, { soft: true }); // micro-tick per crossing
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = g.current;
    if (phase !== "engaged" && phase !== "shaping") return;

    updateChoice(e.clientX);

    const dy = st.startY - e.clientY; // + = upward pull

    // Unlock shaping: emotion held long enough + a real upward pull.
    if (!st.shaping && st.activeIdx !== null && performance.now() >= st.holdReadyAt && dy > 6) {
      st.shaping = true;
      st.locked = true; // v1: emotion locks once shaping starts
      st.shapeBaseY = e.clientY;
      setPhase("shaping"); // dots duck out of the way
    }

    if (st.shaping) {
      const pulled = st.shapeBaseY - e.clientY;
      const raw = 1 + pulled / PULL.pxPerStep;
      const step = clampStep(Math.round(raw));

      // Rubber wall past max — extra movement lands at ×0.25 as pure stretch.
      if (raw > INTENSITY.steps) {
        const perStep = (INTENSITY.scaleAtMax - INTENSITY.scaleAt1) / (INTENSITY.steps - 1);
        rubberExtra.set((raw - INTENSITY.steps) * PULL.rubberBand * perStep);
      } else {
        rubberExtra.set(0);
      }

      if (step !== st.step) {
        st.step = step;
        // Same-frame trio: sound + size + pulse land together.
        tick(step);
        driveScale(scaleForStep(step));
        pulsePeriod.set(pulsePeriodForStep(step));
        pulseAmp.set(pulseAmpForStep(step));
        setHumLevel((step - 1) / (INTENSITY.steps - 1));
        animate(haloAlpha, GLOW.haloAlpha.rest +
          ((step - 1) / (INTENSITY.steps - 1)) * (GLOW.haloAlpha.max - GLOW.haloAlpha.rest),
          { duration: 0.12 });
      }
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    const st = g.current;
    if (phase !== "engaged" && phase !== "shaping") return;
    const dy = st.startY - e.clientY;
    const nearOrigin = Math.abs(e.clientX - st.startX) < ORB.size * 0.6 && dy < 12;

    if (st.shaping && !nearOrigin) commit();
    else if (!st.shaping && st.activeIdx !== null && !nearOrigin) commit(); // quick flick = step 1
    else cancel();
  }

  function commit() {
    const st = g.current;
    const emotion: Emotion = EMOTIONS[st.activeIdx ?? 0];
    const committedRgb = rgb.get();
    const step = st.step;

    setPhase("bursting");
    stopHum();
    commitSwell(emotion); // sound + overshoot + ring: same frame
    setHintFlag();
    setHintDead(true);

    // Overshoot on top of the committed size (snappy), then settle home.
    scaleAnim.current?.stop();
    const over = animate(
      stepScale,
      scaleForStep(step) * BURST.overshootScale,
      spring(SPRINGS.snappy),
    );
    scaleAnim.current = over;
    over.then(() => {
      scaleAnim.current = animate(stepScale, 1, spring(SPRINGS.settle));
    });
    rubberExtra.set(0);

    // Afterglow ember: 20% tint of the committed hue, fading over 1.2s.
    const committedHex = EMOTION_HUES[emotion];
    colorAnim.current?.stop();
    colorAnim.current = animate(BURST.afterglowTint, 0, {
      duration: BURST.afterglowS,
      ease: "easeOut",
      onUpdate: (t) => snapTo(mixHexRgbString(ORB.restHue, committedHex, t), ORB.restHue),
    });

    // Breath returns.
    pulsePeriod.set(ORB.breath.periodS);
    pulseAmp.set((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
    animate(haloAlpha, GLOW.haloAlpha.rest, { duration: 0.4 });
    animate(gestureDepth, 0, { duration: 0.25 });

    setBurst({ seed: (performance.now() * 997 + ++st.burstSeq) & 0xffffff, rgb: committedRgb });
    setActiveIdx(null);
    st.activeIdx = null;

    // Ready again fast — the "one more time" window.
    window.setTimeout(() => setPhase("idle"), BURST.rearmMs);
  }

  function cancel() {
    const st = g.current;
    stopHum();
    cancelTick(st.step); // one soft descending tick
    setPhase("idle");
    setActiveIdx(null);
    st.activeIdx = null;
    st.shaping = false;
    st.locked = false;
    rubberExtra.set(0);
    driveScale(1, spring(SPRINGS.settle)); // everything reverses, forgiving
    fadeTo(ORB.restHue, 250);
    pulsePeriod.set(ORB.breath.periodS);
    pulseAmp.set((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
    animate(haloAlpha, GLOW.haloAlpha.rest, { duration: 0.25 });
    animate(gestureDepth, 0, { duration: 0.25 });
  }

  // Interrupted gestures (tab hidden, system gesture) cancel cleanly.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && (g.current.shaping || g.current.activeIdx !== null)) cancel();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDots = phase === "engaged" || phase === "shaping";
  const label = activeIdx !== null ? EMOTIONS[activeIdx] : null;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={() => cancel()}
      style={{
        position: "relative",
        width: ORB.hitTarget,
        height: ORB.hitTarget,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {/* Emotion dots — fan out from the orb's heart along the arc. */}
      <AnimatePresence>
        {showDots &&
          DOT_POS.map((pos, i) => {
            const active = i === activeIdx;
            const dotOpacity =
              phase === "shaping"
                ? PULL.shapingDotOpacity
                : active
                  ? 1
                  : PULL.inactiveDotOpacity;
            return (
              <motion.div
                key={EMOTIONS[i]}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: PULL.dotSizePx,
                  height: PULL.dotSizePx,
                  marginLeft: -PULL.dotSizePx / 2,
                  marginTop: -PULL.dotSizePx / 2,
                  borderRadius: "50%",
                  background: EMOTION_HUES[EMOTIONS[i]],
                  boxShadow: `0 0 10px ${EMOTION_HUES[EMOTIONS[i]]}66`,
                  willChange: "transform, opacity",
                  pointerEvents: "none",
                }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: pos.x,
                  y: pos.y,
                  scale: active ? PULL.activeDotScale : 1,
                  opacity: dotOpacity,
                }}
                exit={{ x: 0, y: 0, scale: 0, opacity: 0, transition: spring(SPRINGS.settle) }}
                transition={{ ...spring(SPRINGS.snappy), delay: i * PULL.dotStaggerS }}
              />
            );
          })}
      </AnimatePresence>

      {/* Emotion label — one lowercase word, nothing else to read. */}
      <AnimatePresence>
        {label && (
          <motion.span
            key={label}
            initial={{ opacity: 0 }}
            animate={{ opacity: TEXT.label.opacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: TEXT.label.fadeInMs / 1000 }}
            style={{
              position: "absolute",
              bottom: "100%",
              marginBottom: TEXT.label.offsetPx - (ORB.hitTarget - ORB.size) / 2,
              left: "50%",
              x: "-50%",
              fontSize: TEXT.label.sizePx,
              letterSpacing: TEXT.label.letterSpacing,
              color: "#FFFFFF",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      <Orb rgb={rgb} scale={scale} haloAlpha={haloAlpha} />

      {/* The reward — never the same twice. */}
      {burst && (
        <CommitBurst
          key={burst.seed}
          seed={burst.seed}
          rgb={burst.rgb}
          onDone={() => setBurst(null)}
        />
      )}

      {/* Hint — dies for the session after the first commit. */}
      {!hintDead && phase === "idle" && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: TEXT.hint.opacity }}
          exit={{ opacity: 0 }}
          style={{
            position: "absolute",
            top: "100%",
            marginTop: TEXT.hint.offsetPx - (ORB.hitTarget - ORB.size) / 2,
            left: "50%",
            x: "-50%",
            fontSize: TEXT.hint.sizePx,
            color: "#FFFFFF",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {hintWord}
        </motion.span>
      )}
    </div>
  );
}

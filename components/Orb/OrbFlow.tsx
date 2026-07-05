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
  BAR,
  BURST,
  GLOW,
  INTENSITY,
  ORB,
  REDUCED_MOTION,
  SPRINGS,
  TEXT,
  WHEEL,
  clampStep,
  pulseAmpForStep,
  pulsePeriodForStep,
  scaleForStep,
} from "./feel";
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

/* ---------------- geometry (shared by wheel + bar) ---------------- */
const START_DEG = -90 - WHEEL.arcDegrees / 2; // -165° (left-low)
const SWEEP_DEG = WHEEL.arcDegrees; // 150°, over the top
const R = WHEEL.arcRadiusPx;

function polar(deg: number, r: number = R): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}
const DOT_POS = EMOTIONS.map((_, i) =>
  polar(START_DEG + (SWEEP_DEG / (EMOTIONS.length - 1)) * i),
);

/** Finger position → param u∈[0,1] along the arc, by ANGLE around the orb
 *  center (true radial tracking — a half-circle finger path maps 1:1).
 *  Outside the sweep, clamps to the nearer end. */
function paramFromPoint(dx: number, dy: number): number {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  let rel = deg - START_DEG;
  // Normalize into (-180, 180] around the arc's span.
  while (rel > 180) rel -= 360;
  while (rel <= -180) rel += 360;
  return Math.min(1, Math.max(0, rel / SWEEP_DEG));
}

/* SVG canvas for the arc bar. */
const S = 2 * (R + 48); // enough margin for tube + bloom + knob
const C = S / 2;
const a0 = polar(START_DEG);
const a1 = polar(START_DEG + SWEEP_DEG);
const ARC_D = `M ${C + a0.x} ${C + a0.y} A ${R} ${R} 0 0 1 ${C + a1.x} ${C + a1.y}`;

/** The glass tube: an annular arc with round end caps — frosted body + rim,
 *  built as one closed path so the light inside can be clipped to it. */
const TUBE_D = (() => {
  const hw = BAR.tube.halfWidthPx;
  const Ro = R + hw;
  const Ri = R - hw;
  const e1 = START_DEG + SWEEP_DEG;
  const o0 = polar(START_DEG, Ro);
  const o1 = polar(e1, Ro);
  const i0 = polar(START_DEG, Ri);
  const i1 = polar(e1, Ri);
  return [
    `M ${C + o0.x} ${C + o0.y}`,
    `A ${Ro} ${Ro} 0 0 1 ${C + o1.x} ${C + o1.y}`, // outer edge, clockwise
    `A ${hw} ${hw} 0 0 1 ${C + i1.x} ${C + i1.y}`, // rounded end cap
    `A ${Ri} ${Ri} 0 0 0 ${C + i0.x} ${C + i0.y}`, // inner edge, back
    `A ${hw} ${hw} 0 0 1 ${C + o0.x} ${C + o0.y}`, // rounded start cap
    "Z",
  ].join(" ");
})();

type Phase = "idle" | "wheel" | "bar" | "bursting";

/**
 * THE FLOW — press: hue dots fan into a half-circle wheel; your finger's
 * angle chooses (radial, 1:1). Hold a beat: the wheel swoops into a round
 * arc bar. Swipe along it: continuous intensity, glued to the finger, with
 * ten soft detents for texture. Release: commit burst. Come home to cancel.
 *
 * Continuous motion is 100% motion values — zero React re-renders per
 * pointermove. React state only on discrete transitions.
 */
export function OrbFlow({
  hintWord,
  hintColor = "#FFFFFF",
  gestureDepth,
  onCommit,
}: {
  hintWord: string;
  /** Hint ink — the screen passes graphite when the map is paper (day). */
  hintColor?: string;
  gestureDepth: MotionValue<number>;
  /**
   * Fires the instant a feeling is committed (start of the burst, not the
   * end) — the world outside the orb reacts in the same beat. intensity is
   * the continuous 1..10 the tube produced.
   */
  onCommit?: (moment: { emotion: Emotion; intensity: number }) => void;
}) {
  const reduced = useReducedMotion();
  const spring = (s: Transition): Transition =>
    reduced ? { duration: REDUCED_MOTION.fadeMs / 1000 } : s;

  /* ---------- discrete React state ---------- */
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [lockedEmotion, setLockedEmotion] = useState<Emotion | null>(null);
  const [burst, setBurst] = useState<{ seed: number; rgb: string; scale: number } | null>(
    null,
  );
  const [hintDead, setHintDead] = useState(false);
  const [getHintFlag, setHintFlag] = useSessionFlag("warmth-lab-committed");
  useEffect(() => setHintDead(getHintFlag()), [getHintFlag]);

  /* ---------- continuous motion values ---------- */
  const baseScale = useMotionValue(1); // orb size: pressed / continuous with v
  const bump = useMotionValue(1); // detent micro-pop
  const pulsePeriod = useMotionValue<number>(ORB.breath.periodS);
  const pulseAmp = useMotionValue<number>((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
  const pulse = usePulse(pulsePeriod, pulseAmp);
  const scale = useTransform(() => baseScale.get() * bump.get() * pulse.get());
  const haloAlpha = useMotionValue<number>(GLOW.haloAlpha.rest);
  const { rgb, fadeTo, snapTo } = useOklchColor(ORB.restHue);

  const fill = useMotionValue(0); // arc fill 0..1 (leading edge = the knob)
  const barDim = useMotionValue(1); // 1 normal, →BAR.cancelDim when cancel-armed
  const knobX = useMotionValue(0);
  const knobY = useMotionValue(0);
  const knobScale = useMotionValue(0);
  // Tube + light opacities — all dim together when cancel-armed.
  const tubeOpacity = useTransform(() => barDim.get());
  const bloomOpacity = useTransform(
    () =>
      BAR.fill.bloomAlpha *
      (BAR.fillGlow.min + (BAR.fillGlow.max - BAR.fillGlow.min) * fill.get()) *
      barDim.get(),
  );
  const midOpacity = useTransform(() => BAR.fill.midAlpha * barDim.get());
  const coreOpacity = useTransform(() => BAR.fill.coreAlpha * barDim.get());

  /* ---------- gesture refs ---------- */
  const g = useRef({
    pointerId: null as number | null,
    cx: 0, // orb center in client coords — cached at pointerdown
    cy: 0,
    activeIdx: null as number | null,
    holdReadyAt: Infinity,
    v: 1, // continuous intensity 1..steps
    lastDetent: 1,
    cancelArmed: false,
    barMoved: false,
    burstSeq: 0,
  });
  const scaleAnim = useRef<ReturnType<typeof animate> | null>(null);
  const colorAnim = useRef<ReturnType<typeof animate> | null>(null);
  const fillAnim = useRef<ReturnType<typeof animate> | null>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  function driveScale(target: number, s: Transition) {
    scaleAnim.current?.stop();
    scaleAnim.current = animate(baseScale, target, s);
  }

  /* ---------- wheel phase ---------- */
  function onPointerDown(e: React.PointerEvent) {
    if (phaseRef.current === "bursting") return;
    const st = g.current;
    if (st.pointerId !== null) return; // one finger owns the gesture
    st.pointerId = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    unlockAudio();
    colorAnim.current?.stop(); // fast re-press: afterglow must not fight the new hue

    const rect = e.currentTarget.getBoundingClientRect(); // once — no reads in move
    st.cx = rect.left + rect.width / 2;
    st.cy = rect.top + rect.height / 2;
    st.activeIdx = null;
    st.holdReadyAt = Infinity;
    st.v = 1;
    st.lastDetent = 1;
    st.cancelArmed = false;
    st.barMoved = false;

    setPhase("wheel");
    animate(gestureDepth, 1, { duration: 0.15 });
    driveScale(WHEEL.pressScale, spring(SPRINGS.snappy));
    startHum();
    updateWheel(e.clientX, e.clientY, true);
  }

  function updateWheel(x: number, y: number, initial = false) {
    const st = g.current;
    const dx = x - st.cx;
    const dy = y - st.cy;

    // Home zone: no dot active, hold suspended — release here = free cancel.
    if (Math.hypot(dx, dy) < WHEEL.homeRadiusPx) {
      if (st.activeIdx !== null) {
        st.activeIdx = null;
        st.holdReadyAt = Infinity;
        setActiveIdx(null);
      }
      return;
    }

    const u = paramFromPoint(dx, dy);
    const idx = Math.round(u * (EMOTIONS.length - 1));
    if (idx !== st.activeIdx) {
      st.activeIdx = idx;
      st.holdReadyAt = performance.now() + WHEEL.holdToBarS * 1000;
      setActiveIdx(idx);
      fadeTo(EMOTION_HUES[EMOTIONS[idx]]);
      if (!initial) tick(idx + 1, { soft: true });
    }
  }

  /* ---------- wheel → bar morph ---------- */
  function morphToBar(u0: number) {
    const st = g.current;
    const emotion = EMOTIONS[st.activeIdx ?? 0];
    setLockedEmotion(emotion);
    setPhase("bar");

    st.v = 1 + u0 * (INTENSITY.steps - 1);
    st.lastDetent = clampStep(Math.round(st.v));

    // The fill floods in from the arc's start up to the finger.
    fill.set(0);
    fillAnim.current = animate(fill, u0, { duration: BAR.morphMs / 1000, ease: "easeOut" });
    barDim.set(1);
    placeKnob(u0);
    animate(knobScale, 1, spring(SPRINGS.snappy));

    // Orb steps up to meet the current value, then rides the finger 1:1.
    driveScale(scaleForStep(st.v), spring(INTENSITY.spring));
    pulsePeriod.set(pulsePeriodForStep(st.v));
    pulseAmp.set(pulseAmpForStep(st.v));
    setHumLevel((st.v - 1) / (INTENSITY.steps - 1));
    animate(haloAlpha, alphaForV(st.v), { duration: 0.15 });
    tick(st.lastDetent); // arrival detent — the morph lands on a click
  }

  function alphaForV(v: number) {
    const t = (clampStep(v) - 1) / (INTENSITY.steps - 1);
    return GLOW.haloAlpha.rest + t * (GLOW.haloAlpha.max - GLOW.haloAlpha.rest);
  }

  function placeKnob(u: number) {
    const p = polar(START_DEG + u * SWEEP_DEG);
    knobX.set(p.x);
    knobY.set(p.y);
  }

  /* ---------- bar phase (continuous; detents are texture) ---------- */
  function updateBar(x: number, y: number) {
    const st = g.current;
    const dx = x - st.cx;
    const dy = y - st.cy;

    // Cancel zone: come home, everything softens, release = free.
    const armed = Math.hypot(dx, dy) < BAR.cancelRadiusPx;
    if (armed !== st.cancelArmed) {
      st.cancelArmed = armed;
      animate(barDim, armed ? BAR.cancelDim : 1, { duration: 0.15 });
      animate(knobScale, armed ? 0.7 : 1, spring(SPRINGS.snappy));
    }
    if (armed) return; // fill holds its last value while armed

    const u = paramFromPoint(dx, dy);
    if (!st.barMoved) {
      st.barMoved = true;
      fillAnim.current?.stop(); // finger takes over from the morph flood
      scaleAnim.current?.stop(); // orb glues to the finger from here
    }

    // GLUED: fill, knob, orb size, pulse all track the finger this frame.
    fill.set(u);
    placeKnob(u);
    st.v = 1 + u * (INTENSITY.steps - 1);
    baseScale.set(scaleForStep(st.v));
    pulsePeriod.set(pulsePeriodForStep(st.v));
    pulseAmp.set(pulseAmpForStep(st.v));
    haloAlpha.set(alphaForV(st.v));

    // Detents — soft mechanical texture through the sweep.
    const detent = clampStep(Math.round(st.v));
    if (detent !== st.lastDetent) {
      st.lastDetent = detent;
      tick(detent);
      setHumLevel((st.v - 1) / (INTENSITY.steps - 1));
      // Micro-pop, felt not seen: +2.5% for ~90ms.
      animate(bump, [1, 1.025, 1], { duration: 0.09, ease: "easeOut" });
      animate(knobScale, [1, BAR.knobActiveScale, 1], { duration: 0.12, ease: "easeOut" });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = g.current;
    if (e.pointerId !== st.pointerId) return;
    if (phaseRef.current === "wheel") {
      updateWheel(e.clientX, e.clientY);
      // Hold check rides the move stream (fingers are never perfectly still).
      if (st.activeIdx !== null && performance.now() >= st.holdReadyAt) {
        morphToBar(paramFromPoint(e.clientX - st.cx, e.clientY - st.cy));
      }
    } else if (phaseRef.current === "bar") {
      updateBar(e.clientX, e.clientY);
    }
  }

  // Fingers CAN be perfectly still on a desk-mounted phone — poll the hold.
  useEffect(() => {
    if (phase !== "wheel") return;
    const id = window.setInterval(() => {
      const st = g.current;
      if (st.activeIdx !== null && performance.now() >= st.holdReadyAt) {
        // Morph at the held dot's exact position.
        morphToBar(st.activeIdx / (EMOTIONS.length - 1));
      }
    }, 40);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function onPointerEnd(e: React.PointerEvent) {
    const st = g.current;
    if (e.pointerId !== st.pointerId) return;
    if (phaseRef.current === "wheel") {
      // Release on a dot before the morph = fast minimal commit (v = 1).
      if (st.activeIdx !== null) {
        st.v = 1;
        setLockedEmotion(EMOTIONS[st.activeIdx]);
        commit(EMOTIONS[st.activeIdx]);
      } else {
        cancel();
      }
    } else if (phaseRef.current === "bar") {
      if (st.cancelArmed) cancel();
      else commit(lockedEmotionRefSafe());
    }
  }

  function lockedEmotionRefSafe(): Emotion {
    return lockedEmotion ?? EMOTIONS[g.current.activeIdx ?? 0];
  }

  /* ---------- commit / cancel ---------- */
  function commit(emotion: Emotion) {
    const st = g.current;
    st.pointerId = null;
    const committedRgb = rgb.get();
    const v = st.v;

    // The world hears about it NOW — the bloom and any network write ride
    // under the burst instead of waiting for it.
    onCommit?.({ emotion, intensity: v });

    setPhase("bursting");
    stopHum();
    commitSwell(emotion);
    setHintFlag();
    setHintDead(true);

    // Overshoot on the committed size (snappy), then settle home.
    scaleAnim.current?.stop();
    const over = animate(baseScale, scaleForStep(v) * BURST.overshootScale, spring(SPRINGS.snappy));
    scaleAnim.current = over;
    over.then(() => {
      scaleAnim.current = animate(baseScale, 1, spring(SPRINGS.settle));
    });

    // Afterglow ember: 20% tint of the committed hue fading out.
    const hex = EMOTION_HUES[emotion];
    colorAnim.current?.stop();
    colorAnim.current = animate(BURST.afterglowTint, 0, {
      duration: BURST.afterglowS,
      ease: "easeOut",
      onUpdate: (t) => snapTo(mixHexRgbString(ORB.restHue, hex, t), ORB.restHue),
    });

    pulsePeriod.set(ORB.breath.periodS);
    pulseAmp.set((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
    animate(haloAlpha, GLOW.haloAlpha.rest, { duration: 0.4 });
    animate(gestureDepth, 0, { duration: 0.25 });
    animate(knobScale, 0, spring(SPRINGS.settle));

    setBurst({
      seed: (performance.now() * 997 + ++st.burstSeq) & 0xffffff,
      rgb: committedRgb,
      scale: scaleForStep(v),
    });
    setActiveIdx(null);
    st.activeIdx = null;

    window.setTimeout(() => {
      setPhase("idle");
      setLockedEmotion(null);
    }, BURST.rearmMs);
  }

  function cancel() {
    const st = g.current;
    st.pointerId = null;
    stopHum();
    cancelTick(st.lastDetent);
    setPhase("idle");
    setActiveIdx(null);
    setLockedEmotion(null);
    st.activeIdx = null;
    driveScale(1, spring(SPRINGS.settle));
    fadeTo(ORB.restHue, 250);
    pulsePeriod.set(ORB.breath.periodS);
    pulseAmp.set((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
    animate(haloAlpha, GLOW.haloAlpha.rest, { duration: 0.25 });
    animate(gestureDepth, 0, { duration: 0.25 });
    animate(knobScale, 0, spring(SPRINGS.settle));
  }

  useEffect(() => {
    const onHide = () => {
      if (document.hidden && g.current.pointerId !== null) cancel();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDots = phase === "wheel";
  const showBar = phase === "bar";
  const label =
    phase === "bar"
      ? lockedEmotion
      : activeIdx !== null
        ? EMOTIONS[activeIdx]
        : null;
  const fillHex = lockedEmotion ? EMOTION_HUES[lockedEmotion] : ORB.restHue;
  // Hot filament color: the hue pulled 35% toward white (OKLCH, stays vivid).
  const coreRgb = mixHexRgbString(fillHex, "#FFFFFF", 0.35);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={(e) => {
        if (e.pointerId === g.current.pointerId) cancel();
      }}
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
      {/* THE ARC BAR — the wheel, become a slider. */}
      <AnimatePresence>
        {showBar && (
          <motion.svg
            key="bar"
            width={S}
            height={S}
            viewBox={`0 0 ${S} ${S}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: BAR.morphMs / 1000 / 2 }}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              x: "-50%",
              y: "-50%",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <defs>
              {/* The light inside the glass is clipped to the tube's shape. */}
              <clipPath id="orb-tube-clip">
                <path d={TUBE_D} />
              </clipPath>
            </defs>

            {/* THE GLASS TUBE — frosted translucent body + thin rim. */}
            <motion.path
              d={TUBE_D}
              fill={`rgba(255,255,255,${BAR.tube.bodyAlpha})`}
              stroke={`rgba(255,255,255,${BAR.tube.rimAlpha})`}
              strokeWidth={1}
              style={{ opacity: tubeOpacity }}
            />

            {/* Soft bloom — the light's fluff, allowed to spill past the glass.
                (NO SVG filters: a drop-shadow re-rasterizes per frame.) */}
            <motion.path
              d={ARC_D}
              fill="none"
              stroke={fillHex}
              strokeWidth={BAR.fill.bloomWidthPx}
              strokeLinecap="round"
              style={{ pathLength: fill, opacity: bloomOpacity }}
            />
            {/* Body of light, living inside the tube. */}
            <motion.path
              d={ARC_D}
              fill="none"
              stroke={fillHex}
              strokeWidth={BAR.fill.midWidthPx}
              strokeLinecap="round"
              clipPath="url(#orb-tube-clip)"
              style={{ pathLength: fill, opacity: midOpacity }}
            />
            {/* Hot core line — the filament. */}
            <motion.path
              d={ARC_D}
              fill="none"
              stroke={`rgb(${coreRgb})`}
              strokeWidth={BAR.fill.coreWidthPx}
              strokeLinecap="round"
              clipPath="url(#orb-tube-clip)"
              style={{ pathLength: fill, opacity: coreOpacity }}
            />
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Knob — rides the fill's leading edge under your finger. */}
      {showBar && (
        <motion.div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: BAR.knobPx,
            height: BAR.knobPx,
            marginLeft: -BAR.knobPx / 2,
            marginTop: -BAR.knobPx / 2,
            borderRadius: "50%",
            background: "#FFFFFF",
            boxShadow: `0 0 14px 2px ${fillHex}`,
            x: knobX,
            y: knobY,
            scale: knobScale,
            opacity: barDim,
            willChange: "transform, opacity",
            pointerEvents: "none",
          }}
        />
      )}

      {/* THE WHEEL — six hue dots, radial choice. */}
      <AnimatePresence>
        {showDots &&
          DOT_POS.map((pos, i) => {
            const active = i === activeIdx;
            return (
              <motion.div
                key={EMOTIONS[i]}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: WHEEL.dotSizePx,
                  height: WHEEL.dotSizePx,
                  marginLeft: -WHEEL.dotSizePx / 2,
                  marginTop: -WHEEL.dotSizePx / 2,
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
                  scale: active ? WHEEL.activeDotScale : 1,
                  opacity: active ? 1 : WHEEL.inactiveDotOpacity,
                }}
                exit={{
                  scale: 0,
                  opacity: 0,
                  transition: { duration: BAR.morphMs / 1000 / 2, ease: "easeOut" },
                }}
                transition={{
                  // Stagger flavors the fan-out only; select answers same-frame.
                  x: { ...spring(SPRINGS.snappy), delay: i * WHEEL.dotStaggerS },
                  y: { ...spring(SPRINGS.snappy), delay: i * WHEEL.dotStaggerS },
                  scale: spring(SPRINGS.snappy),
                  opacity: spring(SPRINGS.snappy),
                }}
              />
            );
          })}
      </AnimatePresence>

      {/* One lowercase word — the only reading on screen. */}
      <AnimatePresence>
        {label && (
          <motion.span
            key={label}
            initial={{ opacity: 0 }}
            animate={{ opacity: TEXT.label.opacity }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
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
          sizeScale={burst.scale}
          onDone={() => setBurst(null)}
        />
      )}

      {/* Hint — dies for the session after the first commit. */}
      {!hintDead && phase === "idle" && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: TEXT.hint.opacity }}
          style={{
            position: "absolute",
            top: "100%",
            marginTop: TEXT.hint.offsetPx - (ORB.hitTarget - ORB.size) / 2,
            left: "50%",
            x: "-50%",
            fontSize: TEXT.hint.sizePx,
            color: hintColor,
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

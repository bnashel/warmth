/**
 * THE GHOST HAND — drives a real OrbFlow through the real gesture with
 * synthetic PointerEvents: press → glide to a feeling → hold → sweep the
 * intensity arc → release. Nothing is mocked; the wheel, the bar, the burst
 * are OrbFlow's own (its pointer capture is written to tolerate synthetic
 * pointers). The demo OrbFlow carries no onCommit, so ghost commits are
 * light only — nothing enters the store.
 *
 * Geometry mirrors OrbFlow's constants: dots on a 150° arc starting at
 * -165°, radius 110. If those ever move, move these.
 */
import { EMOTIONS, type Emotion } from "@/lib/theme";
import { WHEEL } from "@/components/Orb/feel";
import type { GhostPhase } from "@/components/Welcome/script";

const START_DEG = -165;
const SWEEP_DEG = 150;
const R = 110;
/** One id, far above any real finger — OrbFlow's one-finger rule keys on it. */
const GHOST_POINTER_ID = 0x7fff;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type GhostGesture = {
  /** Stop mid-gesture: dispatches pointercancel so OrbFlow plays its own
   *  soft settle (hum stops, scale relaxes). Safe to call twice. */
  cancel(): void;
  /** Resolves true if the gesture ran to the burst, false if cancelled. */
  done: Promise<boolean>;
};

export function runGhostGesture(
  el: HTMLElement,
  opts: {
    emotion: Emotion;
    intensity: number; // 1..10 — where the sweep lands
    onPhase?: (p: GhostPhase) => void;
    /** The visible fingertip follows every synthetic touch (el-relative px). */
    onPointer?: (x: number, y: number, down: boolean) => void;
  },
): GhostGesture {
  let cancelled = false;
  let inFlight = false;

  const rect = () => el.getBoundingClientRect();
  const center = () => {
    const r = rect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const fire = (type: string, x: number, y: number) => {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: GHOST_POINTER_ID,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
        width: 20,
        height: 20,
        pressure: 0.6,
      }),
    );
    const { cx, cy } = center();
    opts.onPointer?.(x - cx, y - cy, type !== "pointerup" && type !== "pointercancel");
  };

  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  /** Eased pointermove from a to b over ms, ~24 fps of events. */
  async function glide(
    a: { x: number; y: number },
    b: { x: number; y: number },
    ms: number,
  ) {
    const steps = Math.max(3, Math.round(ms / 40));
    for (let i = 1; i <= steps && !cancelled; i++) {
      const t = easeInOut(i / steps);
      fire("pointermove", a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      await sleep(ms / steps);
    }
  }

  /** Eased sweep along the arc between two angles (degrees), radius R. */
  async function sweep(fromDeg: number, toDeg: number, ms: number) {
    const { cx, cy } = center();
    const steps = Math.max(3, Math.round(ms / 40));
    for (let i = 1; i <= steps && !cancelled; i++) {
      const t = easeInOut(i / steps);
      const deg = (fromDeg + (toDeg - fromDeg) * t) * (Math.PI / 180);
      fire("pointermove", cx + R * Math.cos(deg), cy + R * Math.sin(deg));
      await sleep(ms / steps);
    }
  }

  const done = (async () => {
    const idx = Math.max(0, EMOTIONS.indexOf(opts.emotion));
    const dotDeg = START_DEG + (SWEEP_DEG * idx) / (EMOTIONS.length - 1);
    const dotRad = dotDeg * (Math.PI / 180);
    const { cx, cy } = center();
    const dot = { x: cx + R * Math.cos(dotRad), y: cy + R * Math.sin(dotRad) };

    // press — the wheel fans open
    opts.onPhase?.("press");
    inFlight = true;
    fire("pointerdown", cx, cy);
    await sleep(420);
    if (cancelled) return false;

    // glide out to the feeling
    opts.onPhase?.("wheel");
    await glide({ x: cx, y: cy }, dot, 560);
    if (cancelled) return false;

    // hold — a thumb is never perfectly still; micro-jitter keeps it honest
    for (let i = 0; i < 12 && !cancelled; i++) {
      fire("pointermove", dot.x + (i % 2), dot.y);
      await sleep((WHEEL.holdToBarS * 1000 + 260) / 12);
    }
    if (cancelled) return false;

    // the bar: sweep to the target strength, a touch past, then settle back
    opts.onPhase?.("bar");
    const targetDeg = START_DEG + SWEEP_DEG * ((opts.intensity - 1) / 9);
    const overshootDeg = Math.min(START_DEG + SWEEP_DEG, targetDeg + 7);
    await sweep(dotDeg, overshootDeg, 820);
    if (cancelled) return false;
    await sweep(overshootDeg, targetDeg, 240);
    if (cancelled) return false;
    await sleep(340);
    if (cancelled) return false;

    // release — the burst
    opts.onPhase?.("burst");
    const endRad = targetDeg * (Math.PI / 180);
    fire("pointerup", cx + R * Math.cos(endRad), cy + R * Math.sin(endRad));
    inFlight = false;
    return true;
  })();

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (inFlight) {
        const { cx, cy } = center();
        fire("pointercancel", cx, cy);
        inFlight = false;
      }
    },
    done,
  };
}

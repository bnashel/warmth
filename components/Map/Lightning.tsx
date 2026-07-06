"use client";

/**
 * components/Map/Lightning.tsx — the storm answers back.
 *
 * When the atmosphere carries a real thunderstorm (WMO 95/96/99, or the dev
 * panel's storm preset), the sky flickers and distant thunder follows the
 * light — seconds-to-a-minute apart, positioned randomly along the horizon,
 * never a strobe. The flash is ONE composited opacity layer (zero cost at
 * rest); thunder rides the muted-aware master bus in lib/sound.ts.
 *
 * Photosensitivity: alphas are whispers (≤0.16) and prefers-reduced-motion
 * skips the flashes entirely — the thunder still tells the story.
 */
import { useEffect, useRef } from "react";
import { atmosphere } from "@/lib/atmosphere";
import { thunderRumble } from "@/lib/sound";
import { WEATHER } from "./tune";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function Lightning() {
  const flashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = flashRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let strikeTimer: number | null = null;
    let flickerTimers: number[] = [];
    let disposed = false;
    let wasActive = false;

    const clearFlicker = () => {
      for (const t of flickerTimers) window.clearTimeout(t);
      flickerTimers = [];
    };

    /** 2–3 quick pulses, then the afterglow dies — real lightning stutters. */
    const strike = () => {
      const a = atmosphere.current;
      const alpha =
        WEATHER.lightning.flashAlphaNight +
        (WEATHER.lightning.flashAlphaDay - WEATHER.lightning.flashAlphaNight) * a.paper;
      // The bolt lives somewhere along the top of the city, never centered.
      const x = rand(15, 85);
      el.style.background = `radial-gradient(120% 90% at ${x.toFixed(0)}% -10%, rgba(224,232,255,${alpha.toFixed(3)}) 0%, rgba(224,232,255,${(alpha * 0.5).toFixed(3)}) 45%, rgba(224,232,255,0) 75%)`;
      if (!reduced) {
        const pulse = (at: number, o: number, fadeMs: number) => {
          flickerTimers.push(
            window.setTimeout(() => {
              el.style.transition = o > 0 ? "none" : `opacity ${fadeMs}ms ease-out`;
              el.style.opacity = String(o);
            }, at),
          );
        };
        pulse(0, 1, 0);
        pulse(70, 0.25, 0);
        pulse(130, 0.8, 0);
        pulse(200, 0, 320); // the afterglow lets go
      }
      thunderRumble(rand(WEATHER.lightning.thunderDelayS[0], WEATHER.lightning.thunderDelayS[1]));
    };

    const scheduleNext = (first: boolean) => {
      const storm = Math.min(1, Math.max(0.001, atmosphere.current.storm));
      const [lo, hi] = first ? WEATHER.lightning.firstS : WEATHER.lightning.intervalS;
      // A weaker storm strikes less often; a dead one not at all (watch()).
      const delayS = rand(lo, hi) / storm;
      strikeTimer = window.setTimeout(() => {
        strikeTimer = null;
        if (disposed) return;
        if (atmosphere.current.storm > 0.35 && document.visibilityState === "visible") {
          strike();
        }
        scheduleNext(false);
      }, delayS * 1000);
    };

    // Watch the eased storm weight; arm on arrival, disarm as it passes.
    const watch = window.setInterval(() => {
      const active = atmosphere.current.storm > 0.35;
      if (active && !wasActive) scheduleNext(true);
      if (!active && wasActive && strikeTimer !== null) {
        window.clearTimeout(strikeTimer);
        strikeTimer = null;
      }
      wasActive = active;
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(watch);
      if (strikeTimer !== null) window.clearTimeout(strikeTimer);
      clearFlicker();
    };
  }, []);

  return (
    <div
      ref={flashRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 6, // above the map + vignette, under every control
        opacity: 0,
      }}
    />
  );
}

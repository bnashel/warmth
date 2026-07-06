"use client";

/**
 * ⚠️ DEV-ONLY. The weather preview — Ben's window-testing dial.
 *
 * You can't magically make it rain, so this panel forces the atmosphere:
 * pick an hour of the sun and a sky, watch the map ease there like the real
 * thing. It drives the SAME override hooks the URL params use
 * (lib/atmosphere.ts setOverride + window.__warmthSolarHour) — zero product
 * code paths of its own, and the whole component renders null in production
 * (same gate as /lab and /maplab), so it never ships.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { atmosphere, type AtmosphereOverride } from "@/lib/atmosphere";

const DEV = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_LABS === "1";

/** Sun presets (NYC summer): hour of day for window.__warmthSolarHour. */
const TIMES: { key: string; label: string; hour: number | null }[] = [
  { key: "now", label: "now", hour: null },
  { key: "dawn", label: "dawn", hour: 5.7 },
  { key: "noon", label: "noon", hour: 13 },
  { key: "dusk", label: "dusk", hour: 19.6 },
  { key: "night", label: "night", hour: 23.5 },
];

/** Sky presets → atmosphere overrides (null = the real weather). */
const SKIES: { key: string; label: string; o: AtmosphereOverride | null }[] = [
  { key: "now", label: "now", o: null },
  { key: "clear", label: "clear", o: { cloud: 0, wet: 0, fog: 0, wind: 0.15 } },
  { key: "clouds", label: "clouds", o: { cloud: 0.9, wet: 0, fog: 0, wind: 0.3 } },
  { key: "fog", label: "fog", o: { cloud: 0.55, wet: 0, fog: 0.8, wind: 0.1 } },
  { key: "rain", label: "rain", o: { cloud: 0.8, wet: 0.65, wetKind: "rain", fog: 0.1, wind: 0.45 } },
  { key: "storm", label: "storm", o: { cloud: 0.97, wet: 0.95, wetKind: "rain", fog: 0.15, wind: 0.85 } },
  { key: "snow", label: "snow", o: { cloud: 0.75, wet: 0.7, wetKind: "snow", fog: 0.2, wind: 0.25 } },
];

function Row<T extends { key: string; label: string }>({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: T[];
  active: string;
  onPick: (o: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "rgba(233,236,244,0.38)",
        }}
      >
        {label}
      </span>
      <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={active === o.key}
            onClick={() => onPick(o)}
            style={{
              position: "relative",
              padding: "6px 11px",
              borderRadius: 999,
              border: "none",
              background: active === o.key ? "rgba(233,236,244,0.13)" : "transparent",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.05em",
              color: active === o.key ? "rgba(233,236,244,0.95)" : "rgba(233,236,244,0.45)",
              transition: "color 250ms ease, background 250ms ease",
              touchAction: "manipulation",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Plain-English read of the live targets — trust that it's really live. */
function describeRealSky(): string {
  const s = atmosphere.realSky();
  if (!s.live) return "live sky: fetching…";
  const parts: string[] = [];
  if (s.wet > 0.02) parts.push(s.wetKind === "snow" ? "snowing" : "raining");
  else if (s.fog > 0.3) parts.push("foggy");
  else if (s.cloud > 0.85) parts.push("overcast");
  else if (s.cloud > 0.4) parts.push("partly cloudy");
  else parts.push("clear");
  if (s.rawWindKmh >= 8) parts.push(`wind ${s.rawWindKmh} km/h`);
  return `live sky: ${parts.join(", ")}`;
}

export function WeatherPreview() {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("now");
  const [sky, setSky] = useState("now");

  if (!DEV) return null;

  return (
    <>
      {/* The chip — top-left, mirroring the north chip's language. */}
      <button
        type="button"
        aria-label="Weather preview (dev only)"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 20px)",
          left: 16,
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px dashed rgba(233,236,244,0.25)", // dashed: this is scaffolding
          background: "rgba(10,11,15,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          color: open ? "rgba(233,236,244,0.9)" : "rgba(233,236,244,0.55)",
          cursor: "pointer",
          zIndex: 12,
          display: "grid",
          placeItems: "center",
          transition: "color 300ms ease",
          touchAction: "manipulation",
        }}
      >
        {/* A little cloud-and-sun mark. */}
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
          <circle cx="10.2" cy="4.8" r="2.3" stroke="currentColor" strokeWidth="1.1" />
          <path
            d="M3.2 11.6h6.1a2.2 2.2 0 0 0 .4-4.37 3.1 3.1 0 0 0-6.03.9A1.9 1.9 0 0 0 3.2 11.6Z"
            stroke="currentColor"
            strokeWidth="1.1"
            fill="rgba(10,11,15,0.8)"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "absolute", inset: 0, zIndex: 11 }}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={SPRING.snappy}
              style={{
                position: "absolute",
                top: "calc(max(env(safe-area-inset-top), 20px) + 44px)",
                left: 16,
                zIndex: 12,
                width: 264,
                padding: "15px 15px 12px",
                borderRadius: 18,
                background: "rgba(10,11,15,0.72)",
                border: "1px dashed rgba(233,236,244,0.22)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                display: "flex",
                flexDirection: "column",
                gap: 13,
                transformOrigin: "top left",
              }}
            >
              <Row
                label="sun"
                options={TIMES}
                active={time}
                onPick={(t) => {
                  setTime(t.key);
                  (window as unknown as { __warmthSolarHour?: number }).__warmthSolarHour =
                    t.hour ?? undefined;
                }}
              />
              <Row
                label="sky"
                options={SKIES}
                active={sky}
                onPick={(s) => {
                  setSky(s.key);
                  atmosphere.setOverride(s.o);
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: 10.5,
                  letterSpacing: "0.04em",
                  color: "rgba(233,236,244,0.5)",
                }}
              >
                {describeRealSky()}
              </p>
              <p
                style={{
                  margin: "-9px 0 0",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "rgba(233,236,244,0.3)",
                }}
              >
                dev preview — never ships in the product
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

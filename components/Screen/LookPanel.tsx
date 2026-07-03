"use client";

/**
 * The Look panel — the user's two dials for how the city renders:
 *   shape — bloom / watercolor / ink / aurora (how feeling is drawn)
 *   light — subtle / bold / sky (how hard the map follows the real sun)
 * A whisper-quiet chip in the top-left (mirroring the north chip) opens a
 * dark glass card. Choices apply instantly and persist on-device.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { getPrefs, setPref, type LookPrefs, type ShapeMode, type SolarMode } from "@/lib/prefs";

const SHAPE_OPTIONS: { key: ShapeMode; label: string }[] = [
  { key: "bloom", label: "bloom" },
  { key: "watercolor", label: "watercolor" },
  { key: "ink", label: "ink" },
  { key: "aurora", label: "aurora" },
];

const SOLAR_OPTIONS: { key: SolarMode; label: string }[] = [
  { key: "subtle", label: "subtle" },
  // Key stays "bold" (saved prefs survive); the mode is now a true
  // Apple-Maps-style light day ↔ ink night.
  { key: "bold", label: "daylight" },
  { key: "sky", label: "sky" },
];

function Row<T extends string>({
  label,
  options,
  value,
  pillId,
  onPick,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  pillId: string;
  onPick: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
      <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onPick(o.key)}
            style={{
              position: "relative",
              padding: "7px 13px",
              borderRadius: 999,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: "0.06em",
              color: value === o.key ? "rgba(233,236,244,0.95)" : "rgba(233,236,244,0.42)",
              transition: "color 300ms ease",
              touchAction: "manipulation",
            }}
          >
            {/* Invisible reach: slim pill, 44px thumb (same trick as the tabs). */}
            <span aria-hidden style={{ position: "absolute", inset: "-7px -2px" }} />
            {value === o.key && (
              <motion.span
                layoutId={pillId}
                transition={SPRING.snappy}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 999,
                  background: "rgba(233,236,244,0.11)",
                  border: "1px solid rgba(233,236,244,0.1)",
                }}
              />
            )}
            <span style={{ position: "relative" }}>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LookPanel() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<LookPrefs>(() => getPrefs());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = <K extends keyof LookPrefs>(key: K, value: LookPrefs[K]) => {
    setPref(key, value);
    setPrefs(getPrefs());
  };

  return (
    <>
      {/* The chip — mirrors the north chip, top-left. */}
      <button
        type="button"
        aria-label="Look options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 20px)",
          left: 16,
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          color: open ? "rgba(233,236,244,0.9)" : "rgba(233,236,244,0.6)",
          cursor: "pointer",
          zIndex: 12,
          display: "grid",
          placeItems: "center",
          transition: "color 300ms ease",
          touchAction: "manipulation",
        }}
      >
        {/* Three tuning sliders, drawn to match the whisper line-weight. */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M1 3.5h12M1 7h12M1 10.5h12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="9.5" cy="3.5" r="1.7" fill="#0A0B0F" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="4.5" cy="7" r="1.7" fill="#0A0B0F" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="8" cy="10.5" r="1.7" fill="#0A0B0F" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Tap-out veil — invisible, closes the card. */}
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
                width: 248,
                padding: "16px 16px 18px",
                borderRadius: 18,
                background: "rgba(10,11,15,0.72)",
                border: "1px solid rgba(233,236,244,0.14)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                display: "flex",
                flexDirection: "column",
                gap: 15,
                transformOrigin: "top left",
              }}
            >
              <Row
                label="shape"
                options={SHAPE_OPTIONS}
                value={prefs.shape}
                pillId="look-shape-pill"
                onPick={(v) => pick("shape", v)}
              />
              <Row
                label="light"
                options={SOLAR_OPTIONS}
                value={prefs.solar}
                pillId="look-light-pill"
                onPick={(v) => pick("solar", v)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

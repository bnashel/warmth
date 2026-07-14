"use client";

/**
 * components/Lab/LookGallery.tsx — THE VERSION GALLERY panel (dev-only).
 *
 * Every design iteration of the public field, preserved and selectable
 * live against real data (Eli, 2026-07-09: nothing gets thrown away).
 * Click a look to switch the live rendering; star one to make it the
 * default this device opens with. Adding a future iteration = one entry
 * in components/Map/looks.ts — this panel just lists the registry.
 *
 * Shown in dev builds, or anywhere with ?looks=1. Never in the product.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { devUnlocked } from "@/lib/dev";
import { LOOKS } from "@/components/Map/looks";
import { currentLook, favoriteId, onLookChange, setFavorite, setLook } from "@/components/Map/lookState";

export function galleryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // One gate for all judging tools (audit fix, 07-14): devUnlocked() is
  // dev builds AND judging previews (NEXT_PUBLIC_WARMTH_JUDGE=1) — the
  // phone bake-off gets the gallery without hand-adding ?looks=1.
  if (devUnlocked()) return true;
  return new URLSearchParams(window.location.search).get("looks") === "1";
}

export function LookGallery() {
  const [activeId, setActiveId] = useState(currentLook().id);
  // Lazy init is safe: this panel only mounts post-hydration (galleryOn).
  const [favId, setFavId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : favoriteId(),
  );
  const [open, setOpen] = useState(false);
  useEffect(() => onLookChange(() => setActiveId(currentLook().id)), []);

  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: "max(env(safe-area-inset-bottom, 0px), 18px)",
        zIndex: 11,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.99 }}
          transition={SPRING.settle}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: 8,
            borderRadius: 14,
            background: "rgba(10,11,15,0.82)",
            border: "1px solid rgba(233,236,244,0.12)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            maxHeight: "50vh",
            overflowY: "auto",
            width: 236,
          }}
        >
          {[...LOOKS].reverse().map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setLook(l.id)}
                title={l.note}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "7px 9px",
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  background: l.id === activeId ? "rgba(233,236,244,0.12)" : "transparent",
                  color: l.id === activeId ? "rgba(233,236,244,0.95)" : "rgba(233,236,244,0.6)",
                  fontSize: 12,
                }}
              >
                {l.name}
                <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 10.5 }}>{l.date}</span>
              </button>
              <button
                type="button"
                aria-label={`Make ${l.name} the default`}
                onClick={() => {
                  setFavorite(l.id);
                  setFavId(l.id);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  color: l.id === favId ? "rgba(250,222,140,0.9)" : "rgba(233,236,244,0.25)",
                }}
              >
                ★
              </button>
            </div>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "7px 13px",
          borderRadius: 999,
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.66)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "rgba(233,236,244,0.7)",
          fontSize: 11.5,
          cursor: "pointer",
        }}
      >
        looks · {LOOKS.find((l) => l.id === activeId)?.name ?? activeId}
      </button>
    </div>
  );
}

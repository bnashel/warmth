"use client";

/**
 * The memory card — tap a spark, hold the moment.
 *
 * A quiet glass card for one journal entry: when and what you felt, plus
 * the memory you attach — one journaling prompt ("what do you want to
 * remember about this?") and, once cloud sync lands, a photo. That is the
 * complete set (Eli, 2026-07-08 — the song fields are gone; its "by…"
 * artist input read as a mystery "buy" button). Saves are optimistic:
 * every edit lands in the store (and localStorage) on blur or after a
 * short pause, with a whispered "kept" as confirmation. The cloud write
 * rides the same call once Supabase is linked.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { momentsStore, type Memory } from "@/lib/momentsStore";
import { EMOTION_HUES, SPRING, type Emotion } from "@/lib/theme";

const MAX_DESCRIPTION = 2000;

function whenLabel(createdAt: number): string {
  const d = new Date(createdAt);
  const date = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(233,236,244,0.06)",
  border: "1px solid rgba(233,236,244,0.1)",
  borderRadius: 10,
  padding: "9px 11px",
  color: "rgba(233,236,244,0.92)",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
  resize: "none",
};

export function MemoryCard({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const entry = momentsStore.journalEntry(entryId);
  const [memory, setMemory] = useState<Memory>(() => ({ ...entry?.memory }));
  const [kept, setKept] = useState<"kept" | "full" | null>(null);
  const keptTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  // Optimistic save: debounce keystrokes, flush on blur/close/unmount.
  // Dirty-gated: a card that was only OPENED never writes or claims "kept"
  // (StrictMode's double-mount ran the unmount flush and flashed a phantom
  // confirmation — design review).
  const dirty = useRef(false);
  const save = (next: Memory) => {
    dirty.current = true;
    setMemory(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => flush(next), 600);
  };
  const flush = (next: Memory) => {
    window.clearTimeout(saveTimer.current);
    if (!dirty.current) return;
    // Honest confirmation: "kept" only when storage really took the words.
    const ok = momentsStore.setMemory(entryId, next);
    if (ok) dirty.current = false;
    setKept(ok ? "kept" : "full");
    window.clearTimeout(keptTimer.current);
    if (ok) keptTimer.current = window.setTimeout(() => setKept(null), 1600);
  };
  const memoryRef = useRef(memory);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      flush(memoryRef.current); // never lose words to a close
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!entry) return null;
  const hue = EMOTION_HUES[entry.emotion as Emotion];

  return (
    <>
      {/* Tap-out veil. */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 14 }} />
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={SPRING.settle}
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(env(safe-area-inset-bottom, 0px), 18px)",
          // Framer owns the transform (it animates y/scale) — a static
          // translateX would be discarded mid-animation (design review).
          x: "-50%",
          width: "min(400px, calc(100vw - 28px))",
          zIndex: 15,
          padding: "18px 18px 16px",
          borderRadius: 20,
          background: "rgba(10,11,15,0.78)",
          border: "1px solid rgba(233,236,244,0.14)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* The moment: emotion star + when. */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: hue,
              boxShadow: `0 0 10px 1px ${hue}99`,
            }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(233,236,244,0.92)" }}>
            {entry.emotion}
          </span>
          <span style={{ fontSize: 11.5, color: "rgba(233,236,244,0.4)", marginLeft: "auto" }}>
            {whenLabel(entry.createdAt)}
          </span>
        </div>

        <textarea
          aria-label="What do you want to remember?"
          placeholder="what do you want to remember about this?"
          value={memory.description ?? ""}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => save({ ...memory, description: e.target.value })}
          onBlur={() => flush(memoryRef.current)}
          style={inputStyle}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Photo: arrives with cloud sync — honest whisper, not a dead button. */}
          <span style={{ fontSize: 11.5, color: "rgba(233,236,244,0.35)" }}>
            photos arrive with cloud sync
          </span>
          <AnimatePresence>
            {kept && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: kept === "kept" ? 0.6 : 0.85 }}
                exit={{ opacity: 0 }}
                style={{
                  fontSize: 11.5,
                  color: kept === "kept" ? "rgba(233,236,244,0.9)" : "rgba(244,188,140,0.95)",
                  marginLeft: "auto",
                }}
              >
                {kept === "kept" ? "kept" : "couldn't keep — device storage is full"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

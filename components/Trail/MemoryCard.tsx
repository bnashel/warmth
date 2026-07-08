"use client";

/**
 * The memory card — tap a spark, hold the moment.
 *
 * A quiet glass card for one journal entry: when and what you felt, plus
 * the memory you attach — one journaling prompt ("how did you feel?") and
 * a photo. That is the complete set (Eli, 2026-07-08). The photo is
 * local-first like the words: picked, downscaled on-device, stored with
 * the entry; it uploads to Storage when the cloud lands. Saves are
 * optimistic: every edit lands in the store (and localStorage) on blur or
 * after a short pause, with a whispered "kept" as confirmation.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { momentsStore, type Memory } from "@/lib/momentsStore";
import { EMOTION_HUES, SPRING, type Emotion } from "@/lib/theme";
import { uploadMemoryPhoto, signedPhotoUrl } from "@/lib/photos";
import { isSignedIn } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const MAX_DESCRIPTION = 2000;

/** Longest edge of the stored photo (px). Local-first storage rides
 *  localStorage for now, so the photo is shrunk hard on-device: a 640px
 *  JPEG (~60–120 KB) keeps years of entries inside the quota; the honest
 *  "couldn't keep" path already covers the day it fills anyway. */
const PHOTO_MAX_PX = 640;

async function shrinkPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null; // unreadable file — the card simply stays photo-less
  }
}

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

  // Photo: LOCAL-FIRST (instant, offline — a downscaled data URL kept with
  // the entry) AND synced to Storage when signed in (so it appears on your
  // other devices). The device that took it shows its own copy; another
  // device fetches the Storage original via a signed URL.
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const canSyncPhoto = isSupabaseConfigured && isSignedIn();

  // No local copy but a synced path (another device) → fetch a viewable URL.
  useEffect(() => {
    let live = true;
    const mem = entry?.memory;
    if (mem?.photoPath && !mem.photo && isSupabaseConfigured) {
      void signedPhotoUrl(mem.photoPath).then((u) => {
        if (live) setRemoteUrl(u);
      });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    // Instant + offline: shrink on-device and keep it with the entry.
    const dataUrl = await shrinkPhoto(file);
    if (!dataUrl) return;
    save({ ...memoryRef.current, photo: dataUrl });
    // Cross-device: upload the original to Storage when signed in. A failed
    // upload is harmless — the local copy is already kept.
    if (canSyncPhoto) {
      setPhotoBusy(true);
      const { path } = await uploadMemoryPhoto(entryId, file);
      setPhotoBusy(false);
      if (path) flush({ ...memoryRef.current, photo: dataUrl, photoPath: path });
    }
  };

  const removePhoto = () => {
    setRemoteUrl(null);
    save({ ...memoryRef.current, photo: undefined, photoPath: undefined });
  };
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
          aria-label="How did you feel?"
          placeholder="how did you feel?"
          value={memory.description ?? ""}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => save({ ...memory, description: e.target.value })}
          onBlur={() => flush(memoryRef.current)}
          style={inputStyle}
        />

        {/* The photo — a memory you can see again. Local-first; a small
            "syncing…" whisper while it also uploads to your account. */}
        {memory.photo || remoteUrl ? (
          <div style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={memory.photo ?? remoteUrl ?? ""}
              alt="Photo attached to this memory"
              style={{
                width: "100%",
                maxHeight: 180,
                objectFit: "cover",
                borderRadius: 12,
                display: "block",
              }}
            />
            <button
              type="button"
              onClick={removePhoto}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                border: "1px solid rgba(233,236,244,0.18)",
                borderRadius: 999,
                background: "rgba(10,11,15,0.66)",
                color: "rgba(233,236,244,0.75)",
                fontSize: 11,
                padding: "3px 9px",
                cursor: "pointer",
              }}
            >
              remove
            </button>
            {photoBusy && (
              <span
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  fontSize: 10.5,
                  color: "rgba(233,236,244,0.7)",
                  background: "rgba(10,11,15,0.6)",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                syncing…
              </span>
            )}
          </div>
        ) : (
          <label
            style={{
              ...inputStyle,
              cursor: "pointer",
              textAlign: "center",
              color: "rgba(233,236,244,0.55)",
              userSelect: "none",
            }}
          >
            add a photo
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                void onPickPhoto(file);
                e.target.value = ""; // same file re-pickable after remove
              }}
            />
          </label>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

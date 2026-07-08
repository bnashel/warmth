"use client";

/**
 * The memory card — tap a spark, hold the moment.
 *
 * A quiet glass card for one journal entry: when and what you felt, plus
 * the memory you attach to it — words, a song, (soon) a photo. Saves are
 * optimistic: every edit lands in the store (and localStorage) on blur or
 * after a short pause, with a whispered "kept" as confirmation. The cloud
 * write rides the same call once Supabase is linked.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { momentsStore, type Memory } from "@/lib/momentsStore";
import { EMOTION_HUES, SPRING, type Emotion } from "@/lib/theme";
import { uploadMemoryPhoto, signedPhotoUrl } from "@/lib/photos";
import { isSignedIn } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

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

  // Photo: optimistic local preview while it uploads, then the signed URL.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canPhoto = isSupabaseConfigured; // the bucket is real only with a project

  // Load an existing photo's viewable URL when the card opens.
  useEffect(() => {
    let live = true;
    const path = entry?.memory?.photoPath;
    if (path && canPhoto) {
      void signedPhotoUrl(path).then((u) => {
        if (live) setPhotoUrl(u);
      });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!isSignedIn() || !canPhoto) {
      setPhotoError(true);
      return;
    }
    setPhotoError(false);
    setPhotoBusy(true);
    const preview = URL.createObjectURL(file); // instant optimistic thumbnail
    setPhotoUrl(preview);
    const { path, error } = await uploadMemoryPhoto(entryId, file);
    setPhotoBusy(false);
    if (error || !path) {
      setPhotoError(true);
      URL.revokeObjectURL(preview);
      setPhotoUrl(entry?.memory?.photoPath ? photoUrl : null);
      return;
    }
    // Persist the path through the same optimistic save (→ pushMemoryToCloud).
    flush({ ...memoryRef.current, photoPath: path });
    const signed = await signedPhotoUrl(path);
    URL.revokeObjectURL(preview);
    if (signed) setPhotoUrl(signed);
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
          aria-label="What do you want to remember?"
          placeholder="what do you want to remember about this?"
          value={memory.description ?? ""}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => save({ ...memory, description: e.target.value })}
          onBlur={() => flush(memoryRef.current)}
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="Song title"
            placeholder="a song…"
            value={memory.songTitle ?? ""}
            maxLength={200}
            onChange={(e) => save({ ...memory, songTitle: e.target.value })}
            onBlur={() => flush(memoryRef.current)}
            style={{ ...inputStyle, flex: 1.4 }}
          />
          <input
            aria-label="Artist"
            placeholder="by…"
            value={memory.songArtist ?? ""}
            maxLength={200}
            onChange={(e) => save({ ...memory, songArtist: e.target.value })}
            onBlur={() => flush(memoryRef.current)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>

        {/* Photo thumbnail, once one is attached. */}
        <AnimatePresence>
          {photoUrl && (
            <motion.img
              key="photo"
              src={photoUrl}
              alt="A photo you kept with this moment"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: photoBusy ? 0.6 : 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING.settle}
              style={{
                width: "100%",
                maxHeight: 200,
                objectFit: "cover",
                borderRadius: 12,
                border: "1px solid rgba(233,236,244,0.12)",
              }}
            />
          )}
        </AnimatePresence>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Photo picker (native input, no deps). Honest about needing sign-in. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPickPhoto(e.target.files?.[0])}
          />
          {canPhoto ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              style={{
                background: "rgba(233,236,244,0.06)",
                border: "1px solid rgba(233,236,244,0.14)",
                borderRadius: 10,
                padding: "7px 12px",
                color: "rgba(233,236,244,0.8)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {photoBusy ? "adding…" : photoUrl ? "change photo" : "add a photo"}
            </button>
          ) : (
            <span style={{ fontSize: 11.5, color: "rgba(233,236,244,0.35)" }}>
              photos arrive with cloud sync
            </span>
          )}
          {photoError && (
            <span style={{ fontSize: 11.5, color: "rgba(244,188,140,0.95)" }}>
              couldn&apos;t add that photo
            </span>
          )}
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

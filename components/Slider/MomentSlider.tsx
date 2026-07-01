"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { EMOTION_HUES, EMOTIONS, type Emotion, SPRING } from "@/lib/theme";

export type MomentEntry = {
  id: string;
  emotion: Emotion;
  intensity: number;
  moodMix: Record<Emotion, number>;
  description: string;
  photoUrl: string;
  song: string;
  createdAt: string;
  location?: { latitude: number; longitude: number } | null;
};

interface MomentSliderProps {
  onAddMoment: (moment: MomentEntry) => void;
}

const INITIAL_MIX = {
  joy: 0,
  energy: 0,
  love: 0,
  awe: 0,
  calm: 0,
  reflective: 0,
} satisfies Record<Emotion, number>;

function clampValue(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function MomentSlider({ onAddMoment }: MomentSliderProps) {
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion>("joy");
  const [intensity, setIntensity] = useState(72);
  const [moodMix, setMoodMix] = useState<Record<Emotion, number>>(INITIAL_MIX);
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [song, setSong] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [status, setStatus] = useState("Finding your current location...");

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setStatus("Location access is unavailable in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setStatus("Location pinned for this moment.");
      },
      () => {
        setStatus("Location access skipped. You can still save the moment.");
      },
    );
  }, []);

  const dominantEmotion = useMemo(() => {
    const scored = { ...moodMix, [selectedEmotion]: Math.max(moodMix[selectedEmotion], intensity / 20) };

    return (EMOTIONS as Emotion[]).reduce((current, emotion) => {
      return scored[emotion] >= scored[current] ? emotion : current;
    }, selectedEmotion);
  }, [intensity, moodMix, selectedEmotion]);

  const handleSave = () => {
    const createdAt = new Date().toISOString();

    onAddMoment({
      id: `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
      emotion: dominantEmotion,
      intensity: clampValue(intensity),
      moodMix,
      description,
      photoUrl,
      song,
      createdAt,
      location,
    });

    setDescription("");
    setPhotoUrl("");
    setSong("");
    setIntensity(72);
    setMoodMix(INITIAL_MIX);
    setSelectedEmotion("joy");
    setStatus("Moment saved. Add another if you want.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.snappy}
      className="rounded-[32px] border border-white/10 bg-black/50 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-sm uppercase tracking-[0.35em] text-white/40">
            Tag a moment
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Capture a feeling, the place, and the time.
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            This flow is built to feel like a warm, personal memory capture: color, intensity, location, time, photo, song, and a short note.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Live preview</p>
          <p className="mt-2 font-medium text-white">{dominantEmotion}</p>
          <p className="mt-1 text-white/60">Intensity {intensity}%</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">Primary emotion</p>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">tap to select</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EMOTIONS.map((emotion) => {
                const isActive = selectedEmotion === emotion;
                return (
                  <button
                    key={emotion}
                    type="button"
                    onClick={() => setSelectedEmotion(emotion)}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <span className="mb-1 block text-[11px] uppercase tracking-[0.3em] text-white/40">
                      {emotion}
                    </span>
                    <span className="text-white">{emotion}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">Intensity</p>
              <p className="text-sm text-white/60">{intensity}%</p>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={intensity}
              onChange={(event) => setIntensity(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
              style={{
                background: `linear-gradient(to right, ${EMOTION_HUES[selectedEmotion]} 0%, ${EMOTION_HUES[selectedEmotion]} ${intensity}%, rgba(255,255,255,0.12) ${intensity}%, rgba(255,255,255,0.12) 100%)`,
              }}
            />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">How it felt</p>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">multi-color mix</p>
            </div>
            <div className="space-y-3">
              {EMOTIONS.map((emotion) => (
                <div key={emotion} className="space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/40">
                    <span>{emotion}</span>
                    <span>{moodMix[emotion]}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={moodMix[emotion]}
                    onChange={(event) =>
                      setMoodMix((current) => ({
                        ...current,
                        [emotion]: Number(event.target.value),
                      }))
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
                    style={{
                      background: `linear-gradient(to right, ${EMOTION_HUES[emotion]} 0%, ${EMOTION_HUES[emotion]} ${moodMix[emotion]}%, rgba(255,255,255,0.12) ${moodMix[emotion]}%, rgba(255,255,255,0.12) 100%)`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[24px] border border-white/10 bg-black/30 p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="description">
              Describe the moment
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What happened? What made it feel that way?"
              className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="photo">
              Photo URL (optional)
            </label>
            <input
              id="photo"
              value={photoUrl}
              onChange={(event) => setPhotoUrl(event.target.value)}
              placeholder="https://..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="song">
              Song or soundtrack (optional)
            </label>
            <input
              id="song"
              value={song}
              onChange={(event) => setSong(event.target.value)}
              placeholder="A song that fit the moment"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Captured info</p>
            <p className="mt-2">Location: {location ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}` : "pending"}</p>
            <p className="mt-1">Time: {new Date().toLocaleString()}</p>
            <p className="mt-1">Status: {status}</p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Save this moment
          </button>
        </div>
      </div>
    </motion.div>
  );
}

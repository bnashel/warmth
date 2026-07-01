"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MapView } from "@/components/Map/MapView";
import { MomentSlider, type MomentEntry } from "@/components/Slider/MomentSlider";
import { EMOTION_HUES, GLOW_PULSE } from "@/lib/theme";

export default function Home() {
  const [moments, setMoments] = useState<MomentEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedMoments = window.localStorage.getItem("warmth-moments");
    if (storedMoments) {
      try {
        setMoments(JSON.parse(storedMoments));
      } catch {
        window.localStorage.removeItem("warmth-moments");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("warmth-moments", JSON.stringify(moments));
    }
  }, [moments]);

  const handleAddMoment = (moment: MomentEntry) => {
    setMoments((current) => [moment, ...current].slice(0, 8));
  };

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute h-[70vmin] w-[70vmin] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${EMOTION_HUES.love} 0%, ${EMOTION_HUES.awe} 45%, transparent 70%)`,
        }}
        initial={{ opacity: 0.2, scale: 0.9 }}
        animate={{ opacity: 0.35, scale: 1.05 }}
        transition={GLOW_PULSE}
      />

      <div className="relative z-10 flex w-full max-w-6xl flex-col gap-4 rounded-[36px] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-4 lg:p-5">
        <section className="flex min-h-[320px] flex-1 items-center justify-center rounded-[32px] bg-black/30 p-4 sm:p-6 lg:min-h-0 lg:p-8">
          <div className="max-w-xl text-center lg:text-left">
            <p className="text-sm uppercase tracking-[0.35em] text-white/40">
              Warmth
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              A beautiful live map of how a city feels.
            </h1>
            <p className="mt-4 text-base leading-7 text-white/70">
              Tag a memory, pin the place, and let the map grow with the feeling of the moment.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="h-[360px] min-h-[320px] overflow-hidden rounded-[32px] border border-white/10 bg-black/50 lg:h-[520px]">
            <MapView moments={moments} />
          </div>

          <div className="space-y-4">
            <MomentSlider onAddMoment={handleAddMoment} />

            <div className="rounded-[32px] border border-white/10 bg-black/50 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Recent moments</p>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">local memory stream</p>
              </div>

              <div className="mt-4 space-y-3">
                {moments.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/70">
                    Your saved moments will appear here once you start tagging them.
                  </p>
                ) : (
                  moments.map((moment) => (
                    <div key={moment.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{moment.emotion}</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                          {moment.intensity}%
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-white/70">
                        {moment.description || "A moment captured with warmth."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40">
                        {moment.song ? <span>song • {moment.song}</span> : null}
                        {moment.photoUrl ? <span>photo • attached</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

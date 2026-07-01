"use client";

import { motion } from "framer-motion";
import { EMOTION_HUES, GLOW_PULSE } from "@/lib/theme";

/**
 * Phase 0 placeholder: a dark screen with a single breathing glow.
 * The beautiful live map replaces this next. Intentionally minimal — but never
 * generic: dark base, one warm glow, spring/looped motion only.
 */
export default function Home() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden">
      {/* Breathing glow — a preview of the feeling the map will render. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute h-[70vmin] w-[70vmin] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${EMOTION_HUES.love} 0%, ${EMOTION_HUES.awe} 45%, transparent 70%)`,
        }}
        initial={{ opacity: 0.25, scale: 0.9 }}
        animate={{ opacity: 0.5, scale: 1.05 }}
        transition={GLOW_PULSE}
      />

      <div className="relative z-10 flex flex-col items-center gap-3 text-center">
        <motion.h1
          className="text-5xl font-semibold tracking-tight sm:text-6xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Warmth
        </motion.h1>
        <motion.p
          className="max-w-xs text-sm text-foreground/50 sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
        >
          A live map of how a city feels.
        </motion.p>
      </div>
    </main>
  );
}

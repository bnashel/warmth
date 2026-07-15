/**
 * THE CHROME — everything both walkthrough shells say out loud: the caption
 * plate, the axes tag, the progress dots, skip, and the tap-to-continue
 * whisper. The shells stage the scenery; the chrome speaks over it.
 *
 * Layering: the shell root owns zIndex; inside it the chrome is the topmost
 * layer. During the handoff the chrome goes pointer-transparent (the real
 * orb below must receive the gesture) — only skip stays live.
 */
"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Inter } from "next/font/google";
import { SPRING } from "@/lib/theme";
import type { WelcomeStep, WelcomeVersion } from "@/components/Welcome/script";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

const WHISPER = (a: number) => `rgba(233,236,244,${a})`;

type Props = {
  step: WelcomeStep;
  stepIndex: number;
  total: number;
  handoff: boolean;
  /** Exit-fading: the surface must already be deaf (nothing blocked). */
  finished: boolean;
  version: WelcomeVersion;
  onAdvance(): void;
  onSkip(): void;
  /** Live caption replacement (the ghost demo narrates its own phases). */
  linesOverride?: string[];
  /** The slides scene draws its own wordmark — hide the chrome's. */
  hideTitle?: boolean;
  /** The ghost's burst light must own its beat — the footer steps back. */
  footDim?: boolean;
};

export function WelcomeChrome({
  step,
  stepIndex,
  total,
  handoff,
  finished,
  version,
  onAdvance,
  onSkip,
  linesOverride,
  hideTitle,
  footDim,
}: Props) {
  const reduced = useReducedMotion();
  const enter = reduced ? { duration: 0.15 } : SPRING.settle;
  const lines = linesOverride ?? step.lines;
  const note = step.note?.[version];
  // The orb steps perform bottom-center — their words move up out of the way.
  const captionHigh = step.id === "orb" || step.id === "yours";
  // Deaf: on the handoff (the real orb below must hear the gesture) and the
  // moment the welcome finishes (a dying overlay must never swallow taps).
  const deaf = handoff || finished;

  return (
    <div
      className={inter.className}
      onClick={deaf ? undefined : onAdvance}
      onKeyDown={
        deaf
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") onAdvance();
              if (e.key === "Escape") onSkip();
            }
      }
      tabIndex={deaf ? -1 : 0}
      role="dialog"
      aria-label="welcome to warmth"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: deaf ? "none" : "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: deaf ? "default" : "pointer",
        outline: "none",
      }}
    >
      {/* skip — one whisper, alive until the welcome ends, never advances */}
      <button
        type="button"
        disabled={finished}
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top, 0px), 18px)",
          right: 18,
          padding: 0,
          border: "none",
          background: "transparent",
          color: WHISPER(0.45),
          fontSize: 12,
          letterSpacing: "0.08em",
          cursor: "pointer",
          pointerEvents: "auto",
          touchAction: "manipulation",
        }}
      >
        {/* invisible reach — the word stays quiet, the thumb gets 44px */}
        <span aria-hidden style={{ position: "absolute", inset: -16 }} />
        skip
      </button>

      {/* the caption plate — one step speaks at a time, nothing pops */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -6, transition: { duration: 0.28 } }}
          transition={enter}
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            ...(captionHigh
              ? { top: "calc(max(env(safe-area-inset-top, 0px), 18px) + 96px)" }
              : { bottom: "26%" }),
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: "center",
              borderRadius: 18,
              padding: "16px 22px",
              background: "rgba(6,7,10,0.5)",
              border: `1px solid ${WHISPER(0.1)}`,
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            {step.title && !hideTitle && (
              <h1
                style={{
                  fontSize: 34,
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  color: WHISPER(0.95),
                  margin: "0 0 6px",
                }}
              >
                {step.title}
              </h1>
            )}
            {step.tag && (
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  color: WHISPER(0.5),
                }}
              >
                {step.tag}
              </p>
            )}
            {/* live caption swaps (the ghost narrating its phases) crossfade
                — the most-watched words in the welcome must never pop */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={lines.join("¶")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.16 } }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {lines.map((line) => (
                  <p
                    key={line}
                    style={{
                      margin: 0,
                      fontSize: 15.5,
                      lineHeight: 1.55,
                      letterSpacing: "0.02em",
                      color: WHISPER(0.85),
                    }}
                  >
                    {line}
                  </p>
                ))}
              </motion.div>
            </AnimatePresence>
            {note && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  color: WHISPER(0.5),
                }}
              >
                {note}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* tap to continue + progress — both breathe away at the handoff */}
      <AnimatePresence>
        {!handoff && (
          <motion.div
            key="chrome-foot"
            initial={{ opacity: 0 }}
            animate={{ opacity: footDim ? 0.25 : 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={enter}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              pointerEvents: "none",
            }}
          >
            <motion.p
              animate={reduced ? { opacity: 0.3 } : { opacity: [0.2, 0.42] }}
              transition={
                reduced
                  ? undefined
                  : { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }
              }
              style={{
                margin: 0,
                fontSize: 11,
                letterSpacing: "0.1em",
                color: WHISPER(1),
              }}
            >
              tap to continue
            </motion.p>
            <div style={{ display: "flex", gap: 9 }} aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <motion.span
                  key={i}
                  animate={{
                    opacity: i === stepIndex ? 0.85 : 0.22,
                    scale: i === stepIndex ? 1.15 : 1,
                  }}
                  transition={SPRING.snappy}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: WHISPER(1),
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

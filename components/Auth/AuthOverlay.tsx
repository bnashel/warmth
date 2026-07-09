"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inter } from "next/font/google";
import { EMOTION_HUES, SPRING } from "@/lib/theme";
import { signInWithEmail } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/** The five hues, left→right, as a soft signature ribbon under the title. */
const HUE_RIBBON = `linear-gradient(90deg, ${EMOTION_HUES.joy}, ${EMOTION_HUES.energy}, ${EMOTION_HUES.love}, ${EMOTION_HUES.gratitude}, ${EMOTION_HUES.calm})`;

/**
 * The wall, simplified to the ONE path that works today (Eli, 2026-07-09):
 * email → tap the link. Bigger type, one field, one button. Google and
 * phone return when Ben lands OAuth/Twilio credentials (handoff doc);
 * Apple is dropped (Eli's call). A type-a-code step returns with custom
 * SMTP (free-tier emails are link-only). The living city breathes behind
 * the glass; every state change is a spring — nothing pops (rule 4).
 */
export function AuthOverlay() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"ask" | "sending" | "sent">("ask");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const addr = email.trim();
    if (!addr.includes("@")) {
      setError("that doesn't look like an email");
      return;
    }
    setError(null);
    setStage("sending");
    const res = await signInWithEmail(addr);
    if (!res.error) setStage("sent");
    else {
      setStage("ask");
      setError(res.error);
    }
  }

  return (
    <motion.div
      className={inter.className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(6,7,10,0.42)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <motion.div
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING.settle}
        style={{
          width: "min(440px, 100%)",
          borderRadius: 24,
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.78)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "44px 36px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: "rgba(233,236,244,0.95)",
            margin: 0,
          }}
        >
          warmth
        </h1>
        <div
          aria-hidden
          style={{
            height: 3,
            width: 132,
            margin: "14px auto 18px",
            borderRadius: 2,
            background: HUE_RIBBON,
            opacity: 0.8,
          }}
        />
        <p
          style={{
            fontSize: 16.5,
            lineHeight: 1.45,
            color: "rgba(233,236,244,0.66)",
            margin: "0 0 30px",
          }}
        >
          sign in to feel the city
          <br />
          and keep your own trail
        </p>

        <AnimatePresence mode="wait">
          {stage !== "sent" ? (
            <motion.div key="ask" exit={{ opacity: 0, y: -8 }} transition={SPRING.settle}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && stage === "ask" && void send()}
                style={{
                  width: "100%",
                  padding: "17px 18px",
                  borderRadius: 16,
                  border: "1px solid rgba(233,236,244,0.18)",
                  background: "rgba(233,236,244,0.06)",
                  color: "rgba(233,236,244,0.95)",
                  fontSize: 18,
                  textAlign: "center",
                  outline: "none",
                }}
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => void send()}
                disabled={stage === "sending"}
                style={{
                  width: "100%",
                  marginTop: 14,
                  padding: "17px 18px",
                  borderRadius: 16,
                  border: "none",
                  background: "rgba(233,236,244,0.92)",
                  color: "#0A0B0F",
                  fontSize: 18,
                  fontWeight: 500,
                  cursor: "pointer",
                  opacity: stage === "sending" ? 0.6 : 1,
                }}
              >
                {stage === "sending" ? "sending…" : "send me a sign-in link"}
              </motion.button>
              {error && (
                <p style={{ fontSize: 14.5, color: EMOTION_HUES.energy, margin: "14px 0 0" }}>
                  {error}
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING.settle}
            >
              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.5,
                  color: "rgba(233,236,244,0.92)",
                  margin: 0,
                }}
              >
                check your email
              </p>
              <p
                style={{
                  fontSize: 15.5,
                  lineHeight: 1.55,
                  color: "rgba(233,236,244,0.6)",
                  margin: "12px 0 0",
                }}
              >
                tap the link in it on this device
                <br />
                and you&apos;ll land right back here, signed in
              </p>
              <button
                type="button"
                onClick={() => setStage("ask")}
                style={{
                  marginTop: 26,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(233,236,244,0.16)",
                  background: "transparent",
                  color: "rgba(233,236,244,0.55)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                use a different email
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

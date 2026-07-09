"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inter } from "next/font/google";
import { EMOTION_HUES, SPRING } from "@/lib/theme";
import {
  signInWithEmail,
  signInWithPhone,
  verifyEmail,
  verifyPhone,
  signInWithProvider,
} from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/** The five hues, left→right, as a soft signature ribbon under the title. */
const HUE_RIBBON = `linear-gradient(90deg, ${EMOTION_HUES.joy}, ${EMOTION_HUES.energy}, ${EMOTION_HUES.love}, ${EMOTION_HUES.gratitude}, ${EMOTION_HUES.calm})`;

type Stage =
  | { kind: "choose" }
  | { kind: "email-code"; email: string }
  | { kind: "phone" }
  | { kind: "phone-code"; phone: string };

const glassButton: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: 14,
  border: "1px solid rgba(233,236,244,0.16)",
  background: "rgba(233,236,244,0.05)",
  color: "rgba(233,236,244,0.92)",
  fontSize: 14.5,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "center",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid rgba(233,236,244,0.16)",
  background: "rgba(10,11,15,0.5)",
  color: "rgba(233,236,244,0.95)",
  fontSize: 14.5,
  outline: "none",
};

/**
 * THE AUTH WALL — a gorgeous full-screen gate over the living field.
 * The city breathes behind glass; a single quiet card invites you in.
 * Google / Apple, or an email link (with a paste-a-code fallback so a link
 * opened on another device still works), or a phone code. Every state change
 * is a spring/fade — nothing pops (visual rule 4).
 */
export function AuthOverlay() {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ error?: string }>, onOk: () => void) => {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error);
    else onOk();
  };

  const accent = EMOTION_HUES.joy;

  return (
    <motion.div
      className={inter.className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.4 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        // Dim + blur the breathing city behind, so it reads as depth, not noise.
        background: "rgba(6,7,10,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        // Full-cover: nothing behind the wall is reachable pre-auth.
        pointerEvents: "auto",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING.settle}
        style={{
          width: "min(360px, calc(100vw - 40px))",
          padding: "28px 24px 24px",
          borderRadius: 24,
          background: "rgba(10,11,15,0.82)",
          border: "1px solid rgba(233,236,244,0.14)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 24px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        {/* Wordmark + the signature hue ribbon. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "0.01em",
              color: "rgba(233,236,244,0.96)",
            }}
          >
            Warmth
          </span>
          <span
            aria-hidden
            style={{ height: 3, width: 64, borderRadius: 3, background: HUE_RIBBON, opacity: 0.9 }}
          />
          <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "rgba(233,236,244,0.5)" }}>
            sign in to feel the city and keep your own trail
          </span>
        </div>

        <AnimatePresence mode="wait">
          {stage.kind === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING.snappy}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <button
                style={glassButton}
                disabled={busy}
                onClick={() => run(() => signInWithProvider("google"), () => {})}
              >
                continue with Google
              </button>
              <button
                style={glassButton}
                disabled={busy}
                onClick={() => run(() => signInWithProvider("apple"), () => {})}
              >
                continue with Apple
              </button>

              <Divider />

              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={fieldStyle}
              />
              <button
                style={{ ...glassButton, background: accent, color: "#141007", border: "none" }}
                disabled={busy || !email.includes("@")}
                onClick={() =>
                  run(
                    () => signInWithEmail(email.trim()),
                    () => setStage({ kind: "email-code", email: email.trim() }),
                  )
                }
              >
                {busy ? "sending…" : "send me a link"}
              </button>
              <button style={textLink} onClick={() => setStage({ kind: "phone" })}>
                use a phone number instead
              </button>
            </motion.div>
          )}

          {stage.kind === "email-code" && (
            <CodeStage
              key="email-code"
              lead={`we emailed a link and a code to ${stage.email}`}
              hint="tap the link on this device, or paste the 6-digit code:"
              code={code}
              setCode={setCode}
              busy={busy}
              onVerify={() =>
                run(() => verifyEmail(stage.email, code.trim()), () => {})
              }
              onBack={() => {
                setCode("");
                setError(null);
                setStage({ kind: "choose" });
              }}
            />
          )}

          {stage.kind === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING.snappy}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={fieldStyle}
              />
              <button
                style={{ ...glassButton, background: accent, color: "#141007", border: "none" }}
                disabled={busy || phone.replace(/\D/g, "").length < 7}
                onClick={() =>
                  run(
                    () => signInWithPhone(phone.trim()),
                    () => setStage({ kind: "phone-code", phone: phone.trim() }),
                  )
                }
              >
                {busy ? "sending…" : "text me a code"}
              </button>
              <button style={textLink} onClick={() => setStage({ kind: "choose" })}>
                back
              </button>
            </motion.div>
          )}

          {stage.kind === "phone-code" && (
            <CodeStage
              key="phone-code"
              lead={`we texted a 6-digit code to ${stage.phone}`}
              hint="enter it here:"
              code={code}
              setCode={setCode}
              busy={busy}
              onVerify={() => run(() => verifyPhone(stage.phone, code.trim()), () => {})}
              onBack={() => {
                setCode("");
                setError(null);
                setStage({ kind: "phone" });
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING.snappy}
              style={{ fontSize: 12.5, color: EMOTION_HUES.love, lineHeight: 1.4 }}
            >
              {error}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
      <span style={{ flex: 1, height: 1, background: "rgba(233,236,244,0.1)" }} />
      <span style={{ fontSize: 11.5, color: "rgba(233,236,244,0.35)" }}>or</span>
      <span style={{ flex: 1, height: 1, background: "rgba(233,236,244,0.1)" }} />
    </div>
  );
}

const textLink: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(233,236,244,0.5)",
  fontSize: 12.5,
  cursor: "pointer",
  padding: "4px 0",
  textAlign: "center",
};

function CodeStage({
  lead,
  hint,
  code,
  setCode,
  busy,
  onVerify,
  onBack,
}: {
  lead: string;
  hint: string;
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  onVerify: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={SPRING.snappy}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <span style={{ fontSize: 13, color: "rgba(233,236,244,0.72)", lineHeight: 1.5 }}>{lead}</span>
      <span style={{ fontSize: 12, color: "rgba(233,236,244,0.45)" }}>{hint}</span>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        style={{ ...fieldStyle, letterSpacing: "0.4em", textAlign: "center", fontSize: 18 }}
      />
      <button
        style={{ ...glassButton, background: EMOTION_HUES.joy, color: "#141007", border: "none" }}
        disabled={busy || code.length < 6}
        onClick={onVerify}
      >
        {busy ? "signing you in…" : "enter"}
      </button>
      <button style={textLink} onClick={onBack}>
        back
      </button>
    </motion.div>
  );
}

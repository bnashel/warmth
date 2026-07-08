"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import OneScreen from "@/components/Screen/OneScreen";
import { AuthOverlay } from "@/components/Auth/AuthOverlay";
import { initAuth, useSession } from "@/lib/auth";

/**
 * THE GATE. OneScreen is always mounted so the living field breathes behind
 * the wall — but until a session exists, the AuthOverlay covers it and
 * swallows every interaction (the orb is unreachable pre-auth). Once signed
 * in, the overlay springs away and the city is yours.
 *
 * Dev note: when Supabase isn't configured, lib/auth reports a device
 * identity as "signed in", so this gate is transparent locally — the wall
 * engages automatically the moment real keys land in .env.local.
 */
export default function AppGate() {
  const { userId, loading } = useSession();

  // Start the auth engine early (idempotent). useSession also triggers this,
  // but calling here means the session resolves even before first paint.
  useEffect(() => {
    void initAuth();
  }, []);

  return (
    <>
      <OneScreen />

      {/* While the first session check is resolving, a calm veil — no
          auth-then-app flash. */}
      <AnimatePresence>
        {loading && (
          <motion.div
            key="veil"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 101,
              background: "#06070A",
              pointerEvents: "auto",
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{!loading && !userId && <AuthOverlay key="wall" />}</AnimatePresence>
    </>
  );
}

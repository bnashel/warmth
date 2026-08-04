"use client";

import { devUnlocked } from "@/lib/dev";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import OneScreen from "@/components/Screen/OneScreen";
import { AuthOverlay } from "@/components/Auth/AuthOverlay";
import { AccountChip } from "@/components/Auth/AccountChip";
import { initAuth, onAuthChange, isSignedIn, currentUserId, useSession } from "@/lib/auth";
import { claimLocalJournal, hydrateJournalFromCloud, syncLocalPhotos } from "@/lib/journalSync";
import { WelcomeGate } from "@/components/Welcome/WelcomeGate";

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
  // DEV WALL BYPASS (?wall=off, never in production): the bake-off judging
  // runs on signed-out phones over LAN, and the visual harness drives a
  // signed-out browser — both need the city without a session. Cloud
  // writes stay safely no-op without one; nothing else changes.
  const wallOff =
    devUnlocked() &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("wall") === "off";

  // Start the auth engine early (idempotent). useSession also triggers this,
  // but calling here means the session resolves even before first paint.
  useEffect(() => {
    void initAuth();
  }, []);

  // On sign-in, reconcile the journal with the account: claim on-device
  // entries up, then pull the full set (other devices) down. Once per uid
  // per session; also fires if a session was already restored at mount.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const uid = currentUserId();
      if (!isSignedIn() || syncedFor.current === uid) return;
      syncedFor.current = uid;
      void (async () => {
        await claimLocalJournal();
        await hydrateJournalFromCloud();
        // Rows first, then bytes: photos that exist only on this device
        // (attached pre-sign-in, or a failed upload) go up and their paths
        // land in the rows the other devices will hydrate.
        await syncLocalPhotos();
      })();
    };
    sync(); // already signed in? (session restored)
    return onAuthChange(sync); // or when sign-in lands
  }, []);

  return (
    <>
      <OneScreen />

      {/* While the first session check is resolving, a calm veil — no
          auth-then-app flash. */}
      <AnimatePresence>
        {!wallOff && loading && (
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

      <AnimatePresence>
        {!wallOff && !loading && !userId && <AuthOverlay key="wall" />}
      </AnimatePresence>
      {!loading && userId && <AccountChip />}

      {/* THE WELCOME: the first-run walkthrough (two versions, judged behind
          ?welcome=slides / ?welcome=film until Ben picks). Mounts only once
          the wall has resolved — it waits a further beat inside so the
          wall's exit finishes before the welcome breathes in. */}
      {!loading && (userId || wallOff) && <WelcomeGate />}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";

/**
 * THE ACCOUNT CHIP (Ben, 2026-07-09: "I logged in and nothing happened") —
 * the one visible trace of being signed in. A quiet glass pill in the
 * bottom-left corner: your email, and on tap, the door out. Lowercase,
 * springs, never louder than a label (the brightness law applies to
 * chrome too).
 */
export function AccountChip() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
  }, []);

  if (!email) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: "max(env(safe-area-inset-bottom), 44px)",
        zIndex: 20,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.settle}
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid rgba(233,236,244,0.12)",
          background: "rgba(10,11,15,0.55)",
          color: "rgba(233,236,244,0.5)",
          fontSize: 11,
          letterSpacing: "0.05em",
          cursor: "pointer",
        }}
      >
        {email.toLowerCase()}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            key="out"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={SPRING.settle}
            onClick={() => void signOut()}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(233,236,244,0.12)",
              background: "rgba(10,11,15,0.55)",
              color: "rgba(233,236,244,0.65)",
              fontSize: 11,
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            sign out
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

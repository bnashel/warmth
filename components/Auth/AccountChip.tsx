"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EMOTION_HUES, SPRING, type Emotion } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import { momentsStore } from "@/lib/momentsStore";
import { exportJournal, changeEmail, deleteAccount } from "@/lib/account";
import { replayWelcome } from "@/components/Welcome/state";
import { WELCOME_DEFAULT } from "@/components/Welcome/script";

/**
 * THE PROFILE (Ben, 2026-07-09): a small round chip, bottom-left; tap it
 * and a quiet glass card opens — your name (editable, kept in the
 * account), your email, and what your journal has become: entries, this
 * week, the feeling you feel most, and how long you've been here.
 * Lowercase, springs, glass — chrome never louder than a label.
 */
export function AccountChip() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<{
    entries: number;
    thisWeek: number;
    most: Emotion | null;
    since: string | null;
  }>({ entries: 0, thisWeek: 0, most: null, since: null });

  // The account section (export / change email / delete): quiet until asked.
  // Declared BEFORE the email gate below — hooks must run unconditionally.
  const [emailDraft, setEmailDraft] = useState<string | null>(null); // null = closed
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null); // one-line whisper
  const noteTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setName((data.session?.user.user_metadata?.display_name as string) ?? "");
    });
  }, []);

  if (!email) return null;
  const whisper = (text: string) => {
    setNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 3200);
  };

  // Stats are snapshotted when the card OPENS (render must stay pure —
  // Date.now() and the live store don't belong mid-render).
  const openCard = () => {
    // Re-read the session too: a name or email changed on another device —
    // or an email change confirmed since mount — should show, not the
    // mount-time snapshot.
    void supabase?.auth.getSession().then(({ data }) => {
      if (data.session?.user.email) setEmail(data.session.user.email);
    });
    setEmailDraft(null);
    setConfirmDelete(false);
    setNote(null);
    const own = momentsStore.ownPoints;
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const counts = new Map<Emotion, number>();
    for (const p of own) counts.set(p.emotion, (counts.get(p.emotion) ?? 0) + 1);
    const most = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    setStats({
      entries: own.length,
      thisWeek: own.filter((p) => p.createdAt > weekAgo).length,
      most: most ? most[0] : null,
      since: own.length
        ? new Date(Math.min(...own.map((p) => p.createdAt))).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
          })
        : null,
    });
    setOpen(true);
  };
  const { entries, thisWeek, most, since } = stats;

  const saveName = () => {
    const display_name = name.trim();
    void supabase?.auth.updateUser({ data: { display_name } });
  };

  const ghostRow: React.CSSProperties = {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "rgba(233,236,244,0.45)",
    fontSize: 12,
    cursor: "pointer",
  };

  const stat = (label: string, value: string, hue?: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: hue ?? "rgba(233,236,244,0.92)" }}>
        {value}
      </p>
      <p style={{ margin: "3px 0 0", fontSize: 11, letterSpacing: "0.06em", color: "rgba(233,236,244,0.45)" }}>
        {label}
      </p>
    </div>
  );

  return (
    <div style={{ position: "fixed", left: 16, bottom: "max(env(safe-area-inset-bottom), 44px)", zIndex: 20 }}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.25 } }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              bottom: 46,
              left: 0,
              width: 300,
              padding: "22px 22px 18px",
              borderRadius: 20,
              border: "1px solid rgba(233,236,244,0.14)",
              background: "rgba(10,11,15,0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <input
              value={name}
              placeholder="your name"
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 19,
                fontWeight: 500,
                color: "rgba(233,236,244,0.95)",
                padding: 0,
              }}
            />
            <p style={{ margin: "4px 0 18px", fontSize: 13, color: "rgba(233,236,244,0.5)" }}>
              {email.toLowerCase()}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {stat("entries", String(entries))}
              {stat("this week", String(thisWeek))}
              {most && stat("most felt", most, EMOTION_HUES[most])}
            </div>
            {since && (
              <p style={{ margin: "16px 0 0", fontSize: 12, color: "rgba(233,236,244,0.4)" }}>
                feeling the city since {since.toLowerCase()}
              </p>
            )}
            {/* the quiet way back to the welcome — only once a version has
                been picked (during the bake-off there is nothing to replay) */}
            {WELCOME_DEFAULT && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  replayWelcome();
                }}
                style={{
                  display: "block",
                  marginTop: 14,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "rgba(233,236,244,0.45)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                watch the welcome again
              </button>
            )}
            {/* your data — the three promises: take it, move it, erase it.
                Same 12px whisper voice as everything else in the card. */}
            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid rgba(233,236,244,0.08)",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => whisper(exportJournal() ? "saved to your downloads" : "couldn't export")}
                style={ghostRow}
              >
                save my journal to a file
              </button>

              {emailDraft === null ? (
                <button type="button" onClick={() => setEmailDraft("")} style={ghostRow}>
                  change my email
                </button>
              ) : (
                <div style={{ width: "100%", display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    inputMode="email"
                    autoFocus
                    placeholder="new email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setEmailDraft(null)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(233,236,244,0.14)",
                      background: "rgba(233,236,244,0.05)",
                      color: "rgba(233,236,244,0.92)",
                      fontSize: 12.5,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const next = (emailDraft ?? "").trim();
                      if (!next.includes("@")) return whisper("that doesn't look like an email");
                      setBusy(true);
                      void changeEmail(next).then(({ error }) => {
                        setBusy(false);
                        if (error) return whisper(error.toLowerCase());
                        setEmailDraft(null);
                        whisper("check both inboxes to confirm");
                      });
                    }}
                    style={{ ...ghostRow, opacity: busy ? 0.5 : 1 }}
                  >
                    send
                  </button>
                </div>
              )}

              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)} style={ghostRow}>
                  delete my account
                </button>
              ) : (
                <div style={{ width: "100%" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: "rgba(233,236,244,0.6)",
                    }}
                  >
                    your journal and photos are erased everywhere, including this
                    device. feelings already given to the city stay in the city —
                    they were never linked to you. this cannot be undone.
                  </p>
                  <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void deleteAccount().then(({ error }) => {
                          // Success never returns — the page reloads clean.
                          setBusy(false);
                          if (error) whisper(error.toLowerCase());
                        });
                      }}
                      style={{
                        ...ghostRow,
                        color: EMOTION_HUES.energy,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {busy ? "deleting…" : "yes — erase everything"}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} style={ghostRow}>
                      keep my account
                    </button>
                  </div>
                </div>
              )}

              {note && (
                <p style={{ margin: 0, fontSize: 11.5, color: "rgba(233,236,244,0.45)" }}>{note}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              style={{
                marginTop: 16,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(233,236,244,0.14)",
                background: "transparent",
                color: "rgba(233,236,244,0.55)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        aria-label="Profile"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.settle}
        whileTap={{ scale: 0.94 }}
        onClick={() => (open ? setOpen(false) : openCard())}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.55)",
          color: "rgba(233,236,244,0.65)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {(name.trim() || email)[0].toLowerCase()}
      </motion.button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { supabase } from "@/lib/supabase";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * The return leg of a magic link / Google / Apple sign-in. PKCE hands back a
 * `?code=`; we exchange it for a session, then drop the user on the map. If
 * there's no code (already-detected session), we just settle and redirect.
 * On-brand and calm — never a flash of raw text.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        router.replace("/");
      }
    };
    (async () => {
      if (!supabase) return finish();
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          setFailed(true);
          return;
        }
      }
      // No code (detectSessionInUrl handled a hash token, or nothing to do).
      finish();
    })();
    // Safety net: never hang on this screen.
    const t = window.setTimeout(finish, 4000);
    return () => window.clearTimeout(t);
  }, [router]);

  return (
    <div
      className={inter.className}
      style={{
        position: "fixed",
        inset: 0,
        background: "#06070A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(233,236,244,0.6)",
        fontSize: 14,
        letterSpacing: "0.02em",
      }}
    >
      {failed ? (
        <button
          onClick={() => router.replace("/")}
          style={{
            background: "none",
            border: "1px solid rgba(233,236,244,0.16)",
            borderRadius: 12,
            padding: "10px 16px",
            color: "rgba(233,236,244,0.8)",
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          that link didn&apos;t work — try again
        </button>
      ) : (
        "signing you in…"
      )}
    </div>
  );
}

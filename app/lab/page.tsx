"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

// The lab is gesture/audio-driven and meaningless on the server — client-only
// (also kills any hydration-flash risk, accepted for the lab page only).
const LabShell = dynamic(() => import("@/components/Lab/LabShell"), {
  ssr: false,
});

export default function LabPage() {
  // The lab is a workshop, not a product surface: dev + flagged previews only.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LABS !== "1") {
    notFound();
  }
  return <LabShell />;
}

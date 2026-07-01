"use client";

import dynamic from "next/dynamic";

// The lab is gesture/audio-driven and meaningless on the server — client-only
// (also kills any hydration-flash risk, accepted for the lab page only).
const LabShell = dynamic(() => import("@/components/orb/LabShell"), {
  ssr: false,
});

export default function LabPage() {
  return <LabShell />;
}

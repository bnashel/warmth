"use client";

import dynamic from "next/dynamic";

// The whole app is one screen: the breathing city + the orb. Mapbox and the
// orb's gestures need the DOM — client-only, no hydration flash.
const OneScreen = dynamic(() => import("@/components/Screen/OneScreen"), {
  ssr: false,
});

export default function Home() {
  return <OneScreen />;
}

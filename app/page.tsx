"use client";

import dynamic from "next/dynamic";

// The whole app is one screen: the breathing city + the orb, behind the auth
// wall (AppGate). Mapbox and the orb's gestures need the DOM — client-only,
// no hydration flash.
const AppGate = dynamic(() => import("@/components/Auth/AppGate"), {
  ssr: false,
});

export default function Home() {
  return <AppGate />;
}

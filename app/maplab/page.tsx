"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

// Mapbox needs the DOM — client-only, no hydration flash (lab page rule).
const MapLab = dynamic(() => import("@/components/maplab/MapLab"), { ssr: false });

export default function MapLabPage() {
  // The lab is a workshop, not a product surface: dev + flagged previews only.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LABS !== "1") {
    notFound();
  }
  return <MapLab />;
}

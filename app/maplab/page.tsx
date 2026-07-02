"use client";

import dynamic from "next/dynamic";

// Mapbox needs the DOM — client-only, no hydration flash (lab page rule).
const MapLab = dynamic(() => import("@/components/maplab/MapLab"), { ssr: false });

export default function MapLabPage() {
  return <MapLab />;
}

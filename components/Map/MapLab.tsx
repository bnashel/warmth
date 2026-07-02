"use client";

import { useEffect } from "react";
import { Inter } from "next/font/google";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore } from "@/lib/momentsStore";
import { Atmosphere, MissingToken } from "./Atmosphere";
import { labSeedMoments } from "./labSeed";
import MapStage from "./MapStage";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * The map lab: Ink & Glow (Ben's pick), always lit with seeded test feelings
 * so style judgments stay honest. A workshop — gated out of production.
 */
export default function MapLab() {
  useEffect(() => {
    for (const m of labSeedMoments()) momentsStore.add(m);
  }, []);

  return (
    <div
      className={inter.className}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0B0F",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {MAPBOX_TOKEN ? <MapStage /> : <MissingToken />}
      <Atmosphere />
    </div>
  );
}

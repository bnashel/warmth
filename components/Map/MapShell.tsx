"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";

// mapbox needs `window`, so load the canvas client-only.
const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });

/**
 * Full-bleed shell: the map, and a single low-key wordmark. Nothing else.
 */
export default function MapShell() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <MapCanvas />
      <motion.span
        className="pointer-events-none fixed left-5 top-4 z-10 select-none text-sm font-medium tracking-[0.02em] text-foreground/70 mix-blend-plus-lighter"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      >
        warmth
      </motion.span>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import type { Map as MapboxMap } from "mapbox-gl";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore, type Moment } from "@/lib/momentsStore";
import { armLocation, currentFix } from "@/lib/location";
import { panic, unlockAudio } from "@/lib/sound";
import { ORB } from "@/lib/feel";
import type { Emotion } from "@/lib/theme";
import { Atmosphere, MissingToken } from "@/components/Map/Atmosphere";
import MapStage from "@/components/Map/MapStage";
import { CAMERA, CHOREO } from "@/components/Map/tune";
import { OrbFlow } from "@/components/orb/OrbFlow";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * THE screen: the city breathing full-bleed, the orb floating above it.
 * Committing a feeling is one continuous act — the orb bursts, a beat of
 * silence, then the map blooms at your location in the same hue and the
 * light settles into the ambient field. If your bloom would land off-screen,
 * the camera glides you to it; if it's visible, the camera never moves.
 */
export default function OneScreen() {
  const mapRef = useRef<MapboxMap | null>(null);
  const gestureDepth = useMotionValue(0);
  const [centerHint, setCenterHint] = useState(false);

  // The product renders real feelings only — sweep any lab seed data.
  useEffect(() => {
    momentsStore.clearTest();
    // Sounds must never survive the tab losing focus mid-gesture.
    const onHide = () => {
      if (document.hidden) panic();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  /** Inside the NYC stage? (A fix in another city can't land on this map.) */
  function inBounds(lng: number, lat: number): boolean {
    const [[w, s], [e, n]] = CAMERA.maxBounds;
    return lng >= w && lng <= e && lat >= s && lat <= n;
  }

  /** Screen-visible with a margin? — decides whether the camera glides. */
  function onScreen(map: MapboxMap, lng: number, lat: number): boolean {
    const p = map.project([lng, lat]);
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const mx = w * CHOREO.glide.marginPct;
    const my = h * CHOREO.glide.marginPct;
    return p.x >= mx && p.x <= w - mx && p.y >= my && p.y <= h - my;
  }

  function handleCommit({ emotion, intensity }: { emotion: Emotion; intensity: number }) {
    const map = mapRef.current;
    // The burst is playing on the orb. One beat of silence, then the city
    // receives it — the bloom continues the burst's outward motion.
    window.setTimeout(() => {
      const fix = currentFix();
      const usable = fix && inBounds(fix.lng, fix.lat) ? fix : null;
      const center = map?.getCenter();
      const lng = usable?.lng ?? center?.lng ?? CAMERA.initial.longitude;
      const lat = usable?.lat ?? center?.lat ?? CAMERA.initial.latitude;

      const moment: Moment = {
        id: crypto.randomUUID(),
        emotion,
        intensity,
        lng,
        lat,
        createdAt: Date.now(),
        own: true,
      };
      momentsStore.add(moment); // the bloom ignites (arrival envelope)

      // One-time whisper when the feeling lands where you're looking.
      if (!usable && !sessionStorage.getItem("warmth-center-hint")) {
        sessionStorage.setItem("warmth-center-hint", "1");
        setCenterHint(true);
        window.setTimeout(() => setCenterHint(false), 3600);
      }

      // Glide only if the bloom would live off-screen (Ben's call).
      if (map && !onScreen(map, lng, lat)) {
        map.easeTo({
          center: [lng, lat],
          duration: CHOREO.glide.durationMs,
          essential: true,
        });
      }
    }, CHOREO.beatMs);
  }

  return (
    <div
      className={inter.className}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0B0F",
        overflow: "hidden",
        overscrollBehavior: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {MAPBOX_TOKEN ? (
        <MapStage
          onMapReady={(m) => {
            mapRef.current = m;
          }}
        />
      ) : (
        <MissingToken />
      )}
      <Atmosphere />

      {/* The orb, floating bottom-center above the city. Touch gestures are
          the orb's inside this island; the map keeps its own everywhere else. */}
      <div
        onPointerDown={() => {
          unlockAudio();
          armLocation(); // permission asked at INTENT — never on load
        }}
        style={{
          position: "absolute",
          left: "50%",
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset}px)`,
          transform: "translate(-50%, 50%)",
          zIndex: 10,
          touchAction: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <OrbFlow hintWord="hold" gestureDepth={gestureDepth} onCommit={handleCommit} />
      </div>

      {/* One-time whisper: where a feeling lands without location. */}
      <AnimatePresence>
        {centerHint && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.55, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset + 96}px)`,
              textAlign: "center",
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "rgba(233,236,244,0.8)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            your feeling lands where you&apos;re looking
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

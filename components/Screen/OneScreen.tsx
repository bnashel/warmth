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
import { SPRING, type Emotion } from "@/lib/theme";
import { Atmosphere, MissingToken } from "@/components/Map/Atmosphere";
import MapStage from "@/components/Map/MapStage";
import { CAMERA, CHOREO, MOTION } from "@/components/Map/tune";
import { OrbFlow } from "@/components/orb/OrbFlow";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * THE screen: the city breathing full-bleed, the orb floating above it.
 * Committing a feeling is one continuous act — the orb bursts, a beat of
 * silence, then the map blooms at your location in the same hue and the
 * light settles into the ambient field. If your bloom would land off-screen
 * the camera glides there FIRST and the light ignites as you arrive — the
 * flight is the drumroll, never a replay of something you missed.
 */
export default function OneScreen() {
  const mapRef = useRef<MapboxMap | null>(null);
  const committedOnce = useRef(false);
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

  // While a finger is on the orb, the city holds still — a second finger
  // must never pan the map out from under the tube mid-rating.
  useEffect(() => {
    let frozen = false;
    return gestureDepth.on("change", (d) => {
      const map = mapRef.current;
      if (!map) return;
      if (d > 0.02 && !frozen) {
        frozen = true;
        map.dragPan.disable();
        map.touchZoomRotate.disable();
        map.scrollZoom.disable();
      } else if (d <= 0.02 && frozen) {
        frozen = false;
        map.dragPan.enable(MOTION.dragPan);
        map.touchZoomRotate.enable(); // rotation stays on (Ben's call)
        map.scrollZoom.enable();
        map.scrollZoom.setWheelZoomRate(MOTION.wheelZoomRate);
      }
    });
  }, [gestureDepth]);

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
    committedOnce.current = true;
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

      const ignite = () => momentsStore.add(moment);

      if (map && !onScreen(map, lng, lat)) {
        // Off-screen: fly first, ignite as you arrive — the glide is the
        // drumroll; the bloom must never play to an empty theater.
        map.easeTo({ center: [lng, lat], duration: CHOREO.glide.durationMs });
        window.setTimeout(ignite, CHOREO.glide.durationMs * 0.85);
      } else {
        ignite();
      }

      // One-time whisper when the feeling lands where you're looking —
      // arriving as the bloom settles, so it never competes with the light.
      if (!usable && !sessionStorage.getItem("warmth-center-hint")) {
        sessionStorage.setItem("warmth-center-hint", "1");
        window.setTimeout(() => setCenterHint(true), 800);
        window.setTimeout(() => setCenterHint(false), 4400);
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
          // Location permission is asked at INTENT, never on load — and never
          // during the FIRST gesture: iOS throws a modal permission alert the
          // instant we arm, which would kill the wheel under the finger. The
          // first feeling lands where you're looking (with the whisper); the
          // next touch arms for real, still inside a user gesture.
          if (committedOnce.current) armLocation();
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
            transition={SPRING.settle}
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

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
import { ambientSeedMoments } from "@/components/Map/ambientSeed";
import { CAMERA, CHOREO, MOTION } from "@/components/Map/tune";
import { OrbFlow } from "@/components/orb/OrbFlow";
import { solarPaperWeight } from "@/components/Map/solar";
import { onPrefsChange } from "@/lib/prefs";
import { LookPanel } from "./LookPanel";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

const VIEWS = [
  { key: "public", label: "public", caption: "the whole city, feeling together" },
  { key: "private", label: "private", caption: "only you can see this" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

/** crypto.randomUUID needs a secure context — a phone on the LAN dev URL
 *  (http://10.x.x.x) doesn't have one, and a commit must never throw. */
function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Session flags live in sessionStorage, which Safari can block entirely —
 *  hints are never worth throwing over. */
function sessionFlag(key: string, set?: boolean): boolean {
  try {
    if (set) window.sessionStorage.setItem(key, "1");
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * THE screen: the city breathing full-bleed, the orb floating above it,
 * and two ways of seeing — PUBLIC (everyone's feeling as standing weather)
 * and PRIVATE (your own moments as dots: a diary only you can see).
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
  const [view, setView] = useState<ViewKey>("public");
  // The trail rehydrates from localStorage when the store module loads —
  // by first render the diary already knows if it has entries.
  const [hasOwn, setHasOwn] = useState(() => momentsStore.ownPoints.length > 0);
  // Paperness of the map (0 ink night → 1 light day): every loose whisper of
  // text follows it, whisper-white on ink, graphite on paper — otherwise the
  // captions vanish at noon (design-review blocker). Starts 0 (SSR-stable),
  // lands on the real sun in the effect below.
  const [paper, setPaper] = useState(0);
  useEffect(() => {
    const update = () => setPaper(solarPaperWeight());
    update();
    const iv = window.setInterval(update, 60_000);
    const offPrefs = onPrefsChange(update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(iv);
      offPrefs();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  /** Loose-text ink for the current paperness (alpha lifts a touch on paper —
   *  dark-on-light needs more presence for the same whisper). */
  const paperText = (alpha: number) => {
    const c = (a: number, b: number) => Math.round(a + (b - a) * paper);
    return `rgba(${c(233, 52)},${c(236, 58)},${c(244, 70)},${Math.min(1, alpha * (1 + 0.5 * paper))})`;
  };

  // Sweep lab data, then lay in the ambient city — the public map opens
  // onto standing feeling (clearly-labeled seed until realtime replaces it).
  // The seed ages out over the 24h recency window, so a long-lived or
  // re-surfaced tab replenishes it: dedupe keeps living seeds, culled ones
  // re-enter fresh — the water never evaporates (review finding).
  useEffect(() => {
    momentsStore.clearTest();
    momentsStore.seedAmbient(ambientSeedMoments());
    const replenish = window.setInterval(
      () => momentsStore.seedAmbient(ambientSeedMoments()),
      30 * 60_000,
    );
    // Sounds must never survive the tab losing focus mid-gesture.
    const onVisibility = () => {
      if (document.hidden) panic();
      else momentsStore.seedAmbient(ambientSeedMoments());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(replenish);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
      // Fix-less feelings land where you're looking — with a whisper of
      // scatter (~±80m) so repeat commits pool side by side instead of
      // stacking into one white-hot point (review finding).
      const jitter = usable ? 0 : 0.0008;
      const lng =
        (usable?.lng ?? center?.lng ?? CAMERA.initial.longitude) + (Math.random() - 0.5) * jitter * 2;
      const lat =
        (usable?.lat ?? center?.lat ?? CAMERA.initial.latitude) + (Math.random() - 0.5) * jitter * 2;

      const moment: Moment = {
        id: makeId(),
        emotion,
        intensity,
        lng,
        lat,
        createdAt: Date.now(),
        own: true,
      };

      const ignite = () => {
        momentsStore.add(moment);
        setHasOwn(true); // the private diary has its first entry
      };

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
      if (!usable && !sessionFlag("warmth-center-hint")) {
        sessionFlag("warmth-center-hint", true);
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
          view={view}
          onMapReady={(m) => {
            mapRef.current = m;
          }}
        />
      ) : (
        <MissingToken />
      )}
      <Atmosphere />

      {/* The Look panel — shape of feeling + how hard the sun shows. */}
      <LookPanel />

      {/* PUBLIC / PRIVATE — the two ways of seeing, named plainly. The pill
          slides on a spring; a whisper under it says what each view means. */}
      <div
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top, 0px), 18px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          role="group"
          aria-label="Map view"
          style={{
            display: "flex",
            padding: 3,
            borderRadius: 999,
            background: "rgba(10,11,15,0.55)",
            border: "1px solid rgba(233,236,244,0.14)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              style={{
                position: "relative",
                padding: "7px 20px",
                borderRadius: 999,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "0.07em",
                color: view === v.key ? "rgba(233,236,244,0.95)" : "rgba(233,236,244,0.42)",
                transition: "color 300ms ease",
                touchAction: "manipulation",
              }}
            >
              {/* Invisible reach: the pill stays slim, the thumb gets 44px. */}
              <span aria-hidden style={{ position: "absolute", inset: "-9px -3px" }} />
              {view === v.key && (
                <motion.span
                  layoutId="view-pill"
                  transition={SPRING.snappy}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 999,
                    background: "rgba(233,236,244,0.11)",
                    border: "1px solid rgba(233,236,244,0.1)",
                  }}
                />
              )}
              <span style={{ position: "relative" }}>{v.label}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={view}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 0.5, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={SPRING.snappy}
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.05em",
              color: paperText(0.9),
              pointerEvents: "none",
            }}
          >
            {VIEWS.find((v) => v.key === view)!.caption}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Private view, no entries yet: the diary explains itself. */}
      <AnimatePresence>
        {view === "private" && !hasOwn && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.55, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset + 148}px)`,
              textAlign: "center",
              fontSize: 13,
              lineHeight: 1.6,
              letterSpacing: "0.04em",
              color: paperText(0.85),
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            your trail starts here — hold the orb to leave your first feeling
          </motion.p>
        )}
      </AnimatePresence>

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
        <OrbFlow
          hintWord="hold"
          hintColor={paperText(1)}
          gestureDepth={gestureDepth}
          onCommit={handleCommit}
        />
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
              color: paperText(0.8),
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import type { Map as MapboxMap } from "mapbox-gl";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore, type Moment } from "@/lib/momentsStore";
import { armLocation, currentFix } from "@/lib/location";
import { panic, unlockAudio } from "@/lib/sound";
import { ORB } from "@/components/Orb/feel";
import { SPRING, type Emotion } from "@/lib/theme";
import { Atmosphere, MissingToken } from "@/components/Map/Atmosphere";
import { Lightning } from "@/components/Map/Lightning";
import MapStage from "@/components/Map/MapStage";
import { ambientSeedMoments } from "@/components/Map/ambientSeed";
import { CAMERA, CHOREO, MOTION } from "@/components/Map/tune";
import { OrbFlow } from "@/components/Orb/OrbFlow";
import { atmosphere } from "@/lib/atmosphere";
import { WeatherPreview } from "@/components/Lab/WeatherPreview";

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
  // THE HOLD SCRIM (Ben-approved choreography): while a finger is on the
  // orb the city dims and stills beneath a soft veil — the picker always
  // reads, even over a bright field. Rides gestureDepth: zero re-renders.
  const scrimOpacity = useTransform(gestureDepth, (d) => d * 0.45);
  // Post-commit whisper: a small confirmation near where the light landed.
  const [whisper, setWhisper] = useState<{ text: string; x: number; y: number } | null>(null);
  const whisperTimer = useRef<number | null>(null);
  // Learning mode: the first 3 commits name every picker dot (persisted —
  // storage can be blocked; never worth throwing over).
  const [commitCount, setCommitCount] = useState(() => {
    try {
      return Number(window.localStorage.getItem("warmth-commit-count") ?? 0) || 0;
    } catch {
      return 0;
    }
  });
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
    // Quantized so React only re-renders when the ink meaningfully moves.
    const update = () => setPaper(Math.round(atmosphere.current.paper * 40) / 40);
    update();
    const iv = window.setInterval(update, 2_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(iv);
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
    // Learning labels retire after the third commit.
    setCommitCount((n) => {
      const next = n + 1;
      try {
        window.localStorage.setItem("warmth-commit-count", String(next));
      } catch {
        /* storage blocked — labels just stay a session longer */
      }
      return next;
    });
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

      const glide = map && !onScreen(map, lng, lat);
      if (glide) {
        // Off-screen: fly first, ignite as you arrive — the glide is the
        // drumroll; the bloom must never play to an empty theater.
        map.easeTo({ center: [lng, lat], duration: CHOREO.glide.durationMs });
        window.setTimeout(ignite, CHOREO.glide.durationMs * 0.85);
      } else {
        ignite();
      }

      // The whisper: a small confirmation near the landing point, arriving
      // as the bloom settles, gone in ~2s — never competing with the light.
      const text = view === "public" ? "added to the city" : "left a trace";
      window.setTimeout(
        () => {
          const m = mapRef.current;
          if (!m) return;
          const p = m.project([lng, lat]);
          setWhisper({ text, x: p.x, y: p.y });
          if (whisperTimer.current) window.clearTimeout(whisperTimer.current);
          whisperTimer.current = window.setTimeout(() => setWhisper(null), 2000);
        },
        glide ? CHOREO.glide.durationMs + 250 : 750,
      );
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

      {/* The storm answers back: flicker + distant thunder (storm-gated). */}
      <Lightning />

      {/* THE HOLD SCRIM — while choosing, the city dims and stills beneath
          a soft veil (gestures are already frozen on the same signal). The
          picker always reads, even over a bright field. Opacity-only. */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "#06070A",
          opacity: scrimOpacity,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Dev-only: force any weather/hour to see it (renders null in prod). */}
      <WeatherPreview />

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
              // The ink poll steps every 2s; CSS chains the steps smooth.
              transition: "color 2.2s linear",
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
              transition: "color 2.2s linear",
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
        onWheel={(e) => {
          // The island must never eat the map's zoom: a wheel over the orb
          // forwards a clone to the map canvas (trackpad pinch arrives as
          // ctrl+wheel and rides the same path).
          const map = mapRef.current;
          if (!map) return;
          map.getCanvas().dispatchEvent(
            new WheelEvent("wheel", {
              deltaX: e.deltaX,
              deltaY: e.deltaY,
              deltaMode: e.deltaMode,
              clientX: e.clientX,
              clientY: e.clientY,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              bubbles: true,
              cancelable: true,
            }),
          );
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
          paper={paper}
          namesOn={commitCount < 3}
          gestureDepth={gestureDepth}
          onCommit={handleCommit}
        />
      </div>

      {/* Post-commit whisper: a small confirmation near the landing point,
          gone in ~2s. "added to the city" (public) / "left a trace" (private). */}
      <AnimatePresence>
        {whisper && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: whisper.x,
              // Above the bloom's radius — the words must never sit on the
              // brightest light (design review: illegible on a big commit).
              top: whisper.y - 56,
              x: "-50%",
              fontSize: 12,
              letterSpacing: "0.05em",
              color: paperText(0.85),
              // A soft ink micro-plate so the whisper reads over any hue.
              background: "rgba(6,7,10,0.55)",
              padding: "3px 10px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            {whisper.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

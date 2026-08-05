"use client";

import { devUnlocked } from "@/lib/dev";
import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import type { Map as MapboxMap } from "mapbox-gl";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore, type Moment } from "@/lib/momentsStore";
import { armLocation, currentFix } from "@/lib/location";
import { panic, unlockAudio } from "@/lib/sound";
import { ORB } from "@/components/Orb/feel";
import { EMOTION_HUES as EMOTION_HUES_SAFE, SPRING, type Emotion } from "@/lib/theme";
import { Atmosphere, MissingToken } from "@/components/Map/Atmosphere";
import { Lightning } from "@/components/Map/Lightning";
import MapStage from "@/components/Map/MapStage";
import { LookGallery, galleryEnabled } from "@/components/Lab/LookGallery";
import { COPY } from "@/lib/copy";
import EmotionLegend from "@/components/Map/EmotionLegend";
import { ambientSeedMoments } from "@/components/Map/ambientSeed";
import { fetchPublicField, subscribePublicField, markSelfCommit } from "@/lib/publicField";
import { CAMERA, CHOREO, MOTION } from "@/components/Map/tune";
import { OrbFlow } from "@/components/Orb/OrbFlow";
import { atmosphere } from "@/lib/atmosphere";
import { inkWeight } from "@/components/Map/solar";
import { WeatherPreview } from "@/components/Lab/WeatherPreview";
import { MemoryCard } from "@/components/Trail/MemoryCard";
import { TimeScrubber } from "@/components/Trail/TimeScrubber";
import { journalTestMode, journalTestPoints } from "@/components/Trail/testJournal";
import { setLens } from "@/lib/emotionLens";
import { scrubTo } from "@/lib/timeScrub";
import {
  setWelcomeStage,
  welcomeStage,
  notifyWelcomeCommit,
  type WelcomeStage,
} from "@/components/Welcome/stage";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/** "3 months apart" — the aurora's time-gap whisper (tap a connection). */
function gapLabel(ms: number): string {
  const minutes = ms / 60_000;
  const hours = minutes / 60;
  const days = hours / 24;
  const weeks = days / 7;
  const months = days / 30.44;
  const years = days / 365.25;
  const n = (v: number, unit: string) => {
    const r = Math.round(v);
    return r === 1 ? `${unit === "an hour" ? "an hour" : `a ${unit}`} apart` : `${r} ${unit}s apart`;
  };
  if (minutes < 45) return "moments apart";
  if (hours < 36) return n(hours, "hour").replace("a hour", "an hour");
  if (days < 10) return n(days, "day");
  if (weeks < 8) return n(weeks, "week");
  if (months < 18) return n(months, "month");
  return n(years, "year");
}

const VIEWS = [
  { key: "public", label: COPY.viewPublic, caption: COPY.viewPublicCaption },
  // The journal must read cold: whose it is, what the marks are, and that
  // they're one story through time (Eli, 2026-07-08 clarity pass).
  { key: "private", label: COPY.viewPrivate, caption: COPY.viewPrivateCaption },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

/** crypto.randomUUID needs a secure context — a phone on the LAN dev URL
 *  (http://10.x.x.x) doesn't have one, and a commit must never throw. The
 *  fallback still emits VALID uuid shape: journal ids are uuid columns in
 *  Postgres, and a non-uuid id would fail every cloud insert (code review). */
function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((Math.random() * 4) | 8).toString(16)}${hex(3)}-${hex(12)}`;
}

/** Session flags live in sessionStorage, which Safari can block entirely —
 *  hints are never worth throwing over. (Restored post-merge: the journal's
 *  on-this-day greeting shows once per session.) */
function sessionFlag(key: string, set?: boolean): boolean {
  try {
    if (set) window.sessionStorage.setItem(key, "1");
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** "a year ago today" / "3 months ago today" — the on-this-day whisper.
 *  Whole months, not calendar-year diff: Dec→Jan is one month, not a year. */
function agoLabel(createdAt: number): string {
  const now = new Date();
  const then = new Date(createdAt);
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return years === 1 ? "a year ago today" : `${years} years ago today`;
  }
  return months <= 1 ? "a month ago today" : `${months} months ago today`;
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
  // (Learning labels retired 07-27, Eli: names around the wheel crowded
  // the orb. The single active-emotion word above the orb and the legend
  // carry the teaching now — OrbFlow's namesOn stays available.)
  // Aurora time-gap whisper (thread looks): tap a connection between two
  // memories and the time between them surfaces there, then breathes away.
  const [gapChip, setGapChip] = useState<{ text: string; x: number; y: number } | null>(null);
  const gapTimer = useRef<number | null>(null);
  // THE ONE GALLERY (dev-only chip). Set a beat after mount: SSR-stable.
  const [galleryOn, setGalleryOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGalleryOn(galleryEnabled()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [view, setView] = useState<ViewKey>("public");
  // The trail rehydrates from localStorage when the store module loads —
  // by first render the diary already knows if it has entries.
  const [hasOwn, setHasOwn] = useState(() => momentsStore.ownPoints.length > 0);
  // THE WELCOME's stage contract: the walkthrough may switch the view, move
  // the camera, and fade the orb island while its ghost performs in place.
  // OneScreen never knows whether a welcome is playing — it just registers
  // the doorway (and announces the first feeling in handleCommit below).
  const [orbHidden, setOrbHidden] = useState(false);
  const [hintsMuted, setHintsMuted] = useState(false);
  useEffect(() => {
    const mine: WelcomeStage = {
      setView: (v) => setView(v),
      getMap: () => mapRef.current,
      setOrbHidden,
      setHintsMuted,
    };
    setWelcomeStage(mine);
    // Unregister only our own registration — never clobber a newer one
    // (strict-mode remounts interleave cleanup with the next setup).
    return () => {
      if (welcomeStage() === mine) setWelcomeStage(null);
    };
  }, []);
  // The journal: which spark's memory is open, and today's resurfaced moment.
  const [editingId, setEditingId] = useState<string | null>(null);
  // THE TIME SCRUBBER's span: the journal's first day → now. Needs at
  // least two moments to be a journey; test-journal aware so judging
  // sessions replay too. Re-derived on view entry / first entry.
  const [scrubStart, setScrubStart] = useState<number | null>(null);
  useEffect(() => {
    // Deferred a beat (the set-state-in-effect rule; same pattern as the
    // intro veil) — the scrubber arriving one frame late is invisible.
    const id = window.setTimeout(() => {
      if (view !== "private") {
        setScrubStart(null);
        return;
      }
      const pts = journalTestMode() ? journalTestPoints() : momentsStore.ownPoints;
      if (pts.length < 2) {
        setScrubStart(null);
        return;
      }
      let start = Infinity;
      for (const p of pts) start = Math.min(start, p.createdAt);
      // A journey shorter than a day has nothing to scrub through.
      setScrubStart(Date.now() - start > 86_400_000 ? start : null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [view, hasOwn]);
  const [onThisDay, setOnThisDay] = useState<Moment | null>(null);
  // The lens and the scrub belong to the private view — leaving it always
  // releases both. (The scrubber itself keeps its state across remounts,
  // e.g. while a memory card hides it — this is the one true reset.)
  useEffect(() => {
    if (view !== "private") {
      setLens(null);
      scrubTo(null);
    }
  }, [view]);
  useEffect(() => {
    if (view !== "private") return;
    // Greet once per session, only when the journal actually has a memory
    // from this date in an earlier month/year.
    if (sessionFlag("warmth-on-this-day")) return;
    const matches = momentsStore.onThisDay();
    if (matches.length === 0) return;
    sessionFlag("warmth-on-this-day", true);
    // A beat after the crossfade settles — the greeting arrives, never pops.
    const show = window.setTimeout(() => setOnThisDay(matches[0]), 700);
    const hide = window.setTimeout(() => setOnThisDay(null), 10_700);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [view]);
  // Paperness of the map (0 ink night → 1 light day): every loose whisper of
  // text follows it, whisper-white on ink, graphite on paper — otherwise the
  // captions vanish at noon (design-review blocker). Starts 0 (SSR-stable),
  // lands on the real sun in the effect below.
  const [paper, setPaper] = useState(0);
  useEffect(() => {
    // Quantized so React only re-renders when the ink meaningfully moves.
    // inkWeight: paper world reads the SUN (bone noon -> slate midnight);
    // night world reads the material scalar as before.
    const update = () => setPaper(Math.round(inkWeight(atmosphere.current) * 40) / 40);
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

  // The public map opens onto the REAL last-24h field (coarsened cells from
  // the DB). If the database is empty or unreachable, the ambient seed city
  // stands in so the map is never blank — and it replenishes on the 24h
  // window like before. Realtime keeps the real field live thereafter.
  useEffect(() => {
    let cancelled = false;
    let replenish: number | undefined;
    let stopLive: (() => void) | undefined;

    momentsStore.clearTest();
    let fallback = false;
    // Ben's seed is async (it waits for the real land polygons); idempotent
    // adds, so racing calls are harmless — dedupe is by id.
    const seed = () =>
      void ambientSeedMoments().then((m) => {
        if (!cancelled) momentsStore.seedAmbient(m);
      });

    // JUDGING PARAM (?field=seed, dev only): the bake-off needs the rich
    // seeded field on both worlds even though the real DB has data now —
    // a handful of real cells reads as an empty city in a style judgment.
    const forceSeed =
      devUnlocked() &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("field") === "seed";

    void (forceSeed ? Promise.resolve([]) : fetchPublicField()).then((cells) => {
      if (cancelled) return;
      if (cells.length > 0) {
        momentsStore.ingestPublicField(cells);
      } else {
        // Fallback: the ambient placeholder city, replenished on the window.
        fallback = true;
        seed();
        replenish = window.setInterval(seed, 30 * 60_000);
      }
      // Live: others' feelings arrive as coarsened blooms (no-op without a
      // client). Both modes — a fallback map still goes live the moment a
      // real feeling lands.
      stopLive = subscribePublicField((cell) => momentsStore.ingestLivePublic(cell));
    });

    // Sounds must never survive the tab losing focus; a returning fallback
    // map re-seeds so the water never evaporates.
    const onVisibility = () => {
      if (document.hidden) panic();
      else if (fallback) seed();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (replenish) window.clearInterval(replenish);
      stopLive?.();
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
        map.touchZoomRotate.enable(); // pinch zoom back; touch rotation stays off (07-27 — the flag survives this cycle)
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
    // The welcome (if one is playing) dissolves on this exact beat — the
    // burst has just begun; the first real feeling completes the walkthrough.
    notifyWelcomeCommit({ emotion, intensity });
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
        // My own feeling renders locally at its exact spot; when its
        // coarsened echo returns over realtime, skip it (no double bloom).
        markSelfCommit(lng, lat, emotion);
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
        // THE GESTURE LOCK (mobile audit, 07-27): every touch starts
        // inside this stage, and none of it belongs to the browser — no
        // page pinch-zoom, no double-tap zoom, no rubber-band. The map's
        // and orb's own handlers keep receiving everything.
        touchAction: "none",
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
          onEntryTap={(id) => {
            // Only real journal entries open a card — a ?journal=test
            // lantern has no store row, and a card that renders nothing
            // would silently eat the screen (review: the dead-end trap).
            const entry = momentsStore.journalEntry(id);
            if (!entry) return;
            setEditingId(id);
            // The camera breathes toward the memory as its card opens —
            // the spot rises to the upper third so the card never covers
            // the lantern you just touched (private redesign, 07-17).
            const m = mapRef.current;
            if (m) {
              m.easeTo({
                center: [entry.lng, entry.lat],
                offset: [0, -Math.round(m.getContainer().clientHeight * 0.16)],
                duration: 900,
              });
            }
          }}
          onGapTap={(gapMs, x, y) => {
            setGapChip({ text: gapLabel(gapMs), x, y });
            if (gapTimer.current) window.clearTimeout(gapTimer.current);
            gapTimer.current = window.setTimeout(() => setGapChip(null), 2600);
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
          // glass-blur: frosted on desktop only (mobile audit — backdrop
          // blur over the live canvas is a per-frame readback on phones).
          className="glass-blur"
          style={{
            display: "flex",
            padding: 3,
            borderRadius: 999,
            background: "rgba(10,11,15,0.62)",
            border: "1px solid rgba(233,236,244,0.14)",
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

      {/* Private view, no entries yet: the diary explains itself — unless
          the welcome is mid-story (its captions own the screen). */}
      <AnimatePresence>
        {view === "private" && !hasOwn && !hintsMuted && (
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
            hold the orb to leave your first feeling
          </motion.p>
        )}
      </AnimatePresence>

      {/* The orb, floating bottom-center above the city. Touch gestures are
          the orb's inside this island; the map keeps its own everywhere else.
          The welcome may fade the island while its ghost demos in its place —
          opacity only, and the island goes deaf so taps fall through. */}
      <motion.div
        animate={{ opacity: orbHidden ? 0 : 1 }}
        transition={SPRING.settle}
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
          pointerEvents: orbHidden ? "none" : "auto",
        }}
      >
        <OrbFlow
          hintWord="hold"
          hintColor={paperText(1)}
          paper={paper}
          muted={hintsMuted}
          gestureDepth={gestureDepth}
          onCommit={handleCommit}
        />
      </motion.div>

      {/* THE TIME SCRUBBER (private redesign, 07-17): drag back through
          your year and watch the journal replay — lanterns kindle as
          their moments arrive, the month whispers above your finger.
          Hidden while a memory card is open or the welcome is telling. */}
      <AnimatePresence>
        {view === "private" && scrubStart && !editingId && !hintsMuted && (
          <motion.div
            key="time-scrubber"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: 26,
              right: 26,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset + 96}px)`,
              height: 40,
              zIndex: 10,
            }}
          >
            <TimeScrubber startMs={scrubStart} ink={paperText(0.9)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The journal: tap a spark, hold the moment. */}
      <AnimatePresence>
        {view === "private" && editingId && (
          // key: a fresh card per entry — state from one spark must never
          // bleed into (or save onto) another (code-review blocker).
          <MemoryCard key={editingId} entryId={editingId} onClose={() => setEditingId(null)} />
        )}
      </AnimatePresence>

      {/* On this day — the journal greets you with an old feeling. Never
          while a walkthrough narrates (one teacher at a time). */}
      <AnimatePresence>
        {view === "private" && onThisDay && !hintsMuted && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING.settle}
            onClick={() => {
              mapRef.current?.easeTo({
                center: [onThisDay.lng, onThisDay.lat],
                zoom: 13,
                duration: 1200,
              });
              setEditingId(onThisDay.id);
              setOnThisDay(null);
            }}
            style={{
              position: "absolute",
              top: "calc(max(env(safe-area-inset-top, 0px), 18px) + 64px)",
              left: "50%",
              // Framer owns the transform (it animates y) — a static
              // translateX would be discarded mid-animation (design review).
              x: "-50%",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 999,
              background: "rgba(10,11,15,0.62)",
              border: "1px solid rgba(233,236,244,0.14)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              color: "rgba(233,236,244,0.85)",
              fontSize: 12.5,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: EMOTION_HUES_SAFE[onThisDay.emotion],
                boxShadow: `0 0 8px ${EMOTION_HUES_SAFE[onThisDay.emotion]}99`,
              }}
            />
            {agoLabel(onThisDay.createdAt)} · {onThisDay.emotion}
          </motion.button>
        )}
      </AnimatePresence>

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
      {/* The aurora's answer: tap a connection, learn the distance in time
          between its two memories. A quiet glass chip at the tap, gone soon. */}
      <AnimatePresence>
        {view === "private" && gapChip && (
          <motion.p
            key={`${gapChip.x}:${gapChip.y}:${gapChip.text}`}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: gapChip.x,
              top: gapChip.y - 44,
              x: "-50%",
              zIndex: 12,
              margin: 0,
              padding: "7px 13px",
              borderRadius: 999,
              background: "rgba(16,13,20,0.72)",
              border: "1px solid rgba(244,220,180,0.16)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "rgba(240,224,196,0.88)",
              fontSize: 12,
              letterSpacing: "0.04em",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {gapChip.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* THE ONE GALLERY (merge, 07-13) + THE LEGEND/LENS (07-14/17).
          Both breathe away while a walkthrough narrates (07-27): the film
          owns the stage — no chips, no duplicate legend under its words. */}
      <motion.div
        animate={{ opacity: hintsMuted ? 0 : 1 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ pointerEvents: hintsMuted ? "none" : "auto" }}
      >
        {galleryOn && <LookGallery />}
        <EmotionLegend interactive={view === "private"} />
      </motion.div>

      {/* THE FIRST HELLO is now Ben's welcome film (Eli's call, 07-27):
          WELCOME_DEFAULT in Welcome/script.ts auto-plays it for first
          visits via AppGate's WelcomeGate. The three-line IntroVeil is
          retired from this slot — component kept for possible reuse. */}
    </div>
  );
}

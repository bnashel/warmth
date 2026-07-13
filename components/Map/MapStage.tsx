"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore } from "@/lib/momentsStore";
import { atmosphere } from "@/lib/atmosphere";
import { setRainLevel } from "@/lib/sound";
import { CAMERA, CHOREO, FIELD, INK, LABELS, LOOKS, MOTION, PAPER, PERF, SOLAR, WEATHER } from "./tune";
import { buildStyle } from "./styles";
import { applyAtmosphereInk, inkWeight, setWorld, worldFromUrl } from "./solar";
import { FieldLayer } from "./FieldLayer";
import { GalleryFieldLayer } from "./GalleryFieldLayer";
import { currentLook, onLookChange } from "./lookState";
import { PrecipLayer } from "./PrecipLayer";
import { buildLabelLayers, loadLabels } from "./neighborhoods";
import { buildTrailLayers } from "@/components/Trail/glow";
import type { Map as MapboxMap } from "mapbox-gl";

/** deck.gl overlay INTERLEAVED into the map's canvas — labels only now;
 *  the emotion field is a native custom layer beneath them. */
function DeckOverlay({ onReady }: { onReady: (o: MapboxOverlay) => void }) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved: true }));
  const sent = useRef(false);
  useEffect(() => {
    if (!sent.current) {
      sent.current = true;
      onReady(overlay);
    }
  }, [overlay, onReady]);
  return null;
}

/**
 * The stage: one full-screen map, hand-authored style, TWO WAYS OF SEEING —
 * public (THE FIELD: everyone's emotion as standing weather) and private
 * (THE TRAIL: your own moments as precise dots), crossfaded on the view
 * prop. One rAF loop advances the store and asks the map to repaint — full
 * rate while moving, blooming, or crossfading, ~15fps at rest so the breath
 * stays alive without warming phones. Zero React re-renders while panning.
 */
export default function MapStage({
  view = "public",
  onMapReady,
  onEntryTap,
  onGapTap,
}: {
  /** public = the field (everyone); private = your journal (sparks, only you). */
  view?: "public" | "private";
  /** The composed screen needs the camera (glide-to-bloom). */
  onMapReady?: (map: MapboxMap) => void;
  /** Private view: a spark was tapped — the screen opens its memory. */
  onEntryTap?: (id: string) => void;
  /** Private view (thread looks): an aurora connection was tapped — the
   *  screen whispers the time between its two memories (gapMs, x, y). */
  onGapTap?: (gapMs: number, x: number, y: number) => void;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const fieldRef = useRef<FieldLayer | GalleryFieldLayer | null>(null);
  const precipRef = useRef<PrecipLayer | null>(null);
  const labelData = useRef<Awaited<ReturnType<typeof loadLabels>>>([]);
  const labelCache = useRef<{
    zoom: number;
    paper: number;
    dimsKey: string;
    layers: ReturnType<typeof buildLabelLayers>;
  } | null>(null);
  const dataVersion = useRef(-1);
  const loaded = useRef(false);
  const [rotated, setRotated] = useState(false);
  const nextPulse = useRef(0);
  // RECENTER (Eli, 07-10): Apple-Maps-style chip — appears once you've
  // wandered from the SETTLED home view (bounds may clamp the request).
  const [away, setAway] = useState(false);
  const homeRef = useRef<{ lng: number; lat: number; zoom: number }>({
    lng: CAMERA.initial.longitude,
    lat: CAMERA.initial.latitude,
    zoom: CAMERA.initial.zoom,
  });
  // THE ONE GALLERY (merge, 07-13): every look from both trunks lives in
  // looks.ts; a switch is a DISSOLVE (rule: nothing pops) — breathe down
  // ~180ms, swap engine/world/dials at the trough, breathe back.
  const lookSwap = useRef<{ start: number; swapped: boolean } | null>(null);
  useEffect(
    () =>
      onLookChange(() => {
        lookSwap.current = { start: performance.now(), swapped: false };
      }),
    [],
  );
  /** Mount the engine the CURRENT look wants (pond = Ben's, gallery =
   *  Eli's). A fresh instance every swap: cheap at the dissolve trough,
   *  and Ben's pigment path re-reads the world on construction. */
  const mountField = (map: MapboxMap, beforeId?: string) => {
    try {
      // Self-healing: custom layers never appear in getStyle().layers, so
      // existence must be asked directly — a stale field is removed first.
      if (map.getLayer("emotion-field")) map.removeLayer("emotion-field");
      const lk = currentLook();
      const field = lk.engine === "pond" ? new FieldLayer() : new GalleryFieldLayer();
      if (field instanceof FieldLayer) {
        Object.assign(field.look, structuredClone(LOOKS[lk.pond ?? "still-water"]));
        field.paper = atmosphere.current.paper; // day must survive the swap
      }
      field.fade = fieldRef.current?.fade ?? 1;
      // The field sits under the falling weather (and deck's labels).
      map.addLayer(field, beforeId ?? (map.getLayer("precip") ? "precip" : undefined));
      fieldRef.current = field;
      dataVersion.current = -1; // tick re-feeds kernels next frame
    } catch (err) {
      console.error("warmth: field engine failed to start", err);
    }
  };
  /** The trough of the dissolve: re-stand the field — and, when the look
   *  crosses worlds (night ↔ paper), rebuild the base style live. */
  const applyLookSwap = (map: MapboxMap) => {
    const want = currentLook().world ?? "night";
    if (want !== worldFromUrl()) {
      setWorld(want);
      fieldRef.current = null; // the style swap drops the custom layers
      precipRef.current = null;
      labelCache.current = null;
      // diff:false forces a FULL style load — diffing can silently skip
      // the style.load event and strand the custom layers (review find).
      map.setStyle(
        buildStyle(want === "paper" ? PAPER : INK, want === "paper" ? "paper" : "ink-and-glow"),
        { diff: false } as Parameters<MapboxMap["setStyle"]>[1],
      );
      map.once("style.load", () => {
        mountField(map);
        try {
          if (!map.getLayer("precip")) {
            const p = new PrecipLayer();
            map.addLayer(p);
            precipRef.current = p;
          }
        } catch (err) {
          console.error("warmth: precip failed to restart", err);
        }
        applyAtmosphereInk(map, atmosphere.current);
      });
    } else {
      mountField(map); // self-removes the old engine, lands under precip
    }
  };
  // 0 = ink night, 1 = paper day (daylight mode) — refreshed on solar apply;
  // the field trades glow for pigment, labels trade white for graphite.
  const paperRef = useRef(0);
  // The public↔private crossfade lives OUTSIDE React: a target the prop
  // sets, a mix the rAF loop settles exponentially — no re-render, no jank.
  const initialMix = view === "private" ? 1 : 0;
  const viewTarget = useRef(initialMix);
  const viewMix = useRef(initialMix);
  // The clamp-on-arrival waiting for the flight home (public return) —
  // held so a view flip mid-flight can cancel it (design review).
  const pendingClamp = useRef<(() => void) | null>(null);
  useEffect(() => {
    viewTarget.current = view === "private" ? 1 : 0;
    // The journal is global — "everywhere in the world you've felt
    // something" — so the private view unlocks the NYC stage clamps;
    // returning to public restores them (and the camera drifts home if
    // it's out of bounds, handled by mapbox's own bounds enforcement).
    const map = mapRef.current?.getMap();
    if (map && loaded.current) {
      // Any pending clamp-on-arrival is void the moment the view changes —
      // a stale listener would re-clamp the unlocked world (design review).
      if (pendingClamp.current) {
        map.off("moveend", pendingClamp.current);
        pendingClamp.current = null;
      }
      if (view === "private") {
        // Runtime-documented: null clears the bounds. The Map overload's
        // types are stricter than the API (the Camera overload allows null).
        (map.setMaxBounds as unknown as (b: null) => void)(null);
        map.setMinZoom(1.5);
      } else {
        // Re-clamping while the camera is out in the world would TELEPORT
        // it home (rule: nothing pops) — glide back first, clamp on arrival.
        const isOutside = () => {
          const c = map.getCenter();
          const [[w, s], [e, n]] = CAMERA.maxBounds;
          return c.lng < w || c.lng > e || c.lat < s || c.lat > n || map.getZoom() < CAMERA.minZoom;
        };
        const flyHome = () =>
          map.flyTo({
            center: [CAMERA.initial.longitude, CAMERA.initial.latitude],
            zoom: CAMERA.initial.zoom,
            duration: 1600,
          });
        const clamp = () => {
          // A drag can interrupt the flight — moveend then fires with the
          // camera still over the ocean, and clamping would teleport it.
          // Re-fly instead; clamp only lands once we're truly home.
          if (isOutside()) {
            pendingClamp.current = clamp;
            map.once("moveend", clamp);
            flyHome();
            return;
          }
          pendingClamp.current = null;
          map.setMaxBounds(CAMERA.maxBounds);
          map.setMinZoom(CAMERA.minZoom);
        };
        if (isOutside()) {
          pendingClamp.current = clamp;
          map.once("moveend", clamp);
          flyHome();
        } else {
          clamp();
        }
      }
    }
  }, [view]);
  const onEntryTapRef = useRef(onEntryTap);
  useEffect(() => {
    onEntryTapRef.current = onEntryTap;
  }, [onEntryTap]);
  const onGapTapRef = useRef(onGapTap);
  useEffect(() => {
    onGapTapRef.current = onGapTap;
  }, [onGapTap]);

  // THE WORLD: chosen at load (?world=paper) — bone sheet or ink night.
  const style = useMemo(
    () =>
      worldFromUrl() === "paper"
        ? buildStyle(PAPER, "paper")
        : buildStyle(INK, "ink-and-glow"),
    [],
  );
  // DPR cap: 3× phones render near-identically at 2× on a dark map, for
  // 2.25× less fill — Ben's lag report, honored. Mapbox v3 sizes its canvas
  // through window.devicePixelRatio (its constructor option is vestigial),
  // so the cap is a scoped override BEFORE the map mounts. DOM stays crisp
  // (layout never reads this); only canvas sizing consumers do.
  useMemo(() => {
    if (typeof window !== "undefined" && window.devicePixelRatio > PERF.maxPixelRatio) {
      Object.defineProperty(window, "devicePixelRatio", {
        get: () => PERF.maxPixelRatio,
        configurable: true,
      });
    }
  }, []);

  useEffect(() => {
    void loadLabels().then((d) => {
      labelData.current = d;
      labelCache.current = null;
    });
  }, []);

  // The base ink follows the living atmosphere (sun + real weather). First
  // coat lands in onLoad; after that, re-apply on a slow cadence — the
  // atmosphere is already eased and paint rides its own transitions, so
  // nothing ever steps.
  useEffect(() => {
    const apply = () => {
      if (document.visibilityState !== "visible") return;
      const map = mapRef.current?.getMap();
      if (!map || !loaded.current) return;
      applyAtmosphereInk(map, atmosphere.current);
    };
    const iv = setInterval(apply, SOLAR.updateMs);
    document.addEventListener("visibilitychange", apply);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  // The heartbeat: advance the store; hand data + repaints to the field,
  // the trail, and the labels; settle the public↔private crossfade.
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    let lastFrame = 0;
    let lastRainPush = 0;
    let trailShown = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const map = mapRef.current?.getMap();
      // field may be null (compile failure degrades to a city without
      // weather) — the trail, labels, and repaints must keep breathing.
      const field = fieldRef.current;
      if (!map || !loaded.current) return;
      const now = performance.now();
      const dt = lastFrame ? Math.min(50, now - lastFrame) : 16;
      lastFrame = now;
      const arriving = momentsStore.tick(now);
      atmosphere.tick(now);
      const atmo = atmosphere.current;
      paperRef.current = atmo.paper;

      // Crossfade: exponential settle toward the view target, then snap.
      const target = viewTarget.current;
      const fading = viewMix.current !== target;
      if (fading) {
        viewMix.current += (target - viewMix.current) * (1 - Math.exp(-dt / CHOREO.viewFade.tauMs));
        if (Math.abs(viewMix.current - target) < 0.004) viewMix.current = target;
      }
      const trailOn = viewMix.current > 0.01;

      // Hand the atmosphere to the field — in-place mutation, no allocation.
      // CONSTITUTION RULE 2: only the WIND (the field's living flow) and the
      // base-response inputs (fog→streetlight, wet→glisten) cross over;
      // cloud/rain/snow never bend or dim the emotion itself.
      const rain = atmo.wetKind === "rain" ? atmo.wet : 0;
      const snow = atmo.wetKind === "snow" ? atmo.wet : 0;
      // The gallery dissolve: breathe down (180ms), swap at the trough
      // (engine, dials, and — if the look crosses — the whole world),
      // breathe back (220ms). ease = smoothstep on both slopes.
      let lookDim = 1;
      const swap = lookSwap.current;
      if (swap) {
        const tDown = (now - swap.start) / 180;
        if (tDown < 1) {
          lookDim = 1 - tDown;
        } else if (!swap.swapped) {
          swap.swapped = true;
          applyLookSwap(map);
          lookDim = 0;
        } else {
          const tUp = (now - swap.start - 180) / 220;
          lookDim = Math.min(1, tUp);
          if (tUp >= 1) lookSwap.current = null;
        }
        lookDim = lookDim * lookDim * (3 - 2 * lookDim);
      }
      if (field) {
        field.fade = (1 - viewMix.current) * lookDim;
        field.paper = atmo.paper;
        if (field instanceof FieldLayer) {
          // BEN'S ENGINE: pond presets in meters; wind nudges live.
          field.sunLight = atmo.light; // paper world: slate-hours pigment
          const base = LOOKS[currentLook().pond ?? "still-water"];
          const look = field.look;
          look.warpM = base.warpM + atmo.wind * WEATHER.windWarpM;
          look.drift = base.drift + atmo.wind * WEATHER.windDrift;
          look.streak = Math.min(1, base.streak + atmo.wind * WEATHER.windStreak);
          const w = field.weather;
          w.fog = atmo.fog;
          w.wet = rain;
          w.axisX = atmo.axisX;
          w.axisY = atmo.axisY;
        } else {
          // ELI'S ENGINE: the look's shape baseline + the wind's living
          // motion on top (galleryTune froze the old wind constants).
          const shape = currentLook().config.shape;
          const look = field.look;
          look.warpAmp = shape.warpAmp + atmo.wind * 0.02;
          look.scale = shape.scale;
          look.band = shape.band;
          look.drift = shape.drift + atmo.wind * WEATHER.windDrift;
          look.streak = Math.min(1, shape.streak + atmo.wind * WEATHER.windStreak);
          const w = field.weather;
          w.fog = atmo.fog;
          w.wet = rain;
          w.axisX = atmo.axisX;
          w.axisY = atmo.axisY;
        }
      }
      // …and to the falling weather (it rains on both views alike).
      const precip = precipRef.current;
      if (precip) {
        precip.wet = atmo.wet;
        precip.snow = snow > rain ? 1 : 0;
        precip.windX = atmo.axisX * atmo.wind;
        precip.paper = inkWeight(atmo); // graphite by day, pale on slate
      }

      // Rain patter follows the wet (snow is a hush — silent by design).
      if (now - lastRainPush > 800) {
        lastRainPush = now;
        setRainLevel(rain);
      }

      // Rest-throttle — bypassed while moving, blooming, crossfading, or
      // precipitating (falling drops need full rate; only while it rains).
      // THE PULSE OF ARRIVAL, ambient half: until realtime brings real
      // strangers, the seeded city re-pulses one point every so often —
      // a raindrop somewhere, the map visibly being felt in. Public only.
      if (field instanceof FieldLayer && now > nextPulse.current) {
        nextPulse.current =
          now + (FIELD.ripple.everyS[0] + Math.random() * (FIELD.ripple.everyS[1] - FIELD.ripple.everyS[0])) * 1000;
        if (viewMix.current < 0.5 && momentsStore.points.length > 0) {
          const pool = momentsStore.points.filter((p) => !p.wash);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          if (pick) field.addRippleLngLat(pick.position[0], pick.position[1], pick.emotion);
        }
      }
      const rippling = field instanceof FieldLayer ? field.ripplesActive : false;
      const precipitating = atmo.wet > 0.03;
      if (
        !map.isMoving() &&
        !arriving &&
        !fading &&
        !precipitating &&
        !rippling &&
        !lookSwap.current && // the gallery dissolve needs full rate
        now - lastPush < PERF.restFrameMs
      )
        return;
      lastPush = now;

      if (field && momentsStore.version !== dataVersion.current) {
        dataVersion.current = momentsStore.version;
        field.setData(momentsStore.points);
      }
      const zoom = map.getZoom();
      // Borough caps yield to feeling: pooled field weight near each anchor
      // dims its cap (rule: no label ever fights a feeling). Quantized to
      // eighths so the label cache only rebuilds on a real change.
      const bd = LABELS.boroughFieldDim;
      const boroughsGone = zoom > LABELS.boroughFadeOut.to + 0.1;
      const boroughDims = LABELS.boroughs.map((b) => {
        if (boroughsGone) return 1; // invisible caps never churn the cache
        let pooled = 0;
        for (const p of momentsStore.points) {
          if (p.seed) continue; // the ambient wash never dims a name
          const dx = p.position[0] - b.anchor[0];
          const dy = p.position[1] - b.anchor[1];
          if (dx * dx + dy * dy < bd.radiusDeg * bd.radiusDeg) pooled += p.weight;
        }
        const dim = 1 - bd.dimMax * (pooled / (pooled + bd.halfWeight));
        return Math.round(dim * 8) / 8;
      });
      const dimsKey = boroughDims.join(",");
      // Labels re-ink when the camera moves OR the paperness drifts (dawn,
      // dusk, a preview jump) — graphite on paper, whisper-white on ink.
      const labelsStale =
        !labelCache.current ||
        Math.abs(labelCache.current.zoom - zoom) > 0.02 ||
        Math.abs(labelCache.current.paper - inkWeight(atmo)) > 0.04 ||
        labelCache.current.dimsKey !== dimsKey;
      if (labelsStale) {
        labelCache.current = {
          zoom,
          paper: atmo.paper,
          dimsKey,
          layers: buildLabelLayers(labelData.current, zoom, inkWeight(atmo), boroughDims),
        };
      }
      // Trail dots breathe via a time uniform, so while visible they re-set
      // props every push (cheap: deck diffs, data identity is stable).
      if (labelsStale || trailOn || trailShown) {
        const trail = trailOn
          ? buildTrailLayers(
              momentsStore.ownPoints,
              momentsStore.ownVersion,
              now / 1000,
              zoom,
              viewMix.current,
              paperRef.current,
              (id) => onEntryTapRef.current?.(id),
              // Tap a constellation: descend toward its sparks.
              (lngLat) =>
                map.easeTo({ center: lngLat, zoom: Math.min(zoom + 2.4, 14), duration: 900 }),
              inkWeight(atmo), // threads + cues ink themselves by the ground
              (gapMs, x, y) => onGapTapRef.current?.(gapMs, x, y),
            )
          : [];
        // Trail first: labels stay readable above your dots.
        overlayRef.current?.setProps({ layers: [...trail, ...labelCache.current!.layers] });
        trailShown = trailOn;
      }
      map.triggerRepaint(); // the field accumulates + resolves this frame
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={CAMERA.initial}
        mapStyle={style}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        maxBounds={CAMERA.maxBounds}
        minZoom={CAMERA.minZoom}
        maxZoom={CAMERA.maxZoom}
        dragRotate={CAMERA.rotationEnabled}
        pitchWithRotate={false}
        touchPitch={false}
        fadeDuration={MOTION.fadeDurationMs}
        onLoad={(e) => {
          const map = e.target;
          // Motion is a choice, not a default: heavy-glass pan, anchored
          // zoom. Rotation is on (two fingers / right-drag); pitch stays off.
          map.dragPan.enable(MOTION.dragPan);
          map.scrollZoom.setWheelZoomRate(MOTION.wheelZoomRate);
          // THE FIELD — added after the base layers; deck pins its label
          // groups above it, so names stay readable over the light.
          // A shader-compile failure (seen once: driver returned a null
          // info log) must degrade to a city without weather — it must
          // never take the whole screen down (design-review finding).
          mountField(map);
          // Falling weather, above the field (still under the deck labels).
          try {
            const precip = new PrecipLayer();
            map.addLayer(precip);
            precipRef.current = precip;
          } catch (err) {
            console.error("warmth: precip layer failed to start", err);
          }
          // First coat of atmosphere ink (real sun + weather, or preview).
          atmosphere.tick(performance.now());
          applyAtmosphereInk(map, atmosphere.current);
          paperRef.current = atmosphere.current.paper;
          if (fieldRef.current) fieldRef.current.paper = paperRef.current;
          // A backgrounded phone can lose the GL context; mapbox restores
          // its own layers but never re-onAdds custom ones — without this
          // the field stays dead forever after restore (review finding).
          map.on("webglcontextrestored", () => {
            // Re-add in place (below the labels), not on top of the stack.
            mountField(map); // self-removes; the ACTIVE engine, whichever it is
            // The falling weather needs the same resurrection — re-added in
            // place, or it would land on top of the deck labels (review).
            try {
              const pLayers = map.getStyle()?.layers ?? [];
              const pAt = pLayers.findIndex((l) => l.id === "precip");
              const pBefore =
                pAt >= 0 && pAt + 1 < pLayers.length ? pLayers[pAt + 1].id : undefined;
              if (pAt >= 0) map.removeLayer("precip");
              const freshPrecip = new PrecipLayer();
              map.addLayer(freshPrecip, pBefore);
              precipRef.current = freshPrecip; // tick re-feeds it next frame
            } catch (err) {
              console.error("warmth: precip layer failed to restore", err);
            }
          });
          // The settled opening camera IS home (constraints already applied).
          const hc = map.getCenter();
          homeRef.current = { lng: hc.lng, lat: hc.lat, zoom: map.getZoom() };
          // Lab-only hook so the screenshot/perf harness can set exact cameras.
          (window as unknown as { __warmthMap?: typeof map }).__warmthMap = map;
          // Harness hook: the ink drop is testable without driving the orb.
          (window as unknown as { __warmthField?: FieldLayer | GalleryFieldLayer | null }).__warmthField =
            fieldRef.current;
          loaded.current = true;
          onMapReady?.(map);
        }}
        onMove={(e) => {
          const v = e.viewState;
          setRotated(Math.abs(v.bearing) > 0.5);
          // "Away" = meaningfully off the settled home shot — generous
          // thresholds so the chip never nags over a small nudge.
          const home = homeRef.current;
          setAway(
            Math.abs(v.zoom - home.zoom) > 0.6 ||
              Math.abs(v.longitude - home.lng) > 0.045 ||
              Math.abs(v.latitude - home.lat) > 0.035 ||
              Math.abs(v.bearing) > 0.5,
          );
        }}
      >
        <DeckOverlay
          onReady={(o) => {
            overlayRef.current = o;
          }}
        />
      </Map>

      {/* The bake-off look pill and the world pill are RETIRED (07-13):
          THE ONE GALLERY in OneScreen now lists every look from both
          trunks — Ben's four pond looks and the paper world included —
          and switches them live, no reload. */}

      {/* Return-to-north — appears only while rotated, like Apple Maps. */}
      <button
        type="button"
        aria-label="Point north"
        onClick={() => mapRef.current?.getMap().resetNorth({ duration: 700 })}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 20px)",
          right: 16,
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.55)",
          color: "rgba(233,236,244,0.6)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          zIndex: 10,
          opacity: rotated ? 1 : 0,
          pointerEvents: rotated ? "auto" : "none",
          transition: "opacity 300ms ease",
        }}
      >
        N
      </button>

      {/* Recenter — home view, one tap (Eli, 07-10). Appears only once
          you've wandered; sits below the north chip. */}
      <button
        type="button"
        aria-label="Return to the city view"
        title="Return to the city view"
        onClick={() => {
          const map = mapRef.current?.getMap();
          if (!map) return;
          map.flyTo({
            center: [CAMERA.initial.longitude, CAMERA.initial.latitude],
            zoom: CAMERA.initial.zoom,
            bearing: 0,
            duration: 1600,
            essential: true,
          });
          // Wherever the flight settles (bounds may clamp) becomes home.
          map.once("moveend", () => {
            const c = map.getCenter();
            homeRef.current = { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
            setAway(false);
          });
        }}
        style={{
          position: "absolute",
          top: "calc(max(env(safe-area-inset-top), 20px) + 44px)",
          right: 16,
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid rgba(233,236,244,0.14)",
          background: "rgba(10,11,15,0.55)",
          color: "rgba(233,236,244,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 10,
          opacity: away ? 1 : 0,
          pointerEvents: away ? "auto" : "none",
          transition: "opacity 300ms ease",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2 L19.6 20.4 L12 16.2 L4.4 20.4 Z" fill="currentColor" fillOpacity="0.85" />
        </svg>
      </button>
    </>
  );
}

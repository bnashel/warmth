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
import { CAMERA, CHOREO, INK, MOTION, PERF, SHAPES, SOLAR, WEATHER } from "./tune";
import { buildStyle } from "./styles";
import { applyAtmosphereInk } from "./solar";
import { FieldLayer } from "./FieldLayer";
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
}: {
  /** public = the field (everyone); private = your trail (dots, only you). */
  view?: "public" | "private";
  /** The composed screen needs the camera (glide-to-bloom). */
  onMapReady?: (map: MapboxMap) => void;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const fieldRef = useRef<FieldLayer | null>(null);
  const precipRef = useRef<PrecipLayer | null>(null);
  const labelData = useRef<Awaited<ReturnType<typeof loadLabels>>>([]);
  const labelCache = useRef<{
    zoom: number;
    paper: number;
    layers: ReturnType<typeof buildLabelLayers>;
  } | null>(null);
  const dataVersion = useRef(-1);
  const loaded = useRef(false);
  const [rotated, setRotated] = useState(false);
  // 0 = ink night, 1 = paper day (daylight mode) — refreshed on solar apply;
  // the field trades glow for pigment, labels trade white for graphite.
  const paperRef = useRef(0);
  // The public↔private crossfade lives OUTSIDE React: a target the prop
  // sets, a mix the rAF loop settles exponentially — no re-render, no jank.
  const initialMix = view === "private" ? 1 : 0;
  const viewTarget = useRef(initialMix);
  const viewMix = useRef(initialMix);
  useEffect(() => {
    viewTarget.current = view === "private" ? 1 : 0;
  }, [view]);

  const style = useMemo(() => buildStyle(INK, "ink-and-glow"), []);
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
      if (field) {
        field.fade = 1 - viewMix.current;
        field.paper = atmo.paper;
        const look = field.look;
        look.warpAmp = SHAPES.watercolor.warpAmp + atmo.wind * WEATHER.windWarp;
        look.drift = SHAPES.watercolor.drift + atmo.wind * WEATHER.windDrift;
        look.streak = atmo.wind * WEATHER.windStreak;
        const w = field.weather;
        w.fog = atmo.fog;
        w.wet = rain;
        w.axisX = atmo.axisX;
        w.axisY = atmo.axisY;
      }
      // …and to the falling weather (it rains on both views alike).
      const precip = precipRef.current;
      if (precip) {
        precip.wet = atmo.wet;
        precip.snow = snow > rain ? 1 : 0;
        precip.windX = atmo.axisX * atmo.wind;
        precip.paper = atmo.paper;
      }

      // Rain patter follows the wet (snow is a hush — silent by design).
      if (now - lastRainPush > 800) {
        lastRainPush = now;
        setRainLevel(rain);
      }

      // Rest-throttle — bypassed while moving, blooming, crossfading, or
      // precipitating (falling drops need full rate; only while it rains).
      const precipitating = atmo.wet > 0.03;
      if (!map.isMoving() && !arriving && !fading && !precipitating && now - lastPush < PERF.restFrameMs)
        return;
      lastPush = now;

      if (field && momentsStore.version !== dataVersion.current) {
        dataVersion.current = momentsStore.version;
        field.setData(momentsStore.points);
      }
      const zoom = map.getZoom();
      // Labels re-ink when the camera moves OR the paperness drifts (dawn,
      // dusk, a preview jump) — graphite on paper, whisper-white on ink.
      const labelsStale =
        !labelCache.current ||
        Math.abs(labelCache.current.zoom - zoom) > 0.02 ||
        Math.abs(labelCache.current.paper - atmo.paper) > 0.04;
      if (labelsStale) {
        labelCache.current = {
          zoom,
          paper: atmo.paper,
          layers: buildLabelLayers(labelData.current, zoom, atmo.paper),
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
          try {
            const field = new FieldLayer();
            field.look = { ...SHAPES.watercolor };
            map.addLayer(field);
            fieldRef.current = field;
          } catch (err) {
            console.error("warmth: field layer failed to start", err);
          }
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
            const layers = map.getStyle()?.layers ?? [];
            const at = layers.findIndex((l) => l.id === "emotion-field");
            const beforeId = at >= 0 && at + 1 < layers.length ? layers[at + 1].id : undefined;
            if (at >= 0) map.removeLayer("emotion-field");
            try {
              const fresh = new FieldLayer();
              fresh.fade = fieldRef.current?.fade ?? 1;
              fresh.look = { ...SHAPES.watercolor };
              fresh.paper = paperRef.current; // day must survive the restore too
              map.addLayer(fresh, beforeId);
              fieldRef.current = fresh;
              dataVersion.current = -1; // force the tick to re-feed the data
            } catch (err) {
              console.error("warmth: field layer failed to restore", err);
            }
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
          // Lab-only hook so the screenshot/perf harness can set exact cameras.
          (window as unknown as { __warmthMap?: typeof map }).__warmthMap = map;
          loaded.current = true;
          onMapReady?.(map);
        }}
        onMove={(e) => setRotated(Math.abs(e.viewState.bearing) > 0.5)}
      >
        <DeckOverlay
          onReady={(o) => {
            overlayRef.current = o;
          }}
        />
      </Map>

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
    </>
  );
}

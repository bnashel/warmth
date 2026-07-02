"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore } from "@/lib/momentsStore";
import { CAMERA, CHOREO, INK, MOTION, PERF, SOLAR } from "./tune";
import { buildStyle } from "./styles";
import { applySolarInk } from "./solar";
import { FieldLayer } from "./FieldLayer";
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
  const labelData = useRef<Awaited<ReturnType<typeof loadLabels>>>([]);
  const labelCache = useRef<{ zoom: number; layers: ReturnType<typeof buildLabelLayers> } | null>(
    null,
  );
  const dataVersion = useRef(-1);
  const loaded = useRef(false);
  const [rotated, setRotated] = useState(false);
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

  // Solar drift: the ink follows the real sun. First coat lands in onLoad;
  // after that, re-check once a minute and whenever the tab comes back —
  // paint changes ride their own slow transitions, so nothing ever steps.
  useEffect(() => {
    const apply = () => {
      if (document.visibilityState !== "visible") return;
      const map = mapRef.current?.getMap();
      if (map && loaded.current) applySolarInk(map);
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
    let trailShown = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const map = mapRef.current?.getMap();
      const field = fieldRef.current;
      if (!map || !field || !loaded.current) return;
      const now = performance.now();
      const dt = lastFrame ? Math.min(50, now - lastFrame) : 16;
      lastFrame = now;
      const arriving = momentsStore.tick(now);

      // Crossfade: exponential settle toward the view target, then snap.
      const target = viewTarget.current;
      const fading = viewMix.current !== target;
      if (fading) {
        viewMix.current += (target - viewMix.current) * (1 - Math.exp(-dt / CHOREO.viewFade.tauMs));
        if (Math.abs(viewMix.current - target) < 0.004) viewMix.current = target;
      }
      field.fade = 1 - viewMix.current;
      const trailOn = viewMix.current > 0.01;

      // Rest-throttle — bypassed while moving, blooming, or crossfading.
      if (!map.isMoving() && !arriving && !fading && now - lastPush < PERF.restFrameMs) return;
      lastPush = now;

      if (momentsStore.version !== dataVersion.current) {
        dataVersion.current = momentsStore.version;
        field.setData(momentsStore.points);
      }
      const zoom = map.getZoom();
      const labelsStale =
        !labelCache.current || Math.abs(labelCache.current.zoom - zoom) > 0.02;
      if (labelsStale) {
        labelCache.current = { zoom, layers: buildLabelLayers(labelData.current, zoom) };
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
          const field = new FieldLayer();
          map.addLayer(field);
          fieldRef.current = field;
          // First coat of solar ink (real sun, or ?solarHour= lab preview).
          applySolarInk(map);
          // A backgrounded phone can lose the GL context; mapbox restores
          // its own layers but never re-onAdds custom ones — without this
          // the field stays dead forever after restore (review finding).
          map.on("webglcontextrestored", () => {
            // Re-add in place (below the labels), not on top of the stack.
            const layers = map.getStyle()?.layers ?? [];
            const at = layers.findIndex((l) => l.id === "emotion-field");
            const beforeId = at >= 0 && at + 1 < layers.length ? layers[at + 1].id : undefined;
            if (at >= 0) map.removeLayer("emotion-field");
            const fresh = new FieldLayer();
            fresh.fade = fieldRef.current?.fade ?? 1;
            map.addLayer(fresh, beforeId);
            fieldRef.current = fresh;
            dataVersion.current = -1; // force the tick to re-feed the data
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

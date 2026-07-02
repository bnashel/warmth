"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/map";
import { momentsStore } from "@/lib/momentsStore";
import { CAMERA, GLOW, INK, MOTION } from "./tune";
import { buildStyle } from "./styles";
import { buildGlowLayers } from "./glow";
import { buildLabelLayers, loadLabels } from "./neighborhoods";
import type { Map as MapboxMap } from "mapbox-gl";

/** deck.gl overlay INTERLEAVED into the map's own canvas — one GL context,
 *  one render pass, and the streetlight blend can read the base map. */
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
 * The stage: one full-screen map, hand-authored style, light + labels
 * interleaved. A single rAF loop drives the glow's breathing — full rate
 * while the camera moves, half rate at rest (phones stay cool). Labels are
 * rebuilt only when zoom actually changes; the glow layer updates are pure
 * uniform writes. Zero React re-renders while panning/zooming.
 */
export default function MapStage({
  onMapReady,
}: {
  /** The composed screen needs the camera (glide-to-bloom). */
  onMapReady?: (map: MapboxMap) => void;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const labelData = useRef<Awaited<ReturnType<typeof loadLabels>>>([]);
  const labelCache = useRef<{ zoom: number; layers: ReturnType<typeof buildLabelLayers> } | null>(
    null,
  );
  const loaded = useRef(false);
  const epoch = useRef(0); // pulse clock origin — survives candidate switches
  const [rotated, setRotated] = useState(false);

  const style = useMemo(() => buildStyle(INK, "ink-and-glow"), []);

  useEffect(() => {
    void loadLabels().then((d) => {
      labelData.current = d;
      labelCache.current = null;
    });
  }, []);

  // The heartbeat. Everything the overlay shows is composed here.
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    const periodSec = GLOW.pulse.periodMs / 1000;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const overlay = overlayRef.current;
      const map = mapRef.current?.getMap();
      if (!overlay || !map || !loaded.current) return;
      const now = performance.now();
      // Advance arrivals + recency fade; blooming moments demand full rate.
      const arriving = momentsStore.tick(now);
      // At rest only the breath animates — ~22fps is invisible for a 2.5s
      // pulse and keeps phones cool. Motion and blooms get every frame.
      if (!map.isMoving() && !arriving && now - lastPush < 45) return;
      lastPush = now;
      if (epoch.current === 0) epoch.current = now;
      const zoom = map.getZoom();
      if (!labelCache.current || Math.abs(labelCache.current.zoom - zoom) > 0.02) {
        labelCache.current = { zoom, layers: buildLabelLayers(labelData.current, zoom) };
      }
      // Wrapping at the pulse period keeps the f32 uniform precise forever.
      const timeSec = ((now - epoch.current) / 1000) % periodSec;
      overlay.setProps({
        layers: [
          ...buildGlowLayers(
            momentsStore.points,
            momentsStore.version,
            timeSec,
            zoom,
            true,
          ),
          ...labelCache.current.layers,
        ],
      });
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

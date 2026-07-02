"use client";

import { useEffect, useMemo, useRef } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/map";
import { CAMERA, CANDIDATES, MOTION, type CandidateId } from "./tune";
import { buildStyle } from "./styles";
import { buildFakeGlowLayers } from "./fakeGlow";
import { buildLabelLayers, loadLabels } from "./neighborhoods";

/** deck.gl overlay as a Mapbox control; layers are pushed imperatively. */
function DeckOverlay({ onReady }: { onReady: (o: MapboxOverlay) => void }) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved: false }));
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
 * The stage: one full-screen map, hand-authored style, glow + labels above.
 * Motion is tuned on load (inertia, zoom rate, rotation off) — the Apple Maps
 * half of the bar. Label opacities are recomputed per movement frame straight
 * into overlay.setProps — zero React re-renders while panning/zooming.
 */
export default function MapStage({ candidate }: { candidate: CandidateId }) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const glowLayers = useMemo(() => buildFakeGlowLayers(), []);
  const labelData = useRef<Awaited<ReturnType<typeof loadLabels>>>([]);
  const rafPending = useRef(false);

  const style = useMemo(
    () => buildStyle(CANDIDATES[candidate].palette, CANDIDATES[candidate].name),
    [candidate],
  );

  // Push glow + zoom-correct labels into the overlay (rAF-coalesced).
  const syncOverlay = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const overlay = overlayRef.current;
      const map = mapRef.current;
      if (!overlay || !map) return;
      overlay.setProps({
        layers: [...glowLayers, ...buildLabelLayers(labelData.current, map.getZoom())],
      });
    });
  };

  useEffect(() => {
    void loadLabels().then((d) => {
      labelData.current = d;
      syncOverlay();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
        // Motion is a choice, not a default: heavy-glass pan, anchored zoom,
        // and a strictly north-up flat canvas.
        map.touchZoomRotate.disableRotation();
        map.dragPan.enable(MOTION.dragPan);
        map.scrollZoom.setWheelZoomRate(MOTION.wheelZoomRate);
        syncOverlay();
      }}
      onMove={syncOverlay}
    >
      <DeckOverlay
        onReady={(o) => {
          overlayRef.current = o;
          syncOverlay();
        }}
      />
    </Map>
  );
}

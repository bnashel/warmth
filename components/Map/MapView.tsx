"use client";

import { motion } from "framer-motion";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { INITIAL_VIEW_STATE, MAPBOX_TOKEN, MAP_STYLE } from "@/lib/map";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import type { MomentEntry } from "@/components/Slider/MomentSlider";

interface MapViewProps {
  moments: MomentEntry[];
}

function emotionColor(emotion: Emotion) {
  return EMOTION_HUES[emotion];
}

export function MapView({ moments }: MapViewProps) {
  if (!MAPBOX_TOKEN) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_55%)]">
        <div className="max-w-md rounded-3xl border border-white/10 bg-black/50 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">
            Mapbox ready
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Add your token to see the live map
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-white/10">
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        {moments
          .filter((moment) => moment.location)
          .map((moment) => {
            const size = 10 + (moment.intensity / 100) * 24;
            const color = emotionColor(moment.emotion);

            return (
              <Marker
                key={moment.id}
                longitude={moment.location!.longitude}
                latitude={moment.location!.latitude}
                anchor="center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, repeatType: "mirror" }}
                  className="rounded-full border border-white/30 shadow-[0_0_24px_rgba(255,255,255,0.2)]"
                  style={{
                    width: size,
                    height: size,
                    background: color,
                    boxShadow: `0 0 28px ${color}`,
                  }}
                />
              </Marker>
            );
          })}
      </Map>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
        <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/70 backdrop-blur">
          {moments.length > 0 ? `${moments.length} moments glowing on the map` : "Your tagged moments will appear here"}
        </div>
      </div>
    </div>
  );
}

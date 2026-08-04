/**
 * lib/publicField.ts — the public field, read from the database.
 *
 * Everything here is already COARSENED by the server (a ~330 m privacy grid):
 * no raw coordinate, no id, no user ever reaches the client (CLAUDE.md:
 * never expose raw individual locations). The initial snapshot comes from the
 * public_field_recent() RPC; the live path is subscribePublicField (below),
 * attached by OneScreen once a session exists. No client, or an empty DB,
 * yields [] — the caller falls back to the ambient seed city.
 */
import { supabase } from "@/lib/supabase";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";

/** One coarsened field cell (a grid square's worth of feeling). */
export type PublicCell = {
  cellId: string;
  lng: number; // cell CENTRE — never a real drop point
  lat: number;
  emotion: Emotion;
  n: number; // how many feelings pooled here (density)
  avgIntensity: number;
  bucket: number; // epoch ms, 15-min quantized
  eid?: string; // present on LIVE cells (one arrival) — a unique bloom id
};

function isEmotion(v: unknown): v is Emotion {
  return typeof v === "string" && Object.hasOwn(EMOTION_HUES, v);
}

// The privacy grid — MUST match the SQL (public_field_recent + the broadcast
// trigger): ~0.004° lng × 0.003° lat. A cell key is the floored grid index
// plus emotion; the same key results from an exact drop point OR its cell
// centre, so it is the join between "what I committed" and "the echo of it".
const GRID_LNG = 0.004;
const GRID_LAT = 0.003;
export function publicCellKey(lng: number, lat: number, emotion: string): string {
  return `${Math.floor(lng / GRID_LNG)}:${Math.floor(lat / GRID_LAT)}:${emotion}`;
}

// My own commit already renders locally at its exact spot; when its coarsened
// echo returns over realtime, skip it (once) so the light doesn't double.
const selfCells = new Map<string, number>();
const SELF_TTL_MS = 8000;
export function markSelfCommit(lng: number, lat: number, emotion: string): void {
  selfCells.set(publicCellKey(lng, lat, emotion), Date.now() + SELF_TTL_MS);
}
function consumeSelf(key: string): boolean {
  const exp = selfCells.get(key);
  if (exp === undefined) return false;
  selfCells.delete(key); // consume: skip exactly one echo (mine), not strangers'
  return Date.now() <= exp;
}

type FieldRow = {
  cell_id: string;
  lng: number;
  lat: number;
  emotion: string;
  n: number;
  avg_intensity: number;
  bucket: string;
};

/** The last 24h of public feeling, as coarsened cells. */
export async function fetchPublicField(): Promise<PublicCell[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("public_field_recent");
  if (error || !data) {
    if (error && process.env.NODE_ENV !== "production") {
      console.warn(`warmth publicField: fetch failed — ${error.message}`);
    }
    return [];
  }
  return (data as FieldRow[])
    .filter((r) => isEmotion(r.emotion) && Number.isFinite(r.lng) && Number.isFinite(r.lat))
    .map((r) => ({
      cellId: r.cell_id,
      lng: r.lng,
      lat: r.lat,
      emotion: r.emotion as Emotion,
      n: Math.max(1, Math.round(r.n)),
      avgIntensity: Math.min(10, Math.max(1, r.avg_intensity)),
      bucket: new Date(r.bucket).getTime(),
    }));
}

type LivePayload = {
  eid?: string;
  cell_id?: string;
  lng?: number;
  lat?: number;
  emotion?: string;
  intensity?: number;
  bucket?: string;
};

function toLiveCell(p: LivePayload): PublicCell | null {
  if (!isEmotion(p.emotion) || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return null;
  // Re-snap to the grid before anything renders. The DB already sends cell
  // centres, so this is a no-op for legitimate payloads — but it means the
  // map can NEVER paint a raw coordinate, even if something upstream one day
  // gained the ability to publish onto this topic. Cheap belt to the DB's
  // braces (CLAUDE.md: never expose raw individual locations).
  const lng = Math.floor((p.lng as number) / GRID_LNG) * GRID_LNG + GRID_LNG / 2;
  const lat = Math.floor((p.lat as number) / GRID_LAT) * GRID_LAT + GRID_LAT / 2;
  return {
    cellId: p.cell_id ?? "live",
    lng,
    lat,
    emotion: p.emotion,
    n: 1,
    avgIntensity: Math.min(10, Math.max(1, p.intensity ?? 5)),
    bucket: p.bucket ? new Date(p.bucket).getTime() : Date.now(),
    eid: p.eid,
  };
}

/**
 * The LIVE public field: others' feelings arrive as coarsened blooms over a
 * private Realtime broadcast (authed-only; the DB emits only the cell centre,
 * never a raw coord). Events are coalesced to at most one store flush per
 * animation frame so a burst can't cost frames, and my own echoes are
 * skipped. Returns an unsubscribe; a no-op without a client.
 */
// Joining "public_field" while a previous instance of the SAME topic is
// still leaving hands back the leaving channel: .subscribe() no-ops, the
// pending leave then closes it, and the field goes silent forever with no
// error. React runs cleanup before the next setup in one commit, so an
// account switch (or a Fast Refresh save) hits this every time. Chaining
// each join behind the previous removal makes that impossible.
let lastRemoval: Promise<unknown> = Promise.resolve();

export function subscribePublicField(onCell: (c: PublicCell) => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const buffer: PublicCell[] = [];
  let raf = 0;
  const flush = () => {
    raf = 0;
    const batch = buffer.splice(0);
    for (const c of batch) onCell(c);
  };
  let disposed = false;
  let channel: ReturnType<typeof client.channel> | null = null;
  void lastRemoval.then(() => {
    if (disposed) return;
    channel = client
      .channel("public_field", { config: { private: true } })
      .on("broadcast", { event: "moment" }, (msg: { payload?: LivePayload }) => {
        const c = toLiveCell(msg.payload ?? {});
        if (!c) return;
        if (consumeSelf(publicCellKey(c.lng, c.lat, c.emotion))) return;
        buffer.push(c);
        if (!raf) raf = requestAnimationFrame(flush);
      })
      .subscribe();
  });
  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (channel) lastRemoval = client.removeChannel(channel).catch(() => {});
  };
}

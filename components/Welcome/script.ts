/**
 * THE SCRIPT — one story, told twice. Both walkthrough versions (the slides
 * and the film) read these same five steps: same copy, same order, same
 * ending. Only the staging differs, and that lives in each shell.
 *
 * Voice rules: lowercase, short, whisper-quiet. Wherever the product already
 * says something ("the whole city, feeling together", "only you can see
 * this", "hold the orb to leave your first feeling") the welcome teaches the
 * exact same words — never a paraphrase the user won't meet again.
 */

export type WelcomeVersion = "slides" | "film";

/**
 * THE BAKE-OFF SWITCH. While null, no version auto-plays for real users —
 * both are judged behind ?welcome=slides / ?welcome=film on dev builds and
 * judging previews. When Ben picks the winner, its key lands here and the
 * welcome plays on every first visit (skippable, replayable); the loser is
 * deleted (the ember-vs-splat rule).
 */
export const WELCOME_DEFAULT: WelcomeVersion | null = null;

export type WelcomeStep = {
  id: "welcome" | "public" | "private" | "orb" | "yours";
  /** The wordmark step carries a title; the rest speak in lines. */
  title?: string;
  lines: string[];
  /** The axes tag — Ben's motif, growing one axis at a time. */
  tag?: string;
  /** Show the five feelings by name, each glowing its own hue — the
   *  vocabulary is taught in a calm reading moment, not mid-gesture. */
  legend?: boolean;
  /** A version-specific whisper under the lines (e.g. the film's honesty
   *  note when it shows the glimpse journal). */
  note?: Partial<Record<WelcomeVersion, string>>;
  /** The final step: chrome recedes, the real orb takes over, and the
   *  first real feeling completes the welcome. */
  handoff?: boolean;
};

export const WELCOME_STEPS: WelcomeStep[] = [
  {
    id: "welcome",
    title: "warmth",
    lines: ["a living map of how the city feels"],
  },
  {
    id: "public",
    lines: ["every light is someone, feeling something — right now"],
    tag: "where × what",
    legend: true,
    // the public view's own caption, verbatim — met again in the HUD
    note: { slides: "the whole city, feeling together", film: "the whole city, feeling together" },
  },
  {
    id: "private",
    lines: ["you keep a second map — only you can see this"],
    tag: "where × what × when",
    note: { film: "a glimpse — yours begins tonight" },
  },
  {
    id: "orb",
    // The ghost narrates its own phases (GHOST_CAPTIONS) — these lines are
    // only the fallback before the first gesture begins.
    lines: ["press and hold — slide to a feeling, then how strong"],
  },
  {
    id: "yours",
    lines: ["hold the orb to leave your first feeling"],
    handoff: true,
  },
];

/** Captions the orb step swaps through as the ghost hand moves. */
export const GHOST_CAPTIONS = {
  press: "press and hold",
  wheel: "five feelings fan out — slide to one",
  bar: "hold it — then how strong?",
  burst: "stronger burns brighter",
} as const;

export type GhostPhase = keyof typeof GHOST_CAPTIONS;

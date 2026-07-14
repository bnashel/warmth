/**
 * lib/copy.ts — the app's voice, in one place (Eli+Ben approved, 07-14).
 *
 * Every future tone pass edits HERE, not component by component. Only the
 * strings Eli approved changing moved in so far; the rest keep their
 * original wording where they live (approved as-is in the 07-14 review).
 */
export const COPY = {
  /** The two ways of seeing. Keys stay public/private in code — only the
   *  words on the pill changed (approved: warmer than dashboard-speak). */
  viewPublic: "everyone",
  viewPublicCaption: "how the city feels, together",
  viewPrivate: "just me",
  viewPrivateCaption: "only you can see this",
} as const;

# screenshots

Design history — the frames that decided things. These sat loose in the repo
root (77 files, 16 MB) until 2026-08-08; moved here with `git mv`, so every
filename and its history are intact.

Nothing references these paths in code or docs — they are a record, not
assets. **Real app assets live in `public/`** and were not touched.

| folder | what it holds |
|---|---|
| `looks/` | the world/look explorations — `woven`, `felt`, `air`, `garden`, `aurora`, `thread`, `germ`, `dir` (direction comparisons), `gallery`. Names line up with the catalogue in [worlds.md](../worlds.md). |
| `zoom-radius/` | glow radius and zoom behaviour: `medzoom`, `zoomfix`, `radius`, `r8`. Mostly before/after pairs at named zoom levels. |
| `map-audit/` | the city rendering audit against real landmarks — `audit`, `fix`, `check` (Central Park, Holland, Lincoln, Queensboro, Prospect, East Queens). |
| `ui-passes/` | screen and interaction passes: `final` (before/after sets), `wow`, `interaction`, `journal`, `card`, `private`, `joy`. |

Grouping is by prefix, sorted into themes — a folder per prefix would have
meant 24 folders, many holding one file. If something looks miscategorised,
the filename is unchanged: `git log --follow docs/screenshots/*/<name>` finds
its whole story.

# Vietnamese learning (new tool)

Planning document for the [Vietnamese learning](tools/vietnamese-learning.html) page. Implementation uses Omniglot-hosted audio (hotlink); see [docs/js/vietnamese-learning.js](js/vietnamese-learning.js) for switching to local MP3s.

## Naming and files

Use **vietnamese-learning** consistently (not “diary”):

| Artifact                               | Path                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Tool page                              | [docs/tools/vietnamese-learning.html](tools/vietnamese-learning.html)     |
| Script                                 | [docs/js/vietnamese-learning.js](js/vietnamese-learning.js)               |
| Planning doc (committed when building) | [docs/vietnamese-learning-plan.md](vietnamese-learning-plan.md)           |

Page title / copy should describe a **personal Vietnamese learning** page (words and pronunciation you are studying), not a “diary” product name.

## Repo structure (relevant parts)

| Piece                              | Role                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/index.html](index.html)      | Landing page; lists webtools with links                                                                                                        |
| [docs/tools/*.html](tools/)        | One HTML file per tool                                                                                                                         |
| [docs/js/*.js](js/)                | Vanilla JS, loaded with `<script src="...">`                                                                                                   |
| [README.md](../README.md)          | Short list of tools (mirrors index)                                                                                                            |

Pattern for tools: `← Back` to `../index.html`, Simple.css CDN, page-local `<style>` for layout, script at bottom of body.

## Chosen approach: Omniglot hotlink (primary)

**v1 ships with in-page playback using absolute Omniglot MP3 URLs**—no audio binaries in the repository.

- Rationale: avoids committing third-party recordings; matches the goal of click-to-play without opening a new tab.
- Each entry uses a full URL such as `https://www.omniglot.com/soundfiles/vietnamese/numbers/one_vietnamese.mp3` … `ten_vietnamese.mp3`.
- **Attribution** on the page: credit [Omniglot — Vietnamese numbers](https://www.omniglot.com/language/numbers/vietnamese.htm) and Greg Vanderford (recordings), per their page.

### Implementation notes (hotlink)

- Use `<button type="button">` (or equivalent) for clickable words—**not** `<a href="…mp3">`, which navigates away.
- One shared `<audio>` or reusable `Audio` instance; `play()` on click; optional single-active-clip behavior (pause before new `src`).
- Handle `error` / rejected `play()` if Omniglot is unreachable or URLs change.

### Future: committed local MP3s (documented, not default for v1)

When you own or may redistribute audio, you can **stop hotlinking** and serve files from the repo:

1. **Layout:** e.g. `docs/assets/audio/vietnamese/one.mp3` … `ten.mp3` (names are yours; keep them stable).
2. **JS:** In [docs/js/vietnamese-learning.js](js/vietnamese-learning.js), keep a single **base URL or path** constant, e.g. `AUDIO_BASE = 'https://www.omniglot.com/...'` vs `AUDIO_BASE = '../assets/audio/vietnamese/'`, and build each entry’s `src` as `AUDIO_BASE + filename`. Comments in the file should explain switching the constant (and filenames) when moving to local files.
3. **HTML:** No change required beyond ensuring script paths stay correct.
4. **Licensing:** Only commit clips you recorded or have rights to publish.

No separate `add-assets` task for v1 unless you later add a folder and flip the constant.

## Feasibility

**Very feasible** on static GitHub Pages: HTML/CSS/JS only; no build step.

- **In-page playback:** `<audio>` or `new Audio(url)` + `play()` on click.
- **Avoid new tabs:** do not use raw links to MP3 for the primary interaction; use buttons + JS.

Optional later: `entries` as JSON + render from JS as the word list grows.

## Tech stack

- **Existing:** static HTML, Simple.css, vanilla JavaScript.
- **v1 audio:** remote HTTPS URLs only (Omniglot).
- **Later:** optional `docs/assets/audio/vietnamese/` for local MP3s.

## Materials

| Material            | v1 (hotlink)                                      | Later (local MP3s)                           |
| ------------------- | ------------------------------------------------- | -------------------------------------------- |
| Audio files in repo | **No**                                            | **Yes** — one file per word, MP3 recommended |
| Text / numerals     | Yes — Vietnamese + digit 1–10                     | Same                                         |
| Attribution         | Yes — Omniglot / Greg Vanderford for remote audio | Update copy if clips are fully yours         |

## Omniglot URL pattern

- Base: `https://www.omniglot.com/soundfiles/vietnamese/numbers/`
- Filenames for 1–10: `one_vietnamese.mp3` … `ten_vietnamese.mp3` (same pattern as Omniglot’s HTML table).

**Note:** Bulk-downloading Omniglot MP3s into the repo without permission remains **out of scope** for v1; the committed plan + JS comments describe replacing hotlinks with your own files when ready.

### How hotlink playback works (summary)

The browser fetches bytes from Omniglot at play time; your repo stores only HTML/JS.

## Implementation outline

1. **Save plan:** Add [docs/vietnamese-learning-plan.md](vietnamese-learning-plan.md) with this planning content.
2. Add [docs/tools/vietnamese-learning.html](tools/vietnamese-learning.html): back link, title, intro, table for 1–10, `<script src="../js/vietnamese-learning.js">`.
3. Add [docs/js/vietnamese-learning.js](js/vietnamese-learning.js): data array with Omniglot URLs; render or bind rows; button click → play; comments describing `AUDIO_BASE` / relative paths for swapping to `docs/assets/audio/...` later.
4. Update [docs/index.html](index.html) and [README.md](../README.md) with link and short description (“Vietnamese learning” / pronunciation helper).

## Accessibility / UX

- `<button type="button">` for playable words; `aria-label` if helpful.
- Focus visible; handle play errors with a small inline message.

No database, no API keys, no new npm dependencies.

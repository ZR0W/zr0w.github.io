# Add Webtool — Examples

## Example 1: Minimal scaffold request

**User prompt:**

> Add a new webtool: **dice roller**. Roll 1–6 dice, show individual and total values. Use add-webtool conventions.

**Agent actions:**

| File | Action |
|------|--------|
| `docs/tools/dice-roller.html` | Create from skeleton |
| `docs/js/dice-roller.js` | Create IIFE with roll logic |
| `docs/index.html` | Add list item |

**Index entry:**

```html
<li><a href="tools/dice-roller.html">Dice roller</a> – Roll 1–6 dice; shows each die and the total.</li>
```

---

## Example 2: Match an existing tool's style

**User prompt:**

> New tool: **hex to rgb converter** — input hex, show rgb and a preview swatch. Match styling of color-palette.

**Agent actions:**

1. Read `docs/tools/color-palette.html` for control panel and swatch patterns
2. Reuse similar `.controls` / grid styling in the new HTML `<style>` block
3. Follow the same IIFE and DOM patterns as `docs/js/color-palette.js`

---

## Example 3: Canvas-heavy tool

**User prompt:**

> Scaffold **pixel-editor** — canvas drawing, color picker, clear button. Like pattern-generator but single canvas, no quadrants.

**Agent actions:**

1. Read `docs/tools/pattern-generator.html` for canvas toolbar layout
2. Create simplified markup (single canvas, fewer controls)
3. Use canvas API in JS; no external libraries unless user specifies a CDN

---

## Reference: existing tools

| Slug | Complexity | Good reference for |
|------|------------|-------------------|
| `color-palette` | Low | Controls panel, grid layout, copy interactions |
| `poker-probability` | Medium | Dynamic DOM, state + undo, tables |
| `pattern-generator` | High | Canvas, toolbar, export |
| `vietnamese-learning` | Medium | External CDN audio, content-driven UI |

---

## Index blurb patterns (from `docs/index.html`)

- **Action-first:** "Click card values to mark as drawn; table shows P(next card)."
- **Feature list:** "Generate palettes, keep favorite colors, re-gen or override individually."
- **Capability summary:** "Draw in four quadrants, shuffle for tiling, view infinite pannable pattern; export PNG, undo/redo, toggle guides."

Keep blurbs to one sentence; use semicolons to separate related features.

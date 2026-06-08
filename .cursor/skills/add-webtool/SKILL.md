---
name: add-webtool
description: >-
  Scaffold a new browser tool subpage for zr0w.github.io. Creates
  docs/tools/<name>.html, docs/js/<name>.js, and updates docs/index.html.
  Use when adding a new tool, webtool, subpage, or page under docs/tools/,
  or when the user asks to scaffold or wire up a new Webtools entry.
---

# Add Webtool

## Constraints

- Vanilla HTML, CSS, and JavaScript only — no framework, no build step, no npm
- Each tool is self-contained: one HTML in `docs/tools/` + matching JS in `docs/js/`
- Base styles: [Simple.css](https://cdn.simplecss.org/) CDN; tool-specific styles in a `<style>` block in the HTML
- Dependencies: none or CDN-only
- Do not commit unless the user explicitly asks

## Before starting

1. Read one existing tool for structure — `docs/tools/color-palette.html` is the simplest reference; use `docs/tools/pattern-generator.html` for canvas-heavy tools
2. Confirm the kebab-case slug `<name>` (used consistently as the filename stem)
3. Gather from the user: display title, one-line index blurb, and functional requirements

## Workflow

### 1. Create `docs/tools/<name>.html`

Use this skeleton (replace placeholders):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><Display title> – Webtools</title>
    <link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css">
    <style>
        a.back { margin-bottom: 1rem; display: inline-block; }
        /* tool-specific styles */
    </style>
</head>
<body>
    <a class="back" href="../index.html">← Back</a>
    <h1><Display title></h1>
    <p><Short description of what the tool does.></p>

    <!-- markup for controls and output -->

    <script src="../js/<name>.js"></script>
</body>
</html>
```

Required elements every tool page must have:
- Title format: `<Display title> – Webtools`
- Simple.css CDN link
- Back link: `<a class="back" href="../index.html">← Back</a>`
- Script tag: `<script src="../js/<name>.js"></script>` (matching slug)

### 2. Create `docs/js/<name>.js`

Use this skeleton:

```javascript
(function () {
  'use strict';

  // state, helpers, DOM wiring

  function init() {
    // bind events, initial render
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Match conventions from sibling tools:
- IIFE wrapper with `'use strict'`
- `var` for top-level bindings (consistent with existing tools)
- DOM-ready guard before `init()`
- Wire UI via `getElementById` / event listeners — no modules, no imports

### 3. Update `docs/index.html`

Add a list item under the `<h2>Webtools</h2>` `<ul>`, keeping alphabetical or logical order with siblings:

```html
<li><a href="tools/<name>.html"><Display title></a> – <One-line blurb for the index page.></li>
```

Blurb style: short, describes interaction (see existing entries in `docs/index.html`).

### 4. Verify

- Relative paths resolve: `../index.html`, `../js/<name>.js`
- HTML slug matches JS filename matches index `href`
- No npm, bundler, or local package references added
- Tool works when opened directly from `docs/tools/<name>.html`

## Checklist

Copy and track:

```
- [ ] docs/tools/<name>.html created
- [ ] docs/js/<name>.js created
- [ ] docs/index.html list item added
- [ ] Title, back link, and script paths correct
- [ ] No build toolchain or npm dependencies introduced
```

## Styling notes

- Always include `a.back { margin-bottom: 1rem; display: inline-block; }`
- Controls panels often use: `padding: 1rem; background: #f5f5f5; border-radius: 6px;`
- Buttons: `border-radius: 6px; cursor: pointer;`
- Prefer semantic HTML; add `aria-label` when interactive regions lack visible labels

## Optional assets

Static images go in `docs/assets/images/`. Reference from tool HTML as `../assets/images/<file>`.

Planning or content notes may go in `docs/<name>-plan.md` (see `vietnamese-learning-plan.md`) — only when the user requests it.

## Additional resources

- Concrete before/after examples: [examples.md](examples.md)

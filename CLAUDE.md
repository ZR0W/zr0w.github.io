# zr0w.github.io — Claude context

## Project overview

Personal GitHub Pages site — a collection of standalone browser-based webtools. No framework, no build step, no package manager. Pure vanilla HTML, CSS, and JavaScript served directly from the `docs/` folder.

## Repo layout

```
docs/
  index.html             # landing page listing all tools
  assets/
    images/              # static images (e.g. mascot)
  tools/
    poker-probability.html      # card probability calculator
    color-palette.html          # random palette generator
    pattern-generator.html      # seamless quadrant pattern tool
    vietnamese-learning.html    # numbers 1–10 + audio
  js/
    poker-probability.js
    color-palette.js
    pattern-generator.js
  vietnamese-learning-plan.md  # content/planning notes for the learning tool
  blog/
    index.html             # blog listing page
    <slug>.html            # one static post per file, no JS needed
```

## Conventions

- **Each tool is self-contained** — one `.html` file + its matching `.js` file in `docs/js/`. No shared component system.
- **Styling:** global base is [Simple.css](https://simplecss.org/) CDN; tool-specific styles go inline or in a `<style>` block in the HTML file.
- **No build toolchain** — edit files directly; GitHub Actions deploys `docs/` to Pages on push to `main`.
- Adding a new tool: create `docs/tools/<name>.html`, `docs/js/<name>.js`, and add a list item to `docs/index.html`.
- Keep each tool dependency-free or CDN-only; no npm installs.
- **Blog posts** live in `docs/blog/` as one `<slug>.html` per post (kebab-case filename). Most posts are static and need no JS; an interactive post (e.g. `dns-explained.html`) may have a matching `docs/js/<slug>.js`, following the same one-file-per-page rule as tools. Each post keeps simple front-matter-style metadata (title, date, tags) rendered at the top of the page, follows the same Simple.css + inline `<style>` convention as tools, and is linked from both `docs/blog/index.html` (the listing) and the "Blog" section in `docs/index.html`.

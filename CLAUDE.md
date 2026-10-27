# zr0w.github.io — Claude context

## Project overview

Personal GitHub Pages site: a collection of standalone browser-based webtools plus a small blog. No framework, no build step, no package manager. Pure vanilla HTML, CSS, and JavaScript served directly from the `docs/` folder.

## Repo layout

```
docs/
  index.html                 # landing page: Webtools list + link to the blog
  assets/
    images/                  # static images (e.g. mascot)
    audio/vietnamese/        # local MP3s for the Vietnamese learning tool
  tools/<name>.html          # one page per tool
  js/<name>.js               # matching script for each tool (and interactive blog posts)
  blog/
    index.html               # blog listing, newest post first
    <slug>.html              # one post per file
  vietnamese-learning-plan.md  # content/planning notes for the learning tool
.cursor/skills/add-webtool/  # Cursor skill + examples for scaffolding a new tool
```

The current tools are listed in `docs/index.html`; check `docs/tools/` rather than relying on a list here.

## Branches and deployment

- **Default branch: `deploy-main`.** GitHub Pages builds and publishes from it via the built-in "pages build and deployment" (there is no workflow file in the repo). Pushing or merging to `deploy-main` updates the live site.
- `main` is stale (behind `deploy-main`); don't base work on it or target PRs at it.
- Work on a feature branch and open a PR against `deploy-main` (e.g. `claude/<topic>` branches, as in past PRs).

## Conventions

- **Each tool is self-contained**: one `docs/tools/<name>.html` + its matching `docs/js/<name>.js`. No shared component system.
- **Styling:** global base is [Simple.css](https://simplecss.org/) CDN; page-specific styles go in a `<style>` block in the HTML file.
- **No build toolchain:** edit files directly. Keep pages dependency-free or CDN-only; no npm installs.
- **Adding a new tool:** create `docs/tools/<name>.html` and `docs/js/<name>.js`, and add a list item to the Webtools section of `docs/index.html`. The `.cursor/skills/add-webtool` skill describes the same workflow in detail.
- **Blog posts** live in `docs/blog/` as one `<slug>.html` per post (kebab-case filename).
  - Most posts are static and need no JS. An interactive post (e.g. `dns-explained.html`) may have a matching `docs/js/<slug>.js`, following the same one-file-per-page rule as tools.
  - Each post renders simple front-matter-style metadata at the top (title, date, tags), follows the Simple.css + inline `<style>` convention, links back to the blog index, and starts with the italic AI-generated disclaimer line used by existing posts.
  - Add each new post to the top of `docs/blog/index.html` (title, date, one-paragraph summary, tags). `docs/index.html` only links to the blog index, not to individual posts.
  - Posts are public: never include private details such as home IP addresses, IPv6 prefixes, network names, usernames, or passwords. Use documentation address ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`) for examples.

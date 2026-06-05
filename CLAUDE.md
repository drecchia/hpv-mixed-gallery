# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`HpvMixedGallery` — a single vanilla-JS class for a mixed-media (documents + images) upload gallery: a progressive-disclosure upload panel (local / camera tabs + dropzone), a type-aware card grid, an empty state, and a footer counter + save action. Distilled from a Photon UX prototype.

There is **no build system, no package.json, no test runner, no linter, no module system**. The component is plain file-scope JS/CSS loaded via `<script>`/`<link>` tags. `Bulma 1.0.x` (layout/buttons) and `FontAwesome 6` (icons) must be provided by the host page — see `index.html`.

## Files

- `src/js/hpv-mixed-gallery.js` — the entire component (one `HpvMixedGallery` class + `HpvMixedGalleryError`).
- `src/css/hpv-mixed-gallery.css` — all styles, every rule scoped under `.hpv-mixed-gallery`.
- `index.html` — the runnable demo and the way to exercise the component.
- `README.md` — public options/API reference; keep it in sync when changing options.

## Verifying changes (there are no tests)

1. Syntax: `node --check src/js/hpv-mixed-gallery.js`
2. Behavior: open the demo and drive it with a headless browser. `file://` needs `--allow-file-access`; inject a synthetic `DataTransfer`/`File` to exercise drop, size, and capacity paths that can't be triggered by a real click:

```bash
agent-browser --allow-file-access open "file:///$PWD/index.html" && agent-browser wait --load networkidle
agent-browser eval --stdin <<'EOF'
// the demo's instance is the global `gallery` (a top-level const, reachable by name)
gallery._addFiles([new File([new ArrayBuffer(1024)], 'x.pdf', {type:'application/pdf'})]);
EOF
```

The demo's instance is the global `gallery`; private `_`-methods are reachable for probing.

## Architecture / non-obvious flows

**Construction & state.** `new HpvMixedGallery(containerId, options)`. Options merge by spread; `options.labels` is merged **one level deep** separately so callers can override a single string. Root is resolved via `getElementById` (throws `HpvMixedGalleryError` if missing). All state lives flat on `this` (`items` is a `Map<idString, asset>`, ids are `'asset-' + counter`). `_init()` → `_createElements()` (one `innerHTML` scaffold, then cache `data-role` refs) → `_setupEventListeners()` → `_loadItems()`.

**Events are fully delegated.** A single `click` listener on the container dispatches on `data-action` (`toggle-upload`, `method`, `pick`, `camera`, `remove`, `remove-confirm`, `remove-cancel`, `save`, …). `change`/`dragover`/`dragleave`/`drop` are also delegated on the container. Outbound communication is callbacks only (`onAdd`/`onRemove`/`onReject`/`onSave`/`onCreate`), each guarded with `if (this.options.x)`.

**All user-facing copy lives in `options.labels`.** No Portuguese literals in the render methods. Strings are plain values; `counter(n, max)`, `tooLarge(name, limitMB, sizeText)`, `galleryFull(max)`, `limitReached(max, rejected)` are functions. When adding any visible text, add a label key — do not hardcode.

**Single ingest chokepoint for limits.** Picker and drop both call `_addFiles(fileList)` → per file `_addFromFile()` → `addAsset()` → `_insertAsset()`.
- `_addFiles` enforces the **gallery** limit (`maxItems`): fills to remaining capacity, then reports overflow via `limitReached`.
- `_addFromFile` enforces the **per-file** size limit (`maxSizeMB`) via `tooLarge`.
- `addAsset` has a hard `_isFull()` backstop; `_insertAsset` is the only place a card is created and is also used by `_loadItems` (which bypasses the limits — initial items are caller-trusted).
Capacity is surfaced proactively: footer counter shows `n de max` and the root gets `.is-full` (amber counter + dimmed dropzone).

**Animations are class/keyframe driven and centrally gated.** `_shouldAnimate()` = `options.animate && !prefers-reduced-motion`; when false, everything degrades to instant. Cards animate in via the `is-entering` keyframe (only for user-added cards, never `_loadItems`) and out via the `is-removing` transition (`_removeCardNode` defers detach until `transitionend`, with a setTimeout fallback). Panel reveal / icon morph use `is-open`/`is-rotated`. Keep new animation durations ~0.25–0.3s for consistency.

**Delete is confirm-in-place, single-armed.** `remove` arms the card (`.is-confirming` swaps trash → ✓/✕), only one card armed at a time, auto-cancels after ~4s (`_armRemove`/`_disarmRemove`). `confirmRemove: false` deletes immediately.

**Drag-drop targets the whole open panel in local mode** (`_isLocalDropTarget`), not just the dashed box — a near-miss otherwise lets the browser open the dropped file and replace the app.

## Conventions (match these)

- `_`-prefixed methods for internals; no `#` private fields; no `return this` chaining; arrow functions for saved handler refs (cleaned up in `destroy()`).
- CSS: root class `.hpv-mixed-gallery`; internal structural classes are plain kebab-case (`library-card`, `mini-view`, `photon-dropzone`); component helpers are `mg-*`; state is expressed via classes (`is-open`, `is-full`, `is-confirming`, `is-removing`, `is-entering`, `is-dragover`) and `data-*`. Every rule stays scoped under the root class.
- **Filenames are untrusted.** Any user-derived string interpolated into an HTML template literal must go through `_escape()` (it covers attribute context, e.g. `title="..."`).
- Re-render of the upload area happens on `setMethod`; the grid uses incremental insert/remove (no full re-render).
- The broader house style and rationale live in sibling files in the parent workspace: `../js-component-authoring-reference.md` and `../hpv-component-template.js`.

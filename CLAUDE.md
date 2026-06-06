# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`HpvMixedGallery` — a vanilla-JS mixed-media (documents + images) upload gallery: a progressive-disclosure upload panel whose uploads are split into **sources** (where bytes come from — the tabs, in `src/js/sources/`) and **targets** (where they're stored — config, in `src/js/targets/`), a type-aware card grid, an empty state, and a footer counter + save action. Distilled from a Photon UX prototype. (See `docs/proposals/source-target.md` for the rationale.)

There is **no build system, no package.json, no test runner, no linter, no module system**. The component is plain file-scope JS/CSS loaded via `<script>`/`<link>` tags. `Bulma 1.0.x` (layout/buttons) and `FontAwesome 6` (icons) must be provided by the host page — see `index.html`.

## Files

- `src/js/hpv-mixed-gallery.js` — the core (`HpvMixedGallery` class + `HpvMixedGalleryError`).
- `src/js/sources/` — upload sources (the tabs): `local.js` `HpvLocalSource` (picker + drag-drop), `camera.js` `HpvCameraSource` (real WebRTC; needs HTTPS/localhost), `url.js` `HpvUrlSource` (paste a remote URL), `uppy.js` `HpvUppySource` (inline Uppy Dashboard; needs the Uppy bundle).
- `src/js/targets/` — storage targets: `xhr.js` `HpvXhrTarget` (multipart POST), `s3.js` `HpvS3Target` (direct-to-S3 signed; needs a backend `sign`/`signEndpoint`). The built-in **local** store (object URL / url-by-reference) is the default when no target is set — no class.
- `src/css/hpv-mixed-gallery.css` — all styles, every rule scoped under `.hpv-mixed-gallery`.
- `index.html` — the runnable demo (registers the 4 sources + a destination picker that calls `setTarget`).
- `README.md` — public options/API reference; keep it in sync when changing options.
- `docs/` — extensive documentation, split by area: `docs/core.md` (the class), `docs/plugins/` (the source/target system + `sources.md`/`targets.md`), `docs/proposals/` (design rationale). Update alongside code changes.

## Verifying changes (there are no tests)

1. Syntax: `node --check src/js/hpv-mixed-gallery.js`
2. Behavior: open the demo and drive it with a headless browser. `file://` needs `--allow-file-access`; inject a synthetic `DataTransfer`/`File` to exercise drop, size, and capacity paths that can't be triggered by a real click:

```bash
agent-browser --allow-file-access open "file:///$PWD/index.html" && agent-browser wait --load networkidle
agent-browser eval --stdin <<'EOF'
// the demo's instance is the global `gallery` (a top-level const, reachable by name)
gallery.addFiles([new File([new ArrayBuffer(1024)], 'x.pdf', {type:'application/pdf'})]);
EOF
```

The demo's instance is the global `gallery`; private `_`-methods are reachable for probing.

## Architecture / non-obvious flows

**Construction & state.** `new HpvMixedGallery(containerId, options)`. Options merge by spread; `options.labels` is merged **one level deep** separately so callers can override a single string. Root is resolved via `getElementById` (throws `HpvMixedGalleryError` if missing). All state lives flat on `this` (`items` is a `Map<idString, asset>`, ids are `'asset-' + counter`). `_init()` → `_createElements()` (one `innerHTML` scaffold, then cache `data-role` refs) → `_setupEventListeners()` → `_loadItems()`.

**Events are delegated, split core vs plugin.** The **core** has one `click` + one `keydown` listener on the container, dispatching core `data-action`s (`toggle-upload`, `open-upload`, `method`, `item`, `remove`, `remove-confirm`, `remove-cancel`, `save`). `keydown` is generic: Enter/Space on any focusable `role="button"` div synthesizes a `click` (covers cards and plugin dropzones). **Plugins** add their own delegated listeners on `gallery.container` (the local plugin: `click`/`change`/`dragover`/`dragleave`/`drop`, scoped by `[data-plugin="<id>"]`; the camera plugin: `click`). Outbound communication is callbacks only (`onAdd`/`onRemove`/`onReject`/`onItemClick`/`onSave`/`onCreate`), guarded with `if (this.options.x)`.

**All user-facing copy lives in `options.labels`.** No Portuguese literals in the render methods. Strings are plain values; `counter(n, max)`, `tooLarge(name, limitMB, sizeText)`, `galleryFull(max)`, `limitReached(max, rejected)` are functions. When adding any visible text, add a label key — do not hardcode.

**Single ingest chokepoint (public, plugin-facing).** Sources hand acquisitions to the core via `ingest(acquisitions)` — each acquisition is `{ file }` or `{ url, name?, ext? }`. `ingest` enforces both limits, then routes each through the active target's `store(acq, ctx)` (or the built-in `_localStore` when none set), then `addAsset()` → `_insertAsset()`. Limits, object-URL lifecycle, and error messaging stay in the core so every source/target combo behaves consistently.
- `ingest` enforces the **gallery** limit (`maxItems`, overflow → `limitReached`) and the **per-file** size limit (`maxSizeMB` → `tooLarge` + `onReject`).
- `addFiles(fileList)` is a thin wrapper: `ingest(files.map(f => ({ file: f })))`.
- A **target** returns the asset to add; `ctx.objectUrl(blob)` creates a core-tracked object URL (used by `_localStore`; tracked in `_objectUrls`, revoked on remove/clear/destroy), `ctx.progress(msg)` shows a progress line. A target throws `Error(message)` on failure → core `showError`.
- `addAsset` has a hard `_isFull()` backstop; `_insertAsset` is the only place a card is created and is also used by `_loadItems` (which bypasses limits — initial items are caller-trusted).
- Plugin-facing helpers: `ingest`, `addFiles`, `addAsset`, `isFull()`, `showError(msg)`/`clearError()`.
Capacity is surfaced proactively: footer counter shows `n de max` and the root gets `.is-full` (amber counter + dimmed dropzone).

**Uploads = sources (tabs) + a target (storage).** `registerSource(source)` pushes the source, calls `source.init(this)`, sets it active if first, then `_renderTabs()` (segmented buttons, one per source, `data-action="method" data-method="<id>"`) + `_renderActiveArea()` (`_uploadArea.innerHTML = activeSource.renderArea(this)`). `setMethod(id)` switches the active source; `setTarget(target)` sets where bytes go (default = built-in local). Source contract: `{ id, options.label, init(gallery), renderArea(gallery)→html, destroy() }` plus **optional** `onShow(gallery)`/`onHide(gallery)` lifecycle hooks — the core calls them on open/close and on tab switch (gated to when the panel is open) so sources can acquire/release resources (camera starts/stops its `getUserMedia` stream; Uppy mounts/tears down its Dashboard). Target contract: `{ id, store(acq, ctx) => Promise<asset|null> }`. Sources do their own event delegation (scoped by `[data-plugin="<id>"]`) and feed the core via `ingest`/`addFiles`. The core ships no upload UI by itself — with no source registered the tabs/area are empty. `registerUploadPlugin`/`unregisterUploadPlugin` remain as **deprecated aliases** of `registerSource`/`unregisterSource` (a combo plugin = a source that stores its own bytes via `addAsset`).

**Animations are class/keyframe driven and centrally gated.** `_shouldAnimate()` = `options.animate && !prefers-reduced-motion`; when false, everything degrades to instant. Cards animate in via the `is-entering` keyframe (only for user-added cards, never `_loadItems`) and out via the `is-removing` transition (`_removeCardNode` defers detach until `transitionend`, with a setTimeout fallback). Panel reveal / icon morph use `is-open`/`is-rotated`. Keep new animation durations ~0.25–0.3s for consistency.

**Delete is confirm-in-place, single-armed.** `remove` arms the card (`.is-confirming` swaps trash → ✓/✕), only one card armed at a time, auto-cancels after ~4s (`_armRemove`/`_disarmRemove`). `confirmRemove: false` deletes immediately.

**Read-only mode (`readOnly` option + `setReadOnly(on)`).** Adds `.is-readonly` on the root, which CSS uses to hide every mutation affordance (upload toggle + panel, per-card delete, save button, empty-state add button). Defense-in-depth: `_handleClick` blocks all actions except `item`, and `openUpload()` no-ops. Item preview and the programmatic API (`addAsset`/`removeAsset`/`ingest`/…) stay functional — only the end-user UI is locked.

**Drag-drop targets the whole open panel** (in the local plugin's `_isDropTarget`), not just the dashed box — a near-miss otherwise lets the browser open the dropped file and replace the app.

## Conventions (match these)

- `_`-prefixed methods for internals; no `#` private fields; no `return this` chaining; arrow functions for saved handler refs (cleaned up in `destroy()`).
- CSS: root class `.hpv-mixed-gallery`; internal structural classes are plain kebab-case (`library-card`, `mini-view`, `photon-dropzone`); component helpers are `mg-*`; state is expressed via classes (`is-open`, `is-full`, `is-confirming`, `is-removing`, `is-entering`, `is-dragover`) and `data-*`. Every rule stays scoped under the root class.
- **Filenames are untrusted.** Any user-derived string interpolated into an HTML template literal must go through `_escape()` (it covers attribute context, e.g. `title="..."`).
- The upload area re-renders on `setMethod`/`registerUploadPlugin` (active plugin's `renderArea`); the grid uses incremental insert/remove (no full re-render).
- Plugins are first-party and may use a couple of core internals (`gallery._escape`); they reach the panel via `container.querySelector('[data-role="upload-panel"]')`, not a private ref.
- The broader house style and rationale live in sibling files in the parent workspace: `../js-component-authoring-reference.md` and `../hpv-component-template.js`.

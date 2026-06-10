# hpv-mixed-gallery

> A vanilla-JS **mixed-media upload gallery** — documents *and* images — with a
> progressive-disclosure upload panel, a type-aware card grid, and pluggable
> upload **sources** and storage **targets**.

![vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e?logo=javascript&logoColor=000)
![build](https://img.shields.io/badge/build-none-2ea44f)
![module system](https://img.shields.io/badge/modules-none%20(script%20tags)-informational)
![deps](https://img.shields.io/badge/peer%20deps-Bulma%201.0%20%2B%20FontAwesome%206-1d72b8)

No build step. No `package.json`. No bundler. No framework. Drop in a `<script>`
tag and a `<div>`, and you have a working upload gallery whose styles are fully
scoped under `.hpv-mixed-gallery`.

**📚 Full documentation:** [`docs/`](docs/README.md) ·
[Core](docs/core.md) · [Sources & Targets](docs/plugins/README.md) ·
[Design rationale](docs/proposals/source-target.md)

---

## Contents

- [Why](#why) · [Features](#features) · [Demo](#demo)
- [Dependencies](#dependencies) · [Quick start](#quick-start)
- [Core idea: sources × targets](#core-idea-sources--targets) · [Recipes](#recipes)
- [Options](#options) · [Asset model](#asset-model) · [Public API](#public-api)
- [Sources](#sources) · [Targets](#targets)
- [Read-only mode](#read-only-mode) · [Item click & previewer](#item-click--previewer)
- [Documentation map](#documentation-map) · [Behavior notes](#behavior-notes)

---

## Why

Most upload widgets hard-wire *where files come from* to *where they're stored*.
`hpv-mixed-gallery` splits those into two composable axes:

- **Sources** — *where bytes come from* (the tabs): local picker, webcam,
  clipboard paste, Uppy, phone-over-QR…
- **Targets** — *where bytes go* (config, not a tab): keep them in-page, `POST`
  to your server, or sign-and-PUT straight to S3.

**Any source composes with any target.** Add a webcam tab without touching your
upload code; switch from local storage to S3 without touching your tabs.

## Features

- 🧩 **Pluggable sources & targets** — mix and match; write your own against a
  tiny contract. ([guide](docs/plugins/README.md#write-your-own))
- 🖼️ **Type-aware grid** — real `<img>` thumbnails for images, format badges for
  PDFs / spreadsheets / other files.
- ⚡ **Client-side thumbnails** — opt-in downscaling keeps the original for
  preview/download while cards render a small thumb. ([thumbnails](docs/core.md#the-asset-model))
- 📐 **Rich asset model** — first-class `width`/`height` + an opaque `meta`
  passthrough that round-trips through `getAssets()`/`onSave`.
- 🔒 **Read-only mode** — lock the UI for viewers while the programmatic API
  stays live.
- 🎚️ **Capacity & size limits** — proactive counter, full-state UX, calm inline
  rejection messages (no `alert()`).
- ♿ **Accessible & animated** — keyboard-operable cards, `role="button"` +
  Enter/Space, motion gated by `prefers-reduced-motion`.
- 🌍 **Fully localizable** — every visible string lives in `options.labels`
  (pt-BR defaults).
- 🪶 **Zero-build, scoped CSS** — one `.js`, one `.css`, plug-in sources/targets
  as separate files.

## Demo

Open [`index.html`](index.html) in a browser — a runnable demo that registers
every source, wires a destination picker (`setTarget`), enables thumbnails, and
hooks an image previewer + PDF overlay.

```bash
# any static server works; or just open the file
python3 -m http.server   # then visit http://localhost:8000
```

## Dependencies

The host page must provide two peer libraries (the component ships neither):

| Library | Use | 
| --- | --- |
| **Bulma 1.0.x** | layout, buttons |
| **FontAwesome 6** | icons |

See [`index.html`](index.html) for the exact CDN tags. The component's own CSS is
self-contained and scoped under `.hpv-mixed-gallery`.

## Quick start

```html
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css">
<div id="media-library"></div>

<script src="src/js/hpv-mixed-gallery.js"></script>
<script src="src/js/sources/local.js"></script>
<script src="src/js/sources/camera.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    items: [{ name: 'config.pdf', size: '2.4 MB', ext: 'PDF' }],
    onSave: (c, assets) => console.log(assets),
  });

  // SOURCES are the tabs (first registered = active tab).
  gallery.registerSource(new HpvLocalSource());
  gallery.registerSource(new HpvCameraSource());

  // TARGET is where bytes are stored. Default = keep them in the gallery.
  // gallery.setTarget(new HpvS3Target({ sign }));   // e.g. upload everything to S3
</script>
```

Without any registered source the upload panel simply has no tabs — the rest of
the gallery (grid, delete, save, preview hooks, programmatic API) still works.

## Core idea: sources × targets

```
        SOURCES  (the tabs — where bytes come from)
   ┌─────────┬─────────┬───────────┬──────────┬───────┐
   │  Local  │ Camera  │ Clipboard │  Uppy    │ W2WS  │
   └────┬────┴────┬────┴─────┬─────┴────┬─────┴───┬───┘
        └─────────┴──────────┼──────────┴─────────┘
                             ▼
                    gallery.ingest(acquisitions)     ← one chokepoint:
                             │                          limits, size checks,
                             ▼                          thumbnails, object-URLs
                    TARGET.store(acq, ctx)            ← where bytes go
   ┌────────────────┬──────────────────┬────────────────────────┐
   │ built-in local │  HpvXhrTarget    │     HpvS3Target         │
   │ (object URLs)  │  (multipart POST)│  (signed direct→S3)     │
   └────────────────┴──────────────────┴────────────────────────┘
```

Sources acquire bytes and hand them to the **single ingest chokepoint**; the core
enforces limits and lifecycle, then routes each acquisition through the active
target. This keeps every source/target combination behaving consistently. Full
contracts: [docs/plugins/README.md](docs/plugins/README.md).

## Recipes

Small, copy-pasteable snippets that show what the options unlock.

### Thumbnails + S3 + a round-tripping `meta` bag

Enable client-side thumbnails, store everything on S3, and carry your own backend
metadata through to `onSave` — untouched by the core.

```js
const gallery = new HpvMixedGallery('media-library', {
  thumbnails: { maxWidth: 400, type: 'image/webp', quality: 0.8 },
  onSave: (c, assets) => {
    // each image asset now carries first-class dims + your meta
    assets.forEach(a => console.log(a.name, `${a.width}×${a.height}`, a.meta));
    return fetch('/api/save', { method: 'POST', body: JSON.stringify(assets) });
  },
});

gallery.registerSource(new HpvLocalSource());
gallery.setTarget(new HpvS3Target({
  meta: { entity: 'invoice', id: 42 },              // sent to your signer
  sign: async (file, { kind, meta }) => {
    const r = await fetch('/api/s3-sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, kind, meta }),
    });
    // anything extra you return rides along on the asset, verbatim:
    return r.json();   // { method:'PUT', url, publicUrl, width, height, meta:{ uploadedAt } }
  },
}));
```

### Fully localize every string

`labels` is merged one level deep, so override just the keys you want — including
the functional ones.

```js
new HpvMixedGallery('id', {
  labels: {
    title: 'Files & Images',
    subtitle: 'Drop files or pick a source',
    saveButton: 'Save',
    emptyTitle: 'Nothing here yet',
    counter: (n, max) => max ? `${n} of ${max}` : `${n} item${n === 1 ? '' : 's'}`,
    tooLarge: (name, limitMB) => `“${name}” exceeds the ${limitMB} MB limit.`,
    limitReached: (max, rejected) => `Full at ${max}. Skipped ${rejected}.`,
  },
});
```

### Hard caps with custom rejection UX

Cap count and size, and react to every rejection.

```js
new HpvMixedGallery('id', {
  maxItems: 10,
  maxSizeMB: 5,
  onReject: (c, file, reason) => {
    if (reason === 'too-large') toast(`${file.name} is over 5 MB`);
  },
  onAdd:    (c, a) => analytics('upload', a.ext),
  onRemove: (c, id, a) => analytics('remove', a.ext),
});
// footer counter shows "3 de 10" and turns amber at the ceiling automatically.
```

### Permission-gated, read-only by default

Lock the UI for viewers; flip it on when the user can edit. The programmatic API
keeps working either way.

```js
const gallery = new HpvMixedGallery('id', { readOnly: !user.canEdit });
editButton.onclick = () => gallery.setReadOnly(false);

// still works while read-only — UI affordances are hidden, not the data layer:
gallery.addAsset({ name: 'seed.pdf', ext: 'PDF', url: '/files/seed.pdf' });
```

### Custom card content with `renderItem`

Override the inner content while the core keeps the column wrapper, click handler,
and delete animations.

```js
new HpvMixedGallery('id', {
  renderItem: (a, { escape, preview, actions }) => `
    ${preview(a)}
    <div class="my-card-body">
      <strong>${escape(a.name)}</strong>
      <span class="tag">${a.ext}</span>
      ${a.width ? `<small>${a.width}×${a.height}</small>` : ''}
    </div>
    ${actions(a)}
  `,
});
```

### Wire a previewer on click

The component ships no previewer — branch on `asset.ext` and open whatever you like.

```js
new HpvMixedGallery('id', {
  onItemClick: (c, asset) => {
    if (c.getImages().some(a => a.id === asset.id)) {
      const imgs = c.getImages().filter(a => a.url).map(a => ({ url: a.url, alt: a.name }));
      const i = imgs.findIndex(a => a.alt === asset.name);
      HpvImagePreviewer.showGallery(imgs, Math.max(0, i));
    } else if (asset.ext === 'PDF') {
      openPdfOverlay(asset.url);
    }
  },
});
```

### Many sources, one target

Give users five ways to add files; store them identically.

```js
// first registered wins the active tab; all of them feed the same target
gallery.registerSource(new HpvLocalSource({ label: 'My device' }));
gallery.registerSource(new HpvCameraSource());
gallery.registerSource(new HpvClipboardSource());
gallery.setTarget(new HpvXhrTarget({ endpoint: '/upload', withCredentials: true }));
```

## Options

Most-used options below; see [docs/core.md → Options](docs/core.md#options) for
the complete reference.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | array | `[]` | Initial assets `{ name, size, ext }` (optional `url` to preview). |
| `maxSizeMB` | number | `15` | Reject larger files; `0`/`null` = no limit. |
| `maxItems` | number | `0` | Capacity; `0` = unlimited. |
| `thumbnails` | `false`\|object | `false` | Client-side card thumbs `{ maxWidth, type, quality }`. Card shows the thumb; `url` keeps the original; targets persist **both**. |
| `readOnly` | boolean | `false` | View-only UI; toggle later with `setReadOnly()`. |
| `confirmRemove` | boolean | `true` | Inline confirm before deleting a card. |
| `animate` | boolean | `true` | Micro-interactions (respects `prefers-reduced-motion`). |
| `labels` | object | pt-BR | All visible copy; merged one level deep — override single keys. |
| `renderItem` | function | `null` | `fn(asset, helpers) => html` — override a card's inner content. |
| `onAdd` / `onRemove` / `onReject` / `onItemClick` / `onSave` / `onCreate` | function | `null` | Lifecycle callbacks — see [docs](docs/core.md#callbacks). |
| `isDebug` | boolean | `false` | Routes `debug()` to `console`. |

### `labels`

Every user-facing string is overridable. Strings include `title`, `subtitle`,
`addButton`, `saveButton`, `emptyTitle`, … ; functions include `counter(n, max)`,
`tooLarge(name, limitMB, sizeText)`, `galleryFull(max)`,
`limitReached(max, rejected)`. Upload-method copy (tab label, dropzone text)
lives on the **source plugins**. Full list: [docs/core.md → labels](docs/core.md#labels).

```js
new HpvMixedGallery('id', {
  labels: { title: 'Files & Images', counter: (n) => `${n} item(s)` },
});
```

## Asset model

Each stored asset is a plain object:

```js
{
  id,        // 'asset-N' (assigned by the core)
  name, size, ext,
  url,       // optional: the ORIGINAL — preview/download source
  thumbUrl,  // optional: small card thumbnail (when `thumbnails` is on)
  width, height,  // optional: ORIGINAL image pixel dims (the only dims modeled)
  meta,      // optional: opaque object, stored verbatim — yours to round-trip
}
```

`width`/`height` are auto-measured when `thumbnails` is enabled, or supplied by a
target/caller (a target's dims win). `meta` is never read by the core — a
passthrough bag for backend data (`uploadedAt`, entity ids, mime…) that survives
`getAssets()`/`onSave` and initial `items`. Details:
[docs/core.md → The asset model](docs/core.md#the-asset-model).

## Public API

```text
ingest(acquisitions)            addFiles(fileList)
addAsset({name, size, ext, url?, thumbUrl?, width?, height?, meta?}) → id
removeAsset(id)   getAssets()   getImages()   getCount()   isFull()   clear()
showError(msg)    clearError()
openUpload()      closeUpload() toggleUpload()
registerSource(s) unregisterSource(s)   setTarget(t)   setMethod(id)
setReadOnly(bool) destroy()
```

`registerUploadPlugin` / `unregisterUploadPlugin` remain as deprecated aliases of
`registerSource` / `unregisterSource`. Full reference:
[docs/core.md → Public API](docs/core.md#public-api).

## Sources

Register with `registerSource` (first registered = active tab). Files live in
`src/js/sources/`. Full guide: [docs/plugins/sources.md](docs/plugins/sources.md).

| Source | File | What it does |
| --- | --- | --- |
| **`HpvLocalSource`** | `local.js` | File picker + drag-and-drop. |
| **`HpvCameraSource`** | `camera.js` | Real WebRTC preview → capture JPEG. Needs HTTPS/localhost. |
| **`HpvClipboardSource`** | `clipboard.js` | Paste an image (Ctrl/Cmd+V) or a copied http(s) URL. Zero-dependency. |
| **`HpvUppySource`** | `uppy.js` | Inline Uppy Dashboard (needs the Uppy bundle + CSS). |
| **`HpvW2wsSource`** | `w2ws.js` | node-w2ws QR→WebSocket bridge: phone streams files (chunked, resumable). |

## Targets

Set one with `setTarget` (default keeps bytes in the gallery). Files live in
`src/js/targets/`. Full guide: [docs/plugins/targets.md](docs/plugins/targets.md).

| Target | File | What it does |
| --- | --- | --- |
| **built-in local** | — | Default. Files get a tracked object URL; URLs kept by reference. |
| **`HpvXhrTarget`** | `xhr.js` | Multipart `POST` per file, with progress. Backend `width`/`height`/`meta` in the JSON response flow onto the asset. |
| **`HpvS3Target`** | `s3.js` | Direct browser→S3 signed upload (PUT/POST). Browser holds no AWS keys; your backend signs each request. |

```js
// any source → S3: register sources, set the S3 target once
gallery.setTarget(new HpvS3Target({
  sign: async (file, { url, kind, meta }) => {
    const r = await fetch('/api/s3-sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size, url, kind, meta }),
    });
    return r.json(); // { method:'PUT', url, publicUrl } | { method:'POST', url, fields }
  },
}));
```

**Contracts (in brief).** A **source** is
`{ id, options.label, init(gallery), renderArea(gallery)→html, destroy(), onShow?, onHide? }`
and calls `gallery.ingest([{ file } | { url }])`. A **target** is
`{ id, store(acq, ctx) => Promise<asset|null> }`, with `ctx.objectUrl(blob)` for a
core-tracked URL and `ctx.progress(msg)` for a progress line. The core owns
limits, object-URL lifecycle, and error messaging. Write-your-own walkthrough:
[docs/plugins/README.md → Write your own](docs/plugins/README.md#write-your-own).

## Read-only mode

For viewers without edit access:

```js
new HpvMixedGallery(id, { readOnly: true });
// or later:
gallery.setReadOnly(true);
```

Hides the upload toggle + panel, per-card delete, the save button, and the
empty-state add button, and blocks UI-driven mutations. Item click
(preview/download) still works, and the programmatic API
(`addAsset`/`removeAsset`/`ingest`/…) is unaffected.

## Item click & previewer

Every card is clickable and fires `onItemClick(component, asset, id)` — branch on
`asset.ext` to decide what a click does. The component ships **no** previewer;
wire one in the host page. `getImages()` returns image assets for a lightbox.
[`index.html`](index.html) demonstrates opening images in
`HpvImagePreviewer.showGallery(images, index)` and PDFs in an EmbedPDF overlay.

Uploaded image files get an object URL automatically (created on add, revoked on
remove/`clear()`/`destroy()` — the component only revokes URLs it created, never
caller-supplied ones); initial `items` may carry their own `url`.

## Documentation map

| Doc | Covers |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation hub + 60-second start |
| [docs/core.md](docs/core.md) | The `HpvMixedGallery` class: options, asset model, API, a11y, events |
| [docs/plugins/README.md](docs/plugins/README.md) | The source/target system + contracts + write-your-own |
| [docs/plugins/sources.md](docs/plugins/sources.md) | Every shipped source, option by option |
| [docs/plugins/targets.md](docs/plugins/targets.md) | Every shipped target, option by option |
| [docs/proposals/source-target.md](docs/proposals/source-target.md) | Why uploads are split into sources + targets |

## Behavior notes

- File picker accepts **multiple** files; re-selecting the same file works (input
  resets after each change).
- Filenames are HTML-escaped before rendering.
- Oversized files are rejected (default 15 MB) with a calm inline message under
  the dropzone — no `alert()`. Keep the local source's `hint` in sync with
  `maxSizeMB`.
- Deleting a card confirms **in place**: the trash icon morphs into ✓ / ✕; only
  one card is armed at a time and it auto-cancels after ~4 s.
- With `maxItems` set, the footer counter shows capacity (`3 de 10`) and turns
  amber at the ceiling; over-limit uploads fill to capacity and report the
  overflow, and a full dropzone explains how to free space instead of opening an
  empty picker.

---

*Distilled from a Photon UX prototype. Contributions and write-your-own
sources/targets welcome — start with [docs/plugins/](docs/plugins/README.md).*

# hpv-mixed-gallery

Mixed media (documents + images) upload gallery, vanilla-JS. Progressive-disclosure
upload panel with **pluggable upload methods** (local file + camera ship as
plugins, registered like hpv-mini-gallery), a type-aware card grid, an empty
state, and a footer counter + save action.

**Full documentation:** [`docs/`](docs/README.md) — split into
[core](docs/core.md) and [plugins](docs/plugins/README.md) (one doc per plugin).

## Dependencies

Host page must load **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).
See `index.html` for the CDN tags. The component ships its own scoped CSS.

## Usage

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

  // SOURCES are the tabs (first registered = active). The TARGET is where bytes
  // go — default keeps them in the gallery; setTarget to upload elsewhere.
  gallery.registerSource(new HpvLocalSource());
  gallery.registerSource(new HpvCameraSource());
  // gallery.setTarget(new HpvS3Target({ sign }));   // e.g. upload everything to S3
</script>
```

Without any registered source the upload panel has no tabs; the rest of the
gallery (grid, delete, save, preview hooks) still works.

## Options

| Option          | Type     | Default | Notes                                   |
| --------------- | -------- | ------- | --------------------------------------- |
| `items`         | array    | `[]`    | Initial assets `{ name, size, ext }` (optional `url` for previewing). |
| `maxSizeMB`     | number   | `15`    | Reject files larger than this; `0`/`null` = no limit. |
| `maxItems`      | number   | `0`     | Max assets the gallery can hold; `0` = unlimited.     |
| `animate`       | boolean  | `true`  | Micro-interactions; set `false` to disable. |
| `confirmRemove` | boolean  | `true`  | Inline confirm before a card is deleted. |
| `labels`        | object   | pt-BR   | Shared copy — see below. Merged one level deep, so override individual keys. (Upload-method strings live in the plugins.) |
| `onAdd`         | function | `null`  | `fn(component, asset)`                   |
| `onRemove`      | function | `null`  | `fn(component, id, asset)`              |
| `onReject`      | function | `null`  | `fn(component, file, reason)` — e.g. `'too-large'`. |
| `onItemClick`   | function | `null`  | `fn(component, asset, id)` — fired when any card is clicked; branch on `asset.ext`. |
| `onSave`        | function | `null`  | `fn(component, assets)`                  |
| `onCreate`      | function | `null`  | `fn(component)`                          |
| `isDebug`       | boolean  | `false` | Routes `debug()` to `console`.          |

### `labels`

Shared copy (pt-BR defaults). Strings: `title`, `subtitle`, `addButton`,
`closeButton`, `sourceLabel`, `sectionTitle`, `emptyTitle`, `emptyText`,
`emptyButton`, `saveButton`, `removeTitle`, `confirmRemoveTitle`, `cancelTitle`.
Functions: `counter(n, max)` → string (`max` is `0` when no `maxItems` limit),
`tooLarge(name, limitMB, sizeText)` → string, `galleryFull(max)` → string,
`limitReached(max, rejected)` → string. Upload-method copy (tab label, dropzone
title/hint) is configured on the **plugins** instead — see below.

```js
new HpvMixedGallery('id', {
  labels: { title: 'Files & Images', counter: (n) => `${n} item(s)` },
});
```

## Public API

`ingest(acquisitions)` (the chokepoint, used by sources) · `addFiles(fileList)` ·
`addAsset({name, size, ext, url?})` → id · `removeAsset(id)` · `getAssets()` ·
`getImages()` (image-type only) · `getCount()` · `isFull()` · `clear()` ·
`showError(msg)` / `clearError()` · `openUpload()` / `closeUpload()` / `toggleUpload()` ·
`registerSource(source)` / `unregisterSource(source)` · `setTarget(target)` ·
`setMethod(sourceId)` · `destroy()`
(`registerUploadPlugin` / `unregisterUploadPlugin` remain as deprecated aliases.)

## Sources & Targets

Uploading is split into two composable concerns. **Sources** are *where bytes come
from* (the tabs); **targets** are *where they're stored* (config, not a tab). Any
source composes with any target. Full guide: [docs/plugins/README.md](docs/plugins/README.md).

**Sources** (`src/js/sources/`, register with `registerSource`; first = active tab):

- **`HpvLocalSource`** (`local.js`) — file picker + drag-and-drop. Options: `id`,
  `label`, `title`, `hint`, `accept`, `multiple`.
- **`HpvCameraSource`** (`camera.js`) — **real WebRTC**: live preview, capture →
  JPEG → `addFiles`. Needs HTTPS/localhost. Options: `id`, `label`, `idleText`,
  `captureLabel`, `flipLabel`, `quality`, `maxWidth`, `facingMode`, `fileName`.
- **`HpvUrlSource`** (`url.js`) — paste a remote URL; emits a `{ url }` acquisition
  (the target decides whether to fetch). Options: `id`, `label`, `placeholder`,
  `hint`, `addLabel`, `validate`, `nameFrom`.
- **`HpvUppySource`** (`uppy.js`) — inline **Uppy Dashboard** (needs the Uppy
  bundle + CSS). Options: `id`, `label`, `height`, `note`, `uppyOptions`,
  `dashboardOptions`.

**Targets** (`src/js/targets/`, set one with `setTarget`):

- **built-in local** (default; no `setTarget`) — keep in the gallery: files get a
  tracked object URL, URLs are kept by reference.
- **`HpvXhrTarget`** (`xhr.js`) — multipart `POST` per file with progress. Options:
  `id`, `endpoint`, `fieldName`, `headers`, `withCredentials`, `timeout`,
  `responseParser`.
- **`HpvS3Target`** (`s3.js`) — direct browser→S3 signed upload (PUT/POST); browser
  holds no AWS keys. Options: `sign(file)` **or** `signEndpoint` (+ `signMethod`,
  `signHeaders`), `method`, `fieldName`, `headers`, `withCredentials`, `timeout`,
  `publicUrl(file, signed)`.

```js
// any source → S3: register sources, set the S3 target once
gallery.registerSource(new HpvLocalSource());
gallery.registerSource(new HpvCameraSource());
gallery.setTarget(new HpvS3Target({
  sign: async (file) => {
    const r = await fetch('/api/s3-sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    return r.json(); // { method:'PUT', url, publicUrl } | { method:'POST', url, fields }
  },
}));
```

**Contracts.** A **source** is `{ id, options.label, init(gallery),
renderArea(gallery)→html, destroy(), onShow?, onHide? }` and acquires bytes/urls
then calls `gallery.ingest([{ file } | { url }])`. A **target** is
`{ id, store(acq, ctx) => Promise<asset|null> }`; `ctx.objectUrl(blob)` makes a
core-tracked URL and `ctx.progress(msg)` shows a progress line. The core owns
limits, object-URL lifecycle, and error messaging. `registerUploadPlugin` is a
deprecated alias of `registerSource` (a combo plugin = a source that stores its
own bytes). See [docs/plugins/](docs/plugins/README.md) for a write-your-own walkthrough.

### Item click / previewer

Every card is clickable and fires `onItemClick(component, asset, id)`. Branch on
`asset.ext` to decide what a click does (preview an image, open a PDF, …). The
component ships **no** previewer — wire one in the host page. `getImages()`
returns the image assets so you can open a gallery lightbox. `index.html`
demonstrates the pattern: image items open `HpvImagePreviewer.showGallery(images, index)`.

Each image asset has a `url`: uploaded image files get an object URL
automatically (created on add, revoked on remove/`clear()`/`destroy()` — the
component only revokes URLs it created, never caller-supplied ones), and
initial `items` may supply their own `url`.

## Behavior notes vs. the prototype

- File picker accepts **multiple** files; selecting the same file twice works
  (input is reset after each change).
- The dropzone's advertised drag-and-drop is wired up (the prototype only
  showed the affordance).
- Filenames are HTML-escaped before rendering.
- `Salvar` fires `onSave` instead of the prototype's `alert()`.
- Oversized files are rejected (default 15 MB) with a calm inline message
  under the dropzone — no `alert()`. The local plugin's `hint` text is
  independent, so keep it in sync with `maxSizeMB` if you change the limit.
- Deleting a card asks for confirmation in place: the trash icon morphs into
  ✓ / ✕; only one card can be armed at a time and it auto-cancels after ~4 s.
- With `maxItems` set, the footer counter shows capacity (`3 de 10`) and turns
  amber at the ceiling. Uploads beyond the limit are blocked: a batch fills up
  to capacity and reports the overflow; clicking a full dropzone explains how to
  free space (remove an item) instead of opening an empty picker.

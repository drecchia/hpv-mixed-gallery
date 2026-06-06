# hpv-mixed-gallery

Mixed media (documents + images) upload gallery, vanilla-JS. Progressive-disclosure
upload panel with **pluggable upload methods** (local file + camera ship as
plugins, registered like hpv-mini-gallery), a type-aware card grid, an empty
state, and a footer counter + save action.

## Dependencies

Host page must load **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).
See `index.html` for the CDN tags. The component ships its own scoped CSS.

## Usage

```html
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css">
<div id="media-library"></div>
<script src="src/js/hpv-mixed-gallery.js"></script>
<script src="src/js/plugins/local-upload.js"></script>
<script src="src/js/plugins/camera-capture.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    items: [{ name: 'config.pdf', size: '2.4 MB', ext: 'PDF' }],
    onSave: (c, assets) => console.log(assets),
  });

  // Upload methods are plugins — register them (first registered = active tab).
  gallery.registerUploadPlugin(new HpvLocalUpload());
  gallery.registerUploadPlugin(new HpvCameraCapture());
</script>
```

Without any registered plugin the upload panel has no methods (empty tabs);
the rest of the gallery (grid, delete, save, preview hooks) still works.

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

`addAsset({name, size, ext, url?})` → id · `addFiles(fileList)` (used by plugins) ·
`removeAsset(id)` · `getAssets()` · `getImages()` (image-type only) · `getCount()` ·
`isFull()` · `clear()` · `showError(msg)` / `clearError()` ·
`openUpload()` / `closeUpload()` / `toggleUpload()` ·
`registerUploadPlugin(plugin)` / `unregisterUploadPlugin(plugin)` ·
`setMethod(pluginId)` · `destroy()`

## Upload plugins

Each upload **method** is a plugin (mirrors hpv-mini-gallery). Register them after
construction; the first registered is the active tab. Four ship in `src/js/plugins/`:

- **`HpvLocalUpload`** (`local-upload.js`) — file picker + drag-and-drop. Options:
  `id`, `label`, `title`, `hint`, `accept`, `multiple`.
- **`HpvCameraCapture`** (`camera-capture.js`) — **real WebRTC** capture: live
  `<video>` preview, capture → JPEG blob → `addFiles`. Options: `id`, `label`,
  `idleText`, `captureLabel`, `flipLabel`, `quality`, `maxWidth`, `facingMode`.
  Needs a **secure context** (HTTPS or `http://localhost`) and camera permission;
  degrades to a message otherwise.
- **`HpvXhrUpload`** (`xhr-upload.js`) — picker/drag-drop that POSTs each file to
  a server as multipart with progress, then adds the asset using the returned URL.
  Options: `id`, `label`, `title`, `hint`, `accept`, `endpoint`, `fieldName`,
  `headers`, `withCredentials`, `timeout`, `responseParser`, callbacks.
- **`HpvUppyUpload`** (`uppy-upload.js`) — inline **Uppy Dashboard** (requires the
  Uppy bundle + CSS on the page). `mode: 'local'` adds chosen files straight to the
  gallery (no server); `mode: 'xhr'` uploads via Uppy's XHRUpload to `endpoint`.

The contract supports optional `onShow(gallery)` / `onHide(gallery)` lifecycle
hooks (called when a tab becomes active / inactive and on open/close) — the camera
uses them to start/stop its stream, Uppy to mount/teardown its dashboard.

**Plugin contract** (write your own — paste-from-clipboard, cloud picker, …):

```js
class MyUpload {
  constructor(opts = {}) { this.id = opts.id || 'mine'; this.options = { label: 'My source', ...opts }; }
  init(gallery)   { /* save ref; add delegated listeners on gallery.container */ }
  renderArea(g)   { return `<div ...>…</div>`; }   // HTML for the active tab
  onShow(g)       { /* optional: tab became active (panel open) */ }
  onHide(g)       { /* optional: tab left / panel closed — release resources */ }
  destroy()       { /* remove your listeners */ }
}
```

Feed files/assets back through the core (it owns limits, object URLs, and error
messaging): `gallery.addFiles(fileList)`, `gallery.addAsset(asset)`. Read
`gallery.isFull()` and surface messages via `gallery.showError(msg)`.

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

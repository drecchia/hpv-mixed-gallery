# Core — `HpvMixedGallery`

The core class renders the whole gallery shell (header + toggle, upload panel
with plugin tabs, card grid, empty state, footer counter + save) and owns all
shared concerns: the asset store, size/capacity limits, object-URL lifecycle,
error messaging, animations, delete confirmation, and the plugin registry.

Upload **methods** themselves are not in the core — they are [plugins](plugins/README.md).
The core ships no upload UI by itself.

- [Construction](#construction)
- [Options](#options)
  - [`labels`](#labels)
  - [Callbacks](#callbacks)
- [The asset model](#the-asset-model)
- [Public API](#public-api)
- [Plugin registry & lifecycle](#plugin-registry--lifecycle)
- [Ingest pipeline & limits](#ingest-pipeline--limits)
- [Capacity UX](#capacity-ux)
- [Delete confirmation](#delete-confirmation)
- [Item click (preview/download hook)](#item-click-previewdownload-hook)
- [Animations](#animations)
- [Keyboard & accessibility](#keyboard--accessibility)
- [Events & DOM contract](#events--dom-contract)
- [CSS contract](#css-contract)
- [Errors](#errors)

## Construction

```js
const gallery = new HpvMixedGallery(containerId, options);
```

- `containerId` — the **id string** of an existing element. Resolved with
  `document.getElementById`. If not found, the constructor throws
  `HpvMixedGalleryError`.
- `options` — see below. Shallow-merged over the defaults; `options.labels` is
  merged one level deep (so you can override a single label).
- `onCreate(gallery)` fires at the end of construction.

The constructor builds the DOM once (one `innerHTML` scaffold) and caches refs;
the grid is then updated incrementally (insert/remove), never fully re-rendered.

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `items` | `Asset[]` | `[]` | Initial assets, rendered in array order. Bypass the limits (caller-trusted). Each is `{ name, size?, ext?, url? }`. |
| `maxSizeMB` | number | `15` | Reject files larger than this. `0`/`null` = no limit. Enforced for files added via `addFiles` (plugins). |
| `maxItems` | number | `0` | Max assets the gallery may hold. `0` = unlimited. |
| `animate` | boolean | `true` | Master switch for micro-interactions. See [Animations](#animations). |
| `confirmRemove` | boolean | `true` | Require an inline confirm before a card is deleted. |
| `labels` | object | pt-BR | Shared user-facing copy. See [`labels`](#labels). Upload-method strings live in the plugins, not here. |
| `onAdd` | function | `null` | `fn(gallery, asset)` after an asset is added. |
| `onRemove` | function | `null` | `fn(gallery, id, asset)` after an asset is removed. |
| `onReject` | function | `null` | `fn(gallery, file, reason)` — currently `reason === 'too-large'`. |
| `onItemClick` | function | `null` | `fn(gallery, asset, id)` when any card is clicked. See [Item click](#item-click-previewdownload-hook). |
| `onSave` | function | `null` | `fn(gallery, assets)` when "Salvar Galeria" is clicked. |
| `onCreate` | function | `null` | `fn(gallery)` at end of construction. |
| `isDebug` | boolean | `false` | Routes `debug()` calls to `console`. |

### `labels`

All shared copy lives here (pt-BR defaults). Merged one level deep, so you can
override individual keys: `new HpvMixedGallery(id, { labels: { title: 'Files' } })`.

**String keys:** `title`, `subtitle`, `addButton` (toggle, closed), `closeButton`
(toggle, open), `sourceLabel` (the "Origem do arquivo:" label above the tabs),
`sectionTitle`, `emptyTitle`, `emptyText`, `emptyButton`, `saveButton`,
`removeTitle`, `confirmRemoveTitle`, `cancelTitle`.

**Function keys:**

| Key | Signature | Default |
|-----|-----------|---------|
| `counter` | `(n, max) => string` | `max ? `${n} de ${max}` : `Mostrando ${n} item(ns)`` |
| `tooLarge` | `(name, limitMB, sizeText) => string` | `"${name}" excede o limite de ${limitMB} MB (tem ${sizeText}).` |
| `galleryFull` | `(max) => string` | `Galeria cheia (limite de ${max}). Remova um item para adicionar outro.` |
| `limitReached` | `(max, rejected) => string` | `Limite de ${max} arquivos atingido — ${rejected} não adicionado(s).` |

> Upload-method copy (tab label, dropzone title/hint, camera button labels, …)
> is **not** here — it's configured on each plugin. See [plugins](plugins/README.md).

### Callbacks

All callbacks are guarded (`if (this.options.x)`) and receive the gallery
instance first. `onItemClick` is where you wire a previewer/downloader (the core
ships none) — branch on `asset.ext`.

## The asset model

Assets are stored in a `Map<idString, asset>` (insertion order). An asset is a
plain object:

```js
{
  id,    // 'asset-' + counter (string, assigned by the core)
  name,  // string
  size,  // display string, e.g. '2.4 MB' (free-form; not bytes)
  ext,   // UPPERCASE extension, derived from name if not given (e.g. 'PDF')
  url,   // optional: thumbnail/preview/download source
}
```

`url` sources:
- **Uploaded files** (via `addFiles`) get an `object URL` created by the core,
  tracked internally and revoked on remove/`clear()`/`destroy()`.
- **Initial `items`** and assets added via `addAsset` may carry a caller-supplied
  `url` (remote URL, data URL, server URL) — the core never revokes those.

Image-type assets (`jpg/jpeg/png/gif/webp`) with a `url` render a real
`<img>` thumbnail; otherwise a type icon (PDF/spreadsheet/file) is shown.

## Public API

### Upload panel — sources & target

| Method | Description |
|--------|-------------|
| `registerSource(source)` | Register an upload source (a tab). First registered becomes the active tab. Renders tabs + the active area. |
| `unregisterSource(source)` | Remove a source (calls its `destroy()`); re-points the active tab if needed. |
| `setTarget(target)` | Set the storage target (`{ store(acq, ctx) }`); `null` restores the built-in local store. |
| `setMethod(id)` | Switch the active source by `id` (calls `onHide`/`onShow`). |
| `openUpload()` / `closeUpload()` / `toggleUpload()` | Show/hide the upload panel (fires the active source's `onShow`/`onHide`). |
| `registerUploadPlugin` / `unregisterUploadPlugin` | Deprecated aliases of `registerSource`/`unregisterSource`. |

### Assets

| Method | Description |
|--------|-------------|
| `ingest(acquisitions)` | The chokepoint (used by sources). Each acquisition is `{ file }` or `{ url, name?, ext? }`; enforces capacity + per-file size, routes through the active target's `store()`, adds the asset. See [Ingest pipeline](#ingest-pipeline--limits). |
| `addFiles(fileList)` | Convenience: `ingest(files.map(f => ({ file: f })))`. |
| `addAsset(asset)` → `id \| null` | Add one asset directly (bypasses the target). Returns the new id, or `null` if rejected (gallery full / no `name`). Newest-first (prepended) with an entrance animation. |
| `removeAsset(id)` | Remove an asset (exit animation, revokes its owned object URL, fires `onRemove`). |
| `getAssets()` | Array (shallow clones) of all assets, insertion order. |
| `getImages()` | Same, filtered to image-type assets (handy for a lightbox gallery). |
| `getCount()` | Number of assets. |
| `isFull()` | `true` when `maxItems > 0` and at capacity. |
| `clear()` | Remove all assets and revoke owned object URLs. |

### Feedback & lifecycle

| Method | Description |
|--------|-------------|
| `showError(msg)` / `clearError()` | Show/hide a calm message in the panel's error slot (auto-hides after ~6s). Used by plugins. |
| `destroy()` | Tear down: clear timers, revoke object URLs, destroy plugins, remove listeners, empty the container. |
| `debug(method, ...args)` | `console[method](...)` when `isDebug` is on. |

> Methods marked "used by sources" form the **plugin-facing API**, together with
> the read props `gallery.container`, `gallery.options`, `gallery.uploadMethod`,
> `gallery.isUploadOpen`, and the helper `gallery._escape(str)`.

## Source registry & lifecycle

Tabs are generated from the registered **sources** (`_renderTabs`) — one
`<button data-action="method" data-method="<id>">` per source, labelled by
`source.options.label` (falling back to `source.id`), escaped. The active
source's `renderArea(gallery)` fills the upload area (`_renderActiveArea`).

Source contract (see [Sources & Targets](plugins/README.md) for the full guide):

```
{ id, options.label, init(gallery), renderArea(gallery) → html, destroy() }
```

Optional lifecycle hooks, called by the core:

- `onShow(gallery)` — the source's tab became active **while the panel is open**
  (on `openUpload`, on `setMethod` to this source while open, or on register if
  it's the active tab and the panel is already open).
- `onHide(gallery)` — the source's tab is leaving (on `closeUpload`, or
  `setMethod` away). Release resources here (camera stops its stream, Uppy tears
  down its dashboard).

This gating means the camera is only requested once the user actually opens the
camera tab, and is released when they leave it or close the panel.

## Ingest pipeline & limits

Sources acquire bytes/urls and hand them to the core through **one** path, so
every method behaves identically regardless of source or target:

```
ingest([{ file } | { url, … }])  →  target.store(acq, ctx)  →  addAsset  →  _insertAsset()
```

- `ingest` (public) enforces the **gallery** limit (`maxItems`, overflow →
  `labels.limitReached`) and the **per-file** size limit (`maxSizeMB` →
  `labels.tooLarge` + `onReject`), then routes each acquisition through the active
  target's `store()` (or the built-in `_localStore` when no target is set).
- `addFiles(fileList)` is a thin wrapper: `ingest(files.map(f => ({ file: f })))`.
- `addAsset` has a hard `isFull()` backstop and assigns the id; `_insertAsset` is
  the only place a card is created (also used by `_loadItems`, which bypasses limits).

Targets get a `ctx`: `ctx.objectUrl(blob)` creates a **core-tracked** object URL
(the built-in local target uses this for file previews), `ctx.progress(msg)`
surfaces an upload-progress line. The core revokes only URLs **it** created;
caller/target-supplied URLs (server/S3/remote) are never revoked. Revocation
happens in `removeAsset`, `clear`, and `destroy`.

## Capacity UX

When `maxItems` is set, capacity is surfaced proactively:

- The footer counter shows `n de max` (via `labels.counter`).
- At capacity the root gets `.is-full` → the counter turns amber and any
  `.photon-dropzone` is dimmed.
- Plugins check `isFull()` and call `showError(labels.galleryFull(max))` instead
  of opening a dead-end picker; batch ingest reports overflow via `limitReached`.

## Delete confirmation

Each card's trash button is **confirm-in-place**: the first click arms the card
(`.is-confirming` swaps the trash icon for ✓/✕ and tints the border). Only one
card is armed at a time (arming another disarms the first), and it auto-cancels
after ~4s. The ✓ confirms (animated removal), ✕ cancels. Set
`confirmRemove: false` to delete on the first click.

## Item click (preview/download hook)

Every card's preview is an activatable control. Clicking (or Enter/Space when
focused) fires `onItemClick(gallery, asset, id)`. The core ships **no** previewer
or downloader — branch on `asset.ext` in your handler. `getImages()` helps build
a lightbox gallery. The demo wires:

```js
onItemClick: (g, asset) => {
  const ext = (asset.ext || '').toUpperCase();
  if (['JPG','JPEG','PNG','GIF','WEBP'].includes(ext)) openImagePreviewer(g, asset);
  else if (ext === 'PDF' && asset.url) openPdf(asset.url, asset.name);
  else downloadAsset(asset);
}
```

## Animations

`_shouldAnimate()` = `options.animate && !prefers-reduced-motion`. When off,
everything degrades to instant (and the root gets `.mg-no-motion`).

- New user-added cards enter via the `mg-card-in` keyframe (`.is-entering`).
  Initial `items` do **not** animate.
- Removed cards exit via the `.is-removing` transition (`_removeCardNode` defers
  detach until `transitionend`, with a setTimeout fallback).
- Panel reveal (`.is-open`) and the toggle icon morph (`.is-rotated`).

Keep new durations ~0.25–0.3s for consistency.

## Keyboard & accessibility

- The dropzones and card previews are focusable `role="button"` elements with
  `aria-label`s, and have visible `:focus-visible` rings.
- A single generic `keydown` handler activates **any** focusable `role="button"`
  via Enter/Space (it synthesizes a click that both the core and plugins receive).
  Native `<button>`s (tabs, remove/save, camera controls) handle keys themselves.

## Events & DOM contract

The core attaches **two** delegated listeners on `gallery.container`: `click` and
`keydown`. Plugins add their own (change/drag/submit/etc.).

Core `data-action` values (on `click`): `toggle-upload`, `open-upload`, `method`
(uses `data-method`), `item` (uses `data-id`), `remove`, `remove-confirm`,
`remove-cancel`, `save`.

Stable `data-role` hooks in the scaffold: `upload-panel`, `tabs`, `upload-area`,
`upload-error`, `grid`, `empty`, `counter`, `toggle-icon`, `toggle-text`. Plugins
add their own elements inside `upload-area`, scoped by `data-plugin="<id>"`.

## CSS contract

- Root class `.hpv-mixed-gallery`; **every** rule is scoped under it.
- Internal structural classes are plain kebab-case: `library-card`, `mini-view`,
  `photon-dropzone`, `format-badge`, `empty-state-wrapper`, …
- Component helpers are `mg-*`: `mg-thumb`, `mg-accent-btn`, `mg-tab-active`,
  `mg-counter`, `mg-card-actions`, `mg-confirm`, `mg-camera*`, `mg-xhr-progress`, …
- State is expressed via classes — `is-open`, `is-rotated`, `is-full`,
  `is-confirming`, `is-removing`, `is-entering`, `is-dragover`, `mg-no-motion` —
  and `data-*` attributes.
- Layout/buttons rely on Bulma; icons on FontAwesome. Both are host-page deps.

## Errors

`HpvMixedGalleryError extends Error` is thrown when the container id can't be
resolved. Filenames/URLs interpolated into HTML are escaped via `_escape()`
(covers attribute context), guarding against malformed names.

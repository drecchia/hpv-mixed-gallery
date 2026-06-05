# hpv-mixed-gallery

Mixed media (documents + images) upload gallery, distilled from the Photon UX
prototype into a single vanilla-JS class. Progressive-disclosure upload panel
(local / camera tabs + dropzone), a type-aware card grid, an empty state, and a
footer counter + save action.

## Dependencies

Host page must load **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).
See `index.html` for the CDN tags. The component ships its own scoped CSS.

## Usage

```html
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css">
<div id="media-library"></div>
<script src="src/js/hpv-mixed-gallery.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    items: [{ name: 'config.pdf', size: '2.4 MB', ext: 'PDF' }],
    onSave: (c, assets) => console.log(assets),
  });
</script>
```

## Options

| Option          | Type     | Default | Notes                                   |
| --------------- | -------- | ------- | --------------------------------------- |
| `items`         | array    | `[]`    | Initial assets `{ name, size, ext }` (optional `url` for previewing). |
| `accept`        | string   | `''`    | Native `<input accept>` filter.         |
| `maxSizeMB`     | number   | `15`    | Reject files larger than this; `0`/`null` = no limit. |
| `maxItems`      | number   | `0`     | Max assets the gallery can hold; `0` = unlimited.     |
| `enableCamera`  | boolean  | `true`  | Show the "Captura de Câmera" tab.       |
| `animate`       | boolean  | `true`  | Micro-interactions; set `false` to disable. |
| `confirmRemove` | boolean  | `true`  | Inline confirm before a card is deleted. |
| `cameraSnapAsset`| object  | `{ name, size, ext }` | Asset added by the simulated camera capture. |
| `labels`        | object   | pt-BR   | All user-facing copy — see below. Merged one level deep, so override individual keys. |
| `onAdd`         | function | `null`  | `fn(component, asset)`                   |
| `onRemove`      | function | `null`  | `fn(component, id, asset)`              |
| `onReject`      | function | `null`  | `fn(component, file, reason)` — e.g. `'too-large'`. |
| `onItemClick`   | function | `null`  | `fn(component, asset, id)` — fired when any card is clicked; branch on `asset.ext`. |
| `onSave`        | function | `null`  | `fn(component, assets)`                  |
| `onCreate`      | function | `null`  | `fn(component)`                          |
| `isDebug`       | boolean  | `false` | Routes `debug()` to `console`.          |

### `labels`

All copy lives here (pt-BR defaults). Strings: `title`, `subtitle`, `addButton`,
`closeButton`, `sourceLabel`, `tabLocal`, `tabCamera`, `localTitle`, `acceptHint`,
`cameraTitle`, `cameraHint`, `sectionTitle`, `emptyTitle`, `emptyText`,
`emptyButton`, `saveButton`, `removeTitle`, `confirmRemoveTitle`, `cancelTitle`.
Functions: `counter(n, max)` → string (`max` is `0` when no `maxItems` limit),
`tooLarge(name, limitMB, sizeText)` → string, `galleryFull(max)` → string,
`limitReached(max, rejected)` → string.

```js
new HpvMixedGallery('id', {
  labels: { title: 'Files & Images', counter: (n) => `${n} item(s)` },
});
```

## Public API

`addAsset({name, size, ext, url?})` → id · `removeAsset(id)` · `getAssets()` ·
`getImages()` (image-type assets only) · `getCount()` · `clear()` ·
`openUpload()` / `closeUpload()` / `toggleUpload()` ·
`setMethod('local' | 'camera')` · `destroy()`

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
  under the dropzone — no `alert()`. The `labels.acceptHint` text is
  independent, so keep it in sync with `maxSizeMB` if you change the limit.
- Deleting a card asks for confirmation in place: the trash icon morphs into
  ✓ / ✕; only one card can be armed at a time and it auto-cancels after ~4 s.
- With `maxItems` set, the footer counter shows capacity (`3 de 10`) and turns
  amber at the ceiling. Uploads beyond the limit are blocked: a batch fills up
  to capacity and reports the overflow; clicking a full dropzone explains how to
  free space (remove an item) instead of opening an empty picker.

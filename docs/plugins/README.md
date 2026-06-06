# Plugins — the upload-method system

Every **upload method** in hpv-mixed-gallery is a plugin. The core ships no
upload UI; you register one or more plugins and each becomes a tab in the
"Origem do arquivo" segmented control. This mirrors hpv-mini-gallery's plugin
approach, adapted to the mixed-gallery's tabbed panel.

- [Registering](#registering)
- [The contract](#the-contract)
- [Lifecycle hooks](#lifecycle-hooks)
- [Plugin-facing core API](#plugin-facing-core-api)
- [Conventions](#conventions)
- [Write your own](#write-your-own)
- [Shipped plugins](#shipped-plugins)

## Registering

```js
const gallery = new HpvMixedGallery('media-library', { maxItems: 12 });
gallery.registerUploadPlugin(new HpvLocalUpload());   // first → active tab
gallery.registerUploadPlugin(new HpvCameraCapture());
```

- Register **after** construction. The **first** registered plugin is the active
  tab.
- Each registration (re)renders the tab row and the active area.
- `gallery.unregisterUploadPlugin(plugin)` removes it (and calls its `destroy()`).
- `gallery.setMethod(pluginId)` switches tabs programmatically.

The tab **label** is `plugin.options.label` (falling back to `plugin.id`), so it
is configurable per plugin: `new HpvLocalUpload({ label: 'Do computador' })`.

## The contract

A plugin is any object/instance with:

| Member | Required | Purpose |
|--------|----------|---------|
| `id` | ✅ | Unique string; used as the tab's `data-method` and to scope the plugin's DOM (`data-plugin="<id>"`). |
| `options.label` | recommended | The tab button text (defaults to `id`). |
| `init(gallery)` | ✅ | Store the gallery ref and add your delegated listeners on `gallery.container`. |
| `renderArea(gallery)` → html string | ✅ | The HTML shown in the upload area when this plugin's tab is active. |
| `destroy()` | ✅ | Remove your listeners / release resources. |
| `onShow(gallery)` | optional | Tab became active while the panel is open. |
| `onHide(gallery)` | optional | Tab is leaving / panel closing. |

The core inserts your `renderArea()` HTML into the shared upload area and calls
the lifecycle hooks; **your own** event handling drives the rest.

## Lifecycle hooks

The core calls these (when present), gated to when the panel is open:

- `onShow(gallery)` — on `openUpload`, on `setMethod` to this plugin (panel open),
  or on register if this is the active tab and the panel is already open.
- `onHide(gallery)` — on `closeUpload`, or on `setMethod` away from this plugin.

Use them to acquire/release scarce resources. Examples in this repo: the camera
starts/stops its `getUserMedia` stream; the Uppy plugin mounts/tears down its
Dashboard instance.

Plugins that are pure DOM (local/xhr/s3/url) don't need the hooks — their
listeners are delegated on the container and survive area re-renders.

## Plugin-facing core API

What a plugin may use on the `gallery` it's given:

| Member | Use |
|--------|-----|
| `gallery.container` | Attach delegated listeners; query your elements. |
| `gallery.options` | Read config, incl. `options.labels` (for `galleryFull`, etc.). |
| `gallery.uploadMethod` | The active plugin id (to check if you're active). |
| `gallery.isUploadOpen` | Whether the panel is open. |
| `gallery.addFiles(fileList)` | Ingest `File`s — enforces size/capacity, creates object URLs, shows errors. |
| `gallery.addAsset({name,size,ext,url})` → id | Add one asset directly (when you already have a URL, e.g. camera/url/server). |
| `gallery.isFull()` | Capacity check. |
| `gallery.showError(msg)` / `clearError()` | Surface a calm message in the panel. |
| `gallery._escape(str)` | HTML-escape strings you interpolate into `renderArea`. |

**Rule of thumb:** if you have raw `File` objects, use `addFiles` (so the core
handles limits + object-URL lifecycle + thumbnails). If you only have a URL
(remote/server/signed), use `addAsset({ …, url })`.

## Conventions

- **Scope your DOM** with `data-plugin="<id>"` and query within
  `gallery.container`. Two plugins' listeners coexist on the container; each
  ignores events that don't match its own elements.
- **Delegate** on `gallery.container` in `init`, and remove the exact same
  handler refs in `destroy`. The area is re-rendered on tab switches, so
  delegation (not per-element binding) is required.
- **Escape** any string interpolated into `renderArea` via `gallery._escape`.
- **Capacity:** check `gallery.isFull()` before acquiring/uploading and call
  `gallery.showError(gallery.options.labels.galleryFull(gallery.options.maxItems))`.

## Write your own

A minimal "paste-from-clipboard-as-text-file" plugin:

```js
class HpvClipboardText {
  constructor(opts = {}) {
    this.id = opts.id || 'clipboard';
    this.options = { label: opts.label || 'Texto', addLabel: opts.addLabel || 'Colar', ...opts };
  }
  init(gallery) {
    this.gallery = gallery;
    this._onClick = (e) => {
      if (!e.target.closest(`[data-role="paste"][data-plugin="${this.id}"]`)) return;
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        if (this.gallery.isFull()) {
          const o = this.gallery.options;
          return this.gallery.showError(o.labels.galleryFull(o.maxItems));
        }
        const file = new File([text], `nota-${Date.now()}.txt`, { type: 'text/plain' });
        this.gallery.addFiles([file]); // core makes the object URL + card
      });
    };
    gallery.container.addEventListener('click', this._onClick);
  }
  renderArea(g) {
    const esc = (s) => g._escape(s);
    return `<button class="button is-small is-dark mg-accent-btn"
              type="button" data-role="paste" data-plugin="${esc(this.id)}">${esc(this.options.addLabel)}</button>`;
  }
  destroy() {
    if (this.gallery) this.gallery.container.removeEventListener('click', this._onClick);
    this.gallery = null;
  }
}

gallery.registerUploadPlugin(new HpvClipboardText());
```

## Shipped plugins

| Plugin | File | Summary |
|--------|------|---------|
| [`HpvLocalUpload`](local-upload.md) | `local-upload.js` | File picker + whole-panel drag-and-drop. |
| [`HpvCameraCapture`](camera-capture.md) | `camera-capture.js` | Real WebRTC: live preview + capture (needs HTTPS/localhost). |
| [`HpvXhrUpload`](xhr-upload.md) | `xhr-upload.js` | Multipart `POST` per file with progress. |
| [`HpvUppyUpload`](uppy-upload.md) | `uppy-upload.js` | Inline Uppy Dashboard (needs the Uppy bundle). |
| [`HpvS3Upload`](s3-upload.md) | `s3-upload.js` | Direct browser→S3 signed upload (PUT/POST). |
| [`HpvUrlImport`](url-import.md) | `url-import.js` | Add a file from a pasted remote URL. |

All six follow the same constructor shape: `new Plugin(options)` where `options`
always includes at least `id` and `label`. See each doc for the full option set.

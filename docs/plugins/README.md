# Sources & Targets — the upload plugin system

Uploading is split into two composable, separately-registered concerns:

- **Source** — *where bytes come from* (local picker, camera, URL, Uppy). Each is
  a **tab** in the panel and acquires files/urls.
- **Target** — *where they're stored* (kept in the gallery, POSTed to a server,
  uploaded to S3). The active target is **integrator config**, not a tab.

This decomposition (see [the proposal](../proposals/source-target.md)) removes the
source × target combinatorial explosion: any source composes with any target.

- [Registering](#registering)
- [Source contract](#source-contract)
- [Target contract](#target-contract)
- [Lifecycle hooks](#lifecycle-hooks)
- [Plugin-facing core API](#plugin-facing-core-api)
- [Conventions](#conventions)
- [Write your own](#write-your-own)
- [Shipped sources & targets](#shipped-sources--targets)
- [Back-compat](#back-compat)

## Registering

```js
const g = new HpvMixedGallery('media-library', { maxItems: 12 });
g.registerSource(new HpvLocalSource());    // first → active tab
g.registerSource(new HpvCameraSource());
g.registerSource(new HpvUrlSource());
g.setTarget(new HpvS3Target({ sign }));    // where everything goes (default: gallery/local)
```

- Register **sources** after construction; the first is the active tab. Their
  `options.label` drives the tab text (configurable).
- Set **one** target with `setTarget` (or pass `{ target }` in the constructor).
  No `setTarget` → the built-in **local** target (keep in the gallery).
- `unregisterSource(source)` removes a tab; `setMethod(id)` switches tabs.

## Source contract

```js
{
  id: string,                      // tab id + DOM scope (data-plugin="<id>")
  options: { label: string, ... }, // label = tab text
  init(gallery): void,             // store ref; add delegated listeners on gallery.container
  renderArea(gallery): string,     // the tab's HTML
  destroy(): void,                 // remove your listeners / release resources
  onShow?(gallery): void,          // optional: tab active + panel open
  onHide?(gallery): void,          // optional: tab left / panel closed
}
```

A source acquires bytes/urls then calls **`gallery.ingest([...acquisitions])`**
(or `gallery.addFiles(fileList)` for raw `File`s). It does **not** decide storage.

An **acquisition** is `{ file: File }` or `{ url, name?, ext? }`.

## Target contract

```js
{
  id: string,
  // Persist ONE acquisition; resolve to the asset to add, or null to skip.
  // Throw an Error(message) on failure — the core surfaces it via showError.
  store(acq, ctx): Promise<{ name, size?, ext?, url? } | null>,
}
```

`ctx` given to `store()`:

| Member | Purpose |
|--------|---------|
| `ctx.gallery` / `ctx.options` / `ctx.labels` | the instance + config |
| `ctx.objectUrl(blob) => url` | a **core-tracked** object URL (revoked on remove/`clear`/`destroy`) |
| `ctx.progress(msg)` | show an upload-progress line in the panel |

The core calls `store()` **after** enforcing capacity + per-file size, so a target
only persists and returns the asset. A target that needs bytes for a `{ url }`
acquisition should fetch it (the shipped XHR/S3 targets do, CORS-permitting).

## Lifecycle hooks

The core calls these on **sources** (when present), gated to when the panel is
open: `onShow` (tab became active) / `onHide` (tab leaving / panel closing). Use
them to acquire/release resources — the camera starts/stops `getUserMedia`, Uppy
mounts/tears down its Dashboard.

## Plugin-facing core API

| Member | Use |
|--------|-----|
| `gallery.ingest(acquisitions)` | the chokepoint — capacity + size + active target + add. |
| `gallery.addFiles(fileList)` | convenience: `ingest(files.map(f => ({file:f})))`. |
| `gallery.addAsset({name,size,ext,url})` | add one asset directly (bypasses the target). |
| `gallery.isFull()` | capacity check. |
| `gallery.showError(msg)` / `clearError()` | panel messages. |
| `gallery.container`, `gallery.options`, `gallery.uploadMethod`, `gallery.isUploadOpen` | read state. |
| `gallery._escape(str)` | escape strings for `renderArea`. |

## Conventions

- **Scope** source DOM with `data-plugin="<id>"`; query within `gallery.container`.
- **Delegate** listeners on `gallery.container` in `init`; remove them in
  `destroy` (the area re-renders on tab switch).
- **Escape** strings interpolated into `renderArea` via `gallery._escape`.
- Sources hand bytes to the core; **targets** are where network/storage logic
  lives. If you have raw `File`s, prefer `ingest`/`addFiles` (so limits + object
  URLs are handled centrally).

## Write your own

A **source** (clipboard text):

```js
class HpvClipboardSource {
  constructor(o = {}) { this.id = o.id || 'clipboard'; this.options = { label: o.label || 'Texto', ...o }; }
  init(g) { this.gallery = g; this._onClick = (e) => {
    if (!e.target.closest(`[data-plugin="${this.id}"]`)) return;
    navigator.clipboard.readText().then((t) => t && g.ingest([{ file: new File([t], `nota-${Date.now()}.txt`, { type: 'text/plain' }) }]));
  }; g.container.addEventListener('click', this._onClick); }
  renderArea(g) { return `<button class="button is-small is-dark mg-accent-btn" type="button" data-plugin="${g._escape(this.id)}">Colar</button>`; }
  destroy() { this.gallery?.container.removeEventListener('click', this._onClick); this.gallery = null; }
}
```

A **target** (anything with `store`):

```js
class HpvConsoleTarget {
  id = 'console';
  async store(acq, ctx) {
    const f = acq.file ?? new File([], acq.name || 'ref');
    console.log('would upload', f.name);
    return { name: f.name, size: '', ext: (f.name.split('.').pop() || '').toUpperCase(),
             url: acq.url ?? ctx.objectUrl(f) };
  }
}
g.setTarget(new HpvConsoleTarget());
```

## Shipped sources & targets

| Sources (`src/js/sources/`) | Targets (`src/js/targets/`) |
|---|---|
| [`HpvLocalSource`](sources.md#hpvlocalsource) — picker + drag-drop | **built-in local** (default; no file) — keep in the gallery |
| [`HpvCameraSource`](sources.md#hpvcamerasource) — real WebRTC | [`HpvXhrTarget`](targets.md#hpvxhrtarget) — multipart `POST` |
| [`HpvUrlSource`](sources.md#hpvurlsource) — paste a URL | [`HpvS3Target`](targets.md#hpvs3target) — direct-to-S3 signed |
| [`HpvUppySource`](sources.md#hpvuppysource) — Uppy Dashboard | |
| [`HpvTelegramSource`](sources.md#hpvtelegramsource) — Telegram→WS (QR) | |
| [`HpvClipboardSource`](sources.md#hpvclipboardsource) — paste image/URL | |

Full options in [sources.md](sources.md) and [targets.md](targets.md).

## Back-compat

`registerUploadPlugin(plugin)` / `unregisterUploadPlugin(plugin)` are deprecated
aliases of `registerSource`/`unregisterSource`. A combo "upload plugin" still
works — it's a source that does its own storage (calls `addFiles`/`addAsset`
directly) instead of relying on a target.

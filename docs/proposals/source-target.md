# Proposal: split upload plugins into Source + Target

**Status:** ✅ implemented · **Date:** 2026-06-06

> Implemented: core `registerSource`/`setTarget`/`ingest` (+ `registerUploadPlugin`
> alias); sources in `src/js/sources/`, targets in `src/js/targets/`; the built-in
> local store is the default target. See [../plugins/README.md](../plugins/README.md).

## Problem

Today every upload **method** is a single plugin, and the shipped plugins
conflate two orthogonal concerns:

- **Source** — where the bytes come from (local picker, camera, URL, Uppy, …).
- **Target** — where they're stored (kept in the gallery, POSTed to a server,
  uploaded to S3, …).

This causes two problems:

1. **Combinatorial explosion.** sources × targets. We already have the local
   picker re-implemented in three plugins (Upload Local, Servidor/XHR, Amazon S3)
   that differ only in *target*. Adding "camera → S3" or "URL → server" would
   mean yet more combo-plugins.
2. **Duplication.** The local picker + drag-drop code is copy-pasted across
   Local / XHR / S3.

A 2-step **stepper** ("pick source → pick target") was considered and rejected on
low-cognitive-load grounds: it taxes the common case (local → gallery is ~90% of
use and should be ~1 action), and target is almost always an integrator config
decision, not a per-upload user choice. See the design review that produced this
proposal. **Decompose in the architecture, not in the UI** — keep the UI as one
decision (source tabs); make target a configured concern.

## Design

### `Acquisition` — what a source hands the core

Either bytes or a remote reference:

```js
{ file: File }                                  // raw bytes (pick, camera, clipboard, fetched URL, Uppy)
{ url: string, name?: string, ext?: string }    // remote reference, no bytes (URL "reference" mode)
```

### `Source` — a tab that acquires files (UI)

Same shape as today's plugins, minus storage. It acquires, then calls
`gallery.ingest([...acquisitions])`.

```js
interface Source {
  id: string;                       // tab id + DOM scope (data-source="<id>")
  options: { label: string, ... };  // label drives the tab button
  init(gallery): void;              // delegated listeners on gallery.container
  renderArea(gallery): string;      // tab UI (html)
  onShow?(gallery): void;           // optional lifecycle (camera stream, Uppy mount)
  onHide?(gallery): void;
  destroy(): void;
}
```

### `Target` — where acquired files are stored (config, not a tab)

The core enforces capacity + size **before** calling `store()`, so a target only
persists and returns the asset to add.

```js
interface Target {
  id: string;
  // Persist ONE acquisition; resolve to the asset to add, or null to skip.
  store(acq: Acquisition, ctx): Promise<{ name, size?, ext?, url? } | null>;
}
```

`ctx` given to `store()`:

| Member | Purpose |
|--------|---------|
| `ctx.gallery` | the instance |
| `ctx.options` / `ctx.labels` | config |
| `ctx.objectUrl(blob) => url` | a **core-tracked** object URL (revoked on remove/`clear`/`destroy`) |
| `ctx.progress(msg)` | surface upload progress in the panel |

`ctx.objectUrl` keeps the object-URL lifecycle centralized: only the local target
asks for one; server/S3 targets return their own (untracked) URLs.

### Core orchestration (the new chokepoint)

`addFiles` becomes a thin wrapper; everything funnels through `ingest`:

```js
// new public API
registerSource(source)     // → a tab (replaces registerUploadPlugin)
setTarget(target)          // → integrator config; default = new HpvLocalTarget()

addFiles(fileList)         // = ingest([...fileList].map(f => ({ file: f })))

async ingest(acquisitions) {
  for (const acq of acquisitions) {
    if (this.isFull()) { this.showError(labels.limitReached(max, remaining)); break; }
    if (acq.file && tooBig(acq.file)) { this.showError(labels.tooLarge(...)); continue; }
    try {
      const asset = await this._target.store(acq, this._ctx());   // ← the only seam
      if (asset) this.addAsset(asset);
    } catch (e) { this.showError(...); }
  }
}
```

Capacity, per-file size, object-URL tracking, error copy, newest-first ordering,
and animations all stay in the core — exactly where they belong (confirmed by the
dogfood pass: limits/URL lifecycle/messaging are core concerns).

## The three targets

```js
class HpvLocalTarget {            // default — keep in the gallery
  id = 'local';
  async store(acq, ctx) {
    if (acq.url) return { name: acq.name, ext: acq.ext, url: acq.url };      // reference, as-is
    return { name: acq.file.name, size: fmt(acq.file.size),
             ext: ext(acq.file.name), url: ctx.objectUrl(acq.file) };        // tracked blob URL
  }
}

class HpvXhrTarget {              // POST to a server
  constructor(o){ this.endpoint = o.endpoint; this.parse = o.responseParser; /*…*/ }
  async store(acq, ctx) {
    const file = acq.file ?? await fetchToFile(acq.url);                     // url→bytes if needed
    const url  = await xhrPost(this.endpoint, file, ctx.progress);          // returns parsed file URL
    return { name: file.name, size: fmt(file.size), ext: ext(file.name), url };
  }
}

class HpvS3Target {              // direct browser→S3
  constructor(o){ this.sign = o.sign; /*…*/ }
  async store(acq, ctx) {
    const file   = acq.file ?? await fetchToFile(acq.url);
    const signed = await this.sign(file);
    await s3PutOrPost(signed, file, ctx.progress);
    return { name: file.name, size: fmt(file.size), ext: ext(file.name),
             url: publicUrl(file, signed) };
  }
}
```

## The four sources (the tabs)

```js
class HpvLocalSource  { /* picker + drag-drop → gallery.ingest(files.map(f => ({ file: f }))) */ }
class HpvCameraSource { /* webcam frame → ingest([{ file: jpegBlobAsFile }]) */ }
class HpvUrlSource    { /* paste URL → ingest([{ url }])  (or { file } in fetch mode) */ }
class HpvUppySource   { /* dashboard → ingest(files.map(f => ({ file: namedFile }))) */ }
```

## Re-map: today → source + target

| Today's tab | Source | Target |
|---|---|---|
| Upload Local | `HpvLocalSource` | `HpvLocalTarget` |
| Captura de Câmera | `HpvCameraSource` | *(active target)* |
| Servidor (XHR) | `HpvLocalSource` | `HpvXhrTarget` |
| Amazon S3 | `HpvLocalSource` | `HpvS3Target` |
| Por URL | `HpvUrlSource` | `HpvLocalTarget` |
| Uppy | `HpvUppySource` | `HpvLocalTarget` / `HpvXhrTarget` |

**6 combo-plugins → 4 sources + 3 targets = 7 modules**, the local-picker code
exists **once**, and free new combos fall out (camera → S3, URL → server, …) with
no new plugin.

## Wiring (UI stays one decision)

```js
const g = new HpvMixedGallery('media-library', { maxItems: 12 });
g.setTarget(new HpvS3Target({ sign }));   // config: where everything goes (default LocalTarget)
g.registerSource(new HpvLocalSource());   // tab
g.registerSource(new HpvCameraSource());  // tab
g.registerSource(new HpvUrlSource());     // tab
// tabs = sources; target is implicit. No stepper.
```

## Migration & open questions

- **Back-compat:** keep `registerUploadPlugin` as a deprecated shim — a combo-
  plugin is a Source whose acquire calls a baked-in Target. Lets us migrate
  incrementally rather than breaking the current API in one go.
- **Multi-target (only if a real product need):** add a persistent target
  dropdown later; `setTarget` already models the switch — still no per-upload
  stepper. Pays off at ≥2 user-meaningful targets.
- **`fetchToFile`** (URL → bytes for server/S3 targets) is CORS-bound; the local
  target keeps URL references without fetching.
- **Source tab scaling:** fine to ~5–6 tabs; beyond that, group or "+ more".
- **Naming:** `registerSource`/`setTarget` vs keeping `registerUploadPlugin` for
  combos — decide before implementing.

## Cost

Moderate refactor of the six plugins into 4 sources + 3 targets + a `Target`
interface and the `ingest`/`setTarget`/`registerSource` core methods. Net **less**
code (the duplicated local picker collapses to one). UI cost ~zero (tabs stay).
No behavior change for the existing combinations.

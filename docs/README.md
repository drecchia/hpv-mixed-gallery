# hpv-mixed-gallery — documentation

A vanilla-JS mixed-media (documents + images) upload gallery with a
progressive-disclosure panel whose **upload methods are registered plugins**, a
type-aware card grid, an empty state, capacity limits, inline delete-confirm,
calm micro-interactions, and preview/download hooks.

No build step, no dependencies to bundle — plain `<script>`/`<link>` tags. The
host page provides **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).

## Documentation map

| Area | Document |
|------|----------|
| **Core** — the `HpvMixedGallery` class: options, public API, asset model, ingest pipeline, limits, animations, delete-confirm, events, CSS, plugin registry | [core.md](core.md) |
| **Plugins** — the upload-plugin system, the contract, how to write one, and the six shipped plugins | [plugins/README.md](plugins/README.md) |

### Shipped plugins

| Plugin | Class | Doc |
|--------|-------|-----|
| Local file (picker + drag-drop) | `HpvLocalUpload` | [plugins/local-upload.md](plugins/local-upload.md) |
| Camera (real WebRTC) | `HpvCameraCapture` | [plugins/camera-capture.md](plugins/camera-capture.md) |
| XHR upload to a server | `HpvXhrUpload` | [plugins/xhr-upload.md](plugins/xhr-upload.md) |
| Uppy Dashboard | `HpvUppyUpload` | [plugins/uppy-upload.md](plugins/uppy-upload.md) |
| Direct-to-S3 signed upload | `HpvS3Upload` | [plugins/s3-upload.md](plugins/s3-upload.md) |
| Paste a remote URL | `HpvUrlImport` | [plugins/url-import.md](plugins/url-import.md) |

## 60-second start

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.3/css/bulma.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css" />

<div id="media-library"></div>

<script src="src/js/hpv-mixed-gallery.js"></script>
<script src="src/js/plugins/local-upload.js"></script>
<script src="src/js/plugins/camera-capture.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    maxItems: 12,
    onSave: (g, assets) => console.log('save', assets),
  });
  // upload methods are plugins — register them (first registered = active tab)
  gallery.registerUploadPlugin(new HpvLocalUpload());
  gallery.registerUploadPlugin(new HpvCameraCapture());
</script>
```

With no plugin registered the upload panel has no methods (empty tabs); the rest
of the gallery (grid, delete, save, preview hooks) still works.

## Repository layout

```
src/js/hpv-mixed-gallery.js     core class (HpvMixedGallery + HpvMixedGalleryError)
src/js/plugins/*.js             one file per upload plugin
src/css/hpv-mixed-gallery.css   all styles, scoped under .hpv-mixed-gallery
index.html                      runnable demo (registers all six plugins)
docs/                           this documentation
```

> The demo (`index.html`) wires every plugin and external dep (hpv-image-previewer,
> pdf.js, Uppy) to show preview/download end-to-end; see each plugin doc for the
> host-side bits a real integration needs.

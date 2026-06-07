# hpv-mixed-gallery — documentation

A vanilla-JS mixed-media (documents + images) upload gallery with a
progressive-disclosure panel whose uploads are split into composable
**sources** (where bytes come from — the tabs) and **targets** (where they're
stored), a type-aware card grid, an empty state, capacity limits, inline
delete-confirm, calm micro-interactions, and preview/download hooks.

No build step, no dependencies to bundle — plain `<script>`/`<link>` tags. The
host page provides **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).

## Documentation map

| Area | Document |
|------|----------|
| **Core** — the `HpvMixedGallery` class: options, public API, asset model, ingest pipeline, limits, animations, delete-confirm, events, CSS, source/target registry | [core.md](core.md) |
| **Sources & Targets** — the upload system, both contracts, lifecycle hooks, how to write one | [plugins/README.md](plugins/README.md) |
| **Sources** — the shipped tabs (local, camera, Uppy, clipboard, w2ws) | [plugins/sources.md](plugins/sources.md) |
| **Targets** — the storage backends (built-in local, XHR, S3) | [plugins/targets.md](plugins/targets.md) |
| **Proposal** — the source/target design rationale (implemented) | [proposals/source-target.md](proposals/source-target.md) |

## 60-second start

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.3/css/bulma.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css" />

<div id="media-library"></div>

<script src="src/js/hpv-mixed-gallery.js"></script>
<script src="src/js/sources/local.js"></script>
<script src="src/js/sources/camera.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    maxItems: 12,
    onSave: (g, assets) => console.log('save', assets),
  });
  // sources are the tabs (first registered = active); the target is where the
  // bytes go (default: keep in the gallery).
  gallery.registerSource(new HpvLocalSource());
  gallery.registerSource(new HpvCameraSource());
  // gallery.setTarget(new HpvS3Target({ sign }));  // optional: upload to S3
</script>
```

With no source registered the upload panel has no tabs; the rest of the gallery
(grid, delete, save, preview hooks) still works.

## Repository layout

```
src/js/hpv-mixed-gallery.js     core class (HpvMixedGallery + HpvMixedGalleryError)
src/js/sources/*.js             one file per upload source (a tab)
src/js/targets/*.js             one file per storage target
src/css/hpv-mixed-gallery.css   all styles, scoped under .hpv-mixed-gallery
index.html                      runnable demo (4 sources + a target picker)
docs/                           this documentation
```

> The demo (`index.html`) wires every source/target and external dep
> (hpv-image-previewer, pdf.js, Uppy) plus a destination picker to show source ×
> target composability and preview/download end-to-end.

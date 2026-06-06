# `HpvUppyUpload` — Uppy Dashboard

File: `src/js/plugins/uppy-upload.js`

Mounts an inline [Uppy](https://uppy.io) Dashboard in the active tab. Two modes:
add chosen files straight to the gallery (`local`), or upload them via Uppy's
XHRUpload to a server (`xhr`).

## Requirements

Uppy must be on the page (the bundle exposes `window.Uppy` with `Uppy.Uppy`,
`Uppy.Dashboard`, `Uppy.XHRUpload`) plus its CSS:

```html
<link rel="stylesheet" href="https://releases.transloadit.com/uppy/v3.27.3/uppy.min.css" />
<script src="https://releases.transloadit.com/uppy/v3.27.3/uppy.min.js"></script>
<script src="src/js/plugins/uppy-upload.js"></script>
```

If Uppy isn't loaded, the area shows a "Uppy não está carregado…" message.

## Usage

```js
// local: chosen files are added to the gallery (no server)
gallery.registerUploadPlugin(new HpvUppyUpload({ mode: 'local' }));

// xhr: Uppy uploads to your endpoint; assets added on upload-success
gallery.registerUploadPlugin(new HpvUppyUpload({
  mode: 'xhr',
  endpoint: 'https://api.example.com/upload',
  fieldName: 'file',
}));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'uppy'` | Tab id / DOM scope. |
| `label` | string | `'Uppy'` | Tab button text. |
| `mode` | `'local' \| 'xhr'` | `'local'` | See behavior below. |
| `endpoint` | string | `'/upload'` | XHRUpload endpoint (mode `'xhr'`). |
| `fieldName` | string | `'file'` | XHRUpload form field. |
| `height` | number | `320` | Dashboard height (px). |
| `note` | string | `'Imagens e documentos'` | Dashboard note line. |
| `uppyOptions` | object | `{}` | Spread into `new Uppy.Uppy(...)`. |
| `dashboardOptions` | object | `{}` | Spread into `.use(Uppy.Dashboard, ...)`. |
| `missingText` | string | … | Message when Uppy isn't loaded. |

## Behavior & lifecycle

- Uses `onShow`/`onHide`: the Uppy instance is **created** when the tab opens and
  **torn down** (`uppy.close()`) when leaving / closing — no orphaned instances.
- **`local`** — on `file-added`, the file is wrapped in a named `File`
  (`new File([file.data], file.name, …)`) and passed to `gallery.addFiles`, then
  removed from the dashboard to keep it tidy. The named-File wrap matters: some
  Uppy sources (Webcam/Url) yield a nameless `Blob`, which the core would
  otherwise drop.
- **`xhr`** — Uppy's XHRUpload handles the upload; on `upload-success` the asset
  is added with `response.uploadURL` / `response.body.url` (if any).

## Notes

- Uppy renders its own styled UI; it coexists with the Bulma page.
- To enable Uppy sources like Webcam or Url, add those Uppy plugins via
  `uppyOptions`/your own setup; the `local` handler already supports their
  nameless-Blob data.

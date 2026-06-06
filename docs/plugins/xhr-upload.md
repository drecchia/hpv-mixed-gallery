# `HpvXhrUpload` — upload to a server (XHR)

File: `src/js/plugins/xhr-upload.js`

A dropzone (click + drag, like the local plugin) where each file is `POST`ed to
an endpoint as `multipart/form-data` with progress. On success the asset is added
using the URL the server returns (parsed via `responseParser`).

## Usage

```html
<script src="src/js/plugins/xhr-upload.js"></script>
```

```js
gallery.registerUploadPlugin(new HpvXhrUpload({
  label: 'Servidor',
  endpoint: 'https://api.example.com/upload',
  fieldName: 'file',
  headers: { Authorization: 'Bearer …' },
  responseParser: (text) => JSON.parse(text).fileUrl,   // → the stored file URL
}));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'server'` | Tab id / DOM scope. |
| `label` | string | `'Enviar ao servidor'` | Tab button text. |
| `title` / `hint` | string | dropzone copy | Heading / sub-text. |
| `accept` / `multiple` | string / boolean | `''` / `true` | Picker filters. |
| `endpoint` | string | `'/upload'` | Upload URL (`POST`). |
| `fieldName` | string | `'file'` | The multipart field name for the file. |
| `headers` | object | `{}` | Extra request headers. |
| `withCredentials` | boolean | `false` | Send cookies/credentials. |
| `timeout` | number | `60000` | Per-request timeout (ms). |
| `responseParser` | `(text, file) => url \| {name,size,ext,url}` | `null` | Extract the stored file URL (or a full asset). Default heuristic: parse JSON and use `json.url \|\| json.location`, else the body if it looks like a URL. |
| `onUploadSuccess` | `(file, xhr, gallery)` | `null` | After a successful upload. |
| `onUploadError` | `(file, reason, gallery)` | `null` | On failure (also shows an inline error). |

## Behavior

- Click → picker (or `galleryFull` when full); drag-drop on the open panel.
- Each file is uploaded independently; a small progress line shows `Enviando … %`.
- On `2xx`: parses the response and calls `gallery.addAsset({ name, size, ext, url })`
  (the `url` is what makes the card previewable/downloadable). On non-2xx /
  network / timeout: `gallery.showError(...)` + `onUploadError`.
- Capacity is enforced before each upload.

## Notes

- The server should return the **stored file URL** so cards can preview/download.
  Provide a `responseParser` matching your API's response shape.
- Cross-origin uploads require the server to send appropriate CORS headers.

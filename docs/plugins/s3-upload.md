# `HpvS3Upload` — direct-to-S3 signed upload

File: `src/js/plugins/s3-upload.js`

Uploads files **straight from the browser to S3**. The browser never holds AWS
credentials: for each file it asks **your backend** for signed upload params,
then uploads the bytes to S3. Supports both presigned **PUT** (raw bytes) and
presigned **POST** (policy `fields`). On success the asset is added with its
public URL.

## Signing (provide one)

- `sign(file, gallery) => Promise<SignResult>` — call your backend, return:

  ```ts
  SignResult = {
    method?: 'PUT' | 'POST',   // default: options.method
    url: string,               // presigned PUT URL, or the bucket POST URL
    fields?: Record<string,string>, // presigned POST policy fields (POST only)
    headers?: Record<string,string>, // extra headers for the PUT
    publicUrl?: string,        // the file's public URL (for the card)
  }
  ```

- `signEndpoint` — if you don't pass `sign`, the plugin `POST`s
  `{ name, type, size }` (JSON) to this URL and expects that `SignResult` back.

## Usage

```html
<script src="src/js/plugins/s3-upload.js"></script>
```

```js
gallery.registerUploadPlugin(new HpvS3Upload({
  label: 'Amazon S3',
  sign: async (file) => {
    const r = await fetch('/api/s3-sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    return r.json(); // { method:'PUT', url, publicUrl } | { method:'POST', url, fields }
  },
}));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'s3'` | Tab id / DOM scope. |
| `label` | string | `'Amazon S3'` | Tab button text. |
| `title` / `hint` | string | dropzone copy | Heading / sub-text. |
| `accept` / `multiple` | string / boolean | `''` / `true` | Picker filters. |
| `sign` | `(file, gallery) => Promise<SignResult>` | `null` | Get signed params (see above). |
| `signEndpoint` | string | `null` | Alternative to `sign`: the plugin calls it. |
| `signMethod` | string | `'POST'` | HTTP method for `signEndpoint`. |
| `signHeaders` | object | `{ 'Content-Type': 'application/json' }` | Headers for `signEndpoint`. |
| `method` | `'PUT' \| 'POST'` | `'PUT'` | Upload method when the signer doesn't specify. |
| `fieldName` | string | `'file'` | File field for presigned POST. |
| `headers` | object | `{}` | Extra headers on the S3 request. |
| `withCredentials` | boolean | `false` | Credentials for the sign request. |
| `timeout` | number | `60000` | Upload timeout (ms). |
| `publicUrl` | `(file, signed) => string` | `null` | Override how the stored URL is derived. |
| `onUploadProgress` | `(file, pct, gallery)` | `null` | Progress callback. |
| `onUploadSuccess` | `(file, url, signed, gallery)` | `null` | After success. |
| `onUploadError` | `(file, reason, gallery)` | `null` | On failure. |
| `onSignError` | `(file, reason, gallery)` | `null` | On signing failure. |

## Behavior

- **PUT** flow: `PUT signed.url` with the raw file body; sets `Content-Type` to
  the file's type (plus `signed.headers`/`options.headers`).
- **POST** flow: `POST signed.url` with a `FormData` of `signed.fields` then the
  file under `fieldName`; the browser sets the multipart `Content-Type`.
- **Public URL** for the card: `options.publicUrl(file, signed)` → else
  `signed.publicUrl` → else derived (PUT: `url` minus query string; POST:
  `url + '/' + fields.key`).
- Progress line, capacity enforcement, and inline errors are handled like the
  other dropzone plugins.

## Notes

- Configure the S3 bucket CORS to allow `PUT`/`POST` from your origin (and the
  headers you send).
- The browser holds no secrets — all signing happens server-side.

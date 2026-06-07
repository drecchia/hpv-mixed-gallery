# Targets

A **target** is where acquired files are stored. It's set once (`gallery.setTarget(...)`
or the `target` constructor option) — it is **not** a tab. Every [source](sources.md)
composes with the active target. Files live in `src/js/targets/`.

A target implements `store(acq, ctx) => Promise<asset | null>` — see the
[target contract](README.md#target-contract). The core enforces capacity + size
**before** calling `store()`, so a target only persists and returns the asset.

## Built-in local target (default)

No `setTarget` → files are kept in the gallery. `{ file }` gets a **tracked
object URL** (preview/download), `{ url }` is stored by reference (no fetch). This
is the core's `_localStore` — there is no class to import. To be explicit you can
`setTarget(null)` to restore it. When `thumbnails` is on, `acq.thumb` also gets a
tracked object URL → `thumbUrl` (so the card shows the small thumb).

## HpvXhrTarget

`src/js/targets/xhr.js` — uploads each file to a server as `multipart/form-data`
with progress, then stores the asset using the URL the server returns.

```js
gallery.setTarget(new HpvXhrTarget({
  endpoint: 'https://api.example.com/upload',
  headers: { Authorization: 'Bearer …' },
  responseParser: (text) => JSON.parse(text).fileUrl,
}));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'xhr'` | target id |
| `endpoint` | `'/upload'` | upload URL (`POST`) |
| `fieldName` | `'file'` | multipart file field |
| `thumbFieldName` | `'thumb'` | multipart field for the thumbnail |
| `headers` | `{}` | extra request headers |
| `withCredentials` | `false` | send cookies/credentials |
| `timeout` | `60000` | per-request timeout (ms) |
| `responseParser` | `null` | `(text, file) => url \| { url } \| { name, size, ext, url }`. Default: parse JSON → `url`/`location`, else the body if URL-like. |

A `{ url }` acquisition (from the URL source) is fetched to bytes first
(CORS-permitting). Failures throw → the core shows the message. When a thumbnail
is present (`thumbnails` on), it's POSTed in a **second** request under
`thumbFieldName` (file named `<name>.thumb.<ext>`) and returned as `thumbUrl`.

## HpvS3Target

`src/js/targets/s3.js` — direct browser→S3 signed upload. The browser holds no
AWS keys: per file it gets signed params from **your backend**, then PUTs the raw
bytes (or POSTs the policy) straight to S3, and stores the asset with its public
URL.

```js
gallery.setTarget(new HpvS3Target({
  sign: async (file) => {
    const r = await fetch('/api/s3-sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    return r.json(); // { method:'PUT', url, publicUrl } | { method:'POST', url, fields }
  },
}));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'s3'` | target id |
| `sign` | `null` | `(file) => Promise<{ method?, url, fields?, headers?, publicUrl? }>` |
| `signEndpoint` | `null` | alternative to `sign`: the target POSTs `{name,type,size}` and expects that JSON |
| `signMethod` / `signHeaders` | `'POST'` / JSON | for `signEndpoint` |
| `method` | `'PUT'` | upload method when the signer doesn't specify |
| `fieldName` | `'file'` | file field for presigned POST |
| `headers` | `{}` | extra headers on the S3 request |
| `withCredentials` | `false` | credentials for the sign request |
| `timeout` | `60000` | upload timeout (ms) |
| `publicUrl` | `null` | `(file, signed) => url` to override the stored URL |

**Public URL** for the card: `publicUrl(file, signed)` → else `signed.publicUrl`
→ else derived (PUT: `url` minus query; POST: `url + '/' + fields.key`).
Configure the bucket's CORS to allow your origin + method/headers.

When a thumbnail is present (`thumbnails` on), it's **signed and uploaded too**
(file named `<name>.thumb.<ext>` — your backend gets a second `sign` call) and
returned as `thumbUrl`.

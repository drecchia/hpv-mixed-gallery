# Sources

A **source** is a tab that acquires files/urls and hands them to the core via
`gallery.ingest(...)` / `gallery.addFiles(...)`. Storage is the [target](targets.md)'s
job — every source composes with every target. Files live in `src/js/sources/`.

See the [contract & conventions](README.md#source-contract). All take
`new Source(options)` with at least `id` and `label`.

## HpvLocalSource

`src/js/sources/local.js` — dashed dropzone: native file picker on click + drag-
and-drop over the whole open panel. Hands files to `gallery.addFiles`.

```js
g.registerSource(new HpvLocalSource({ label: 'Do computador', accept: '.pdf,.jpg', multiple: true }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'local'` | tab id / scope |
| `label` | `'Upload Local'` | tab text |
| `title` | "Clique para buscar…" | dropzone heading + aria-label |
| `hint` | "Formatos aceitos…" | dropzone sub-text |
| `accept` | `''` | native `<input accept>` |
| `multiple` | `true` | allow multiple files |

Behavior: click → picker (or `galleryFull` when full); drop on the open panel
(the dashed box highlights). Keyboard-activatable (`role="button"`).

## HpvCameraSource

`src/js/sources/camera.js` — **real WebRTC**: live `<video>` preview; capture →
JPEG blob → `File` → `gallery.addFiles`. Needs a **secure context** (HTTPS /
`http://localhost`). Starts the stream on `onShow`, stops on `onHide`/`destroy`.

```js
g.registerSource(new HpvCameraSource({ maxWidth: 1920, quality: 0.9, facingMode: 'user' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'camera'` | tab id |
| `label` | `'Captura de Câmera'` | tab text |
| `idleText` | `'Iniciando câmera…'` | status while starting |
| `captureLabel` | `'Capturar'` | capture button |
| `flipLabel` | `'Trocar câmera'` | flip button title |
| `quality` | `0.85` | JPEG quality |
| `maxWidth` | `1280` | downscale wider captures |
| `facingMode` | `'environment'` | `'environment'` / `'user'` |
| `fileName` | `ts => `camera-${ts}.jpg`` | capture file name |
| `unsupportedText` | … | message when getUserMedia is unavailable |

For headless testing: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.

## HpvUrlSource

`src/js/sources/url.js` — a URL field + Add button. Emits a `{ url, name, ext }`
acquisition (no fetch); the **target** decides what to do with it (the local
target stores the URL by reference; server/S3 targets fetch the bytes first).

```js
g.registerSource(new HpvUrlSource({ label: 'Link externo' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'url'` | tab id |
| `label` | `'Por URL'` | tab text |
| `placeholder` | "https://exemplo.com/arquivo.jpg" | input placeholder |
| `hint` | … | sub-text |
| `addLabel` | `'Adicionar'` | submit button |
| `validate` | `url => /^https?:\/\//i.test(url)` | URL validation |
| `nameFrom` | `null` | `(url) => name` override |
| `invalidText` | "Informe uma URL http(s) válida." | error |

Type is inferred from the URL extension; extensionless URLs are generic files —
pass `nameFrom` to supply a filename with an extension when needed.

## HpvUppySource

`src/js/sources/uppy.js` — inline [Uppy](https://uppy.io) Dashboard; chosen files
are handed to `gallery.addFiles` (→ active target). Requires the Uppy bundle on
the page (`window.Uppy` + its CSS). Mounts on `onShow`, tears down on `onHide`.

```js
g.registerSource(new HpvUppySource({ height: 360, note: 'Imagens e documentos' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'uppy'` | tab id |
| `label` | `'Uppy'` | tab text |
| `height` | `320` | dashboard height |
| `note` | `'Imagens e documentos'` | dashboard note |
| `uppyOptions` / `dashboardOptions` | `{}` | spread into `new Uppy.Uppy()` / `.use(Dashboard, …)` |
| `missingText` | … | shown if Uppy isn't loaded |

Files are wrapped in a named `File` before `addFiles` (Uppy's Webcam/Url sources
yield a nameless `Blob`, which the core would otherwise drop).

## HpvTelegramSource

`src/js/sources/telegram.js` — bridges a **Telegram bot** into the gallery over a
**WebSocket** (the `node-telegram2ws` bridge). It shows a
**QR code**; the user scans it to open a Telegram bot session, then the photos
they send in Telegram stream in and are handed to `gallery.addFiles` (→ the active
target, so Telegram photos compose with any storage).

```js
g.registerSource(new HpvTelegramSource({ url: 'wss://bridge.example.com' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'telegram'` | tab id |
| `label` | `'Telegram'` | tab text |
| `url` | `'ws://localhost:8081'` | the node-telegram2ws WebSocket endpoint |
| `locale` | browser language | sent in `create_session` |
| `clientMeta` | `null` | optional `{ timezone, … }` sent in `create_session` |
| `pingInterval` | `25000` | heartbeat ping (ms) |
| `title` / `steps` / `openLabel` / `connectingText` / `waitingHint` / `receivedText(n)` / `expiredText` / `retryLabel` / `errorText` / `mediaErrorText` | pt-BR | UI copy |

**Protocol** (`FORWARD_PICTURE` mode):
`→ create_session` ⟶ `← session_created { qrPayload, deepLink, expiresAt }` (QR
shown) ⟶ `← media_forward { messageId, media:{ mime, data, metadata } }` →
`→ ack { messageId }` (the bridge resends/times out at 10s). `media.data` may be a
data URL (Jimp `getBase64`) or bare base64 — both are handled. The session TTL is
~5 min; a live countdown is shown and on expiry a **Gerar novo QR** button
regenerates it; `session_error`/`error`/disconnect show a retry button.

**Lifecycle:** the WebSocket opens on tab-show (`onShow`) and closes on
tab-hide/`destroy` — the bridge cleans the session up on disconnect, so the user
should stay on the tab while sending photos.

**Setup:** requires the `node-telegram2ws` bridge running (a Telegram bot token +
the WS server). Point `url` at it; cross-origin needs `wss://` from an HTTPS page.
For a local demo without a real bot, run the bundled zero-dep mock —
`node mock/telegram2ws-mock.js` — and use its `/sim` page to push photos (see
[mock/README.md](../../mock/README.md)).

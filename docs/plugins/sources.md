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
| `url` | `'ws://localhost:8081'` | the bridge WebSocket endpoint |
| `protocol` | `'telegram2ws'` | wire protocol: `'telegram2ws'` or `'i2w'` (see below) |
| `locale` | browser language | sent in `create_session` (telegram2ws) |
| `clientMeta` | `null` | optional `{ timezone, … }` sent in `create_session` (telegram2ws) |
| `pingInterval` | `25000` | heartbeat ping (ms, telegram2ws) |
| `title` / `steps` / `openLabel` / `connectingText` / `waitingHint` / `receivedText(n)` / `expiredText` / `retryLabel` / `errorText` / `mediaErrorText` | pt-BR | UI copy |

**Protocols.** Two wire formats are supported (`protocol` option):

- **`telegram2ws`** (default, `FORWARD_PICTURE` mode):
  `→ create_session` ⟶ `← session_created { qrPayload, deepLink, expiresAt }`
  (QR + deep-link button + ~5 min countdown shown) ⟶
  `← media_forward { messageId, media:{ mime, data, metadata } }` →
  `→ ack { messageId }` (bridge resends/times out at 10s). On expiry a
  **Gerar novo QR** button regenerates; `session_error`/`error`/disconnect → retry.
- **`i2w`** (the `@i2w_bot` bridge): **no handshake or ack** — on connect the server
  pushes `← { type:'qrcode', base64 }` (QR shown; no deep link / countdown) and then
  `← { type:'image', base64, mime }` per photo. `base64` is a full data URL.

`media.data` / `base64` may be a data URL or bare base64 — both are handled.

**Lifecycle:** the WebSocket opens on tab-show (`onShow`) and closes on
tab-hide/`destroy` — the bridge cleans the session up on disconnect, so the user
should stay on the tab while sending photos.

**Setup:** requires the `node-telegram2ws` bridge running (a Telegram bot token +
the WS server). Point `url` at it; cross-origin needs `wss://` from an HTTPS page.
For a local demo without a real bot, run the bundled zero-dep mock —
`node mock/telegram2ws-mock.js` — and use its `/sim` page to push photos (see
[mock/README.md](../../mock/README.md)).

## HpvClipboardSource

`src/js/sources/clipboard.js` — paste from the clipboard. Two ways in: press
**Ctrl/Cmd+V** while the tab is open (a `paste` event), or click the button
(async Clipboard API, needs a user gesture + permission). Images become files; a
copied **http(s) URL** becomes a `{ url }` acquisition. Zero-dependency.

```js
g.registerSource(new HpvClipboardSource({ label: 'Colar' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'clipboard'` | tab id |
| `label` | `'Colar'` | tab text |
| `title` / `hint` / `pickLabel` | pt-BR | prompt + button copy |
| `emptyText` | "Nenhuma imagem ou link…" | clipboard had nothing usable |
| `deniedText` | "Sem acesso à área de transferência — use Ctrl+V." | permission denied / no async API |

The paste listener is global but **only acts while this tab is the active, open
one** (so it never hijacks pasting elsewhere). The async button path requires a
secure context + clipboard-read permission; if unavailable it points the user to
Ctrl+V. Composes with any target (paste → S3, etc.).

## HpvW2wsSource

`src/js/sources/w2ws.js` — bridges the **node-w2ws** "Web-to-WebSocket" service:
a QR opens the bridge's own **mobile uploader page**, and the phone streams files
(chunked, checksum-verified, resumable) over a relayed WebSocket. Each finished
file is handed to `gallery.addFiles` → the active target.

Thin wrapper around the bridge's reference client **`W2WSConsumer`** (vendored at
`src/vendor/w2ws-consumer.js`, a `window` global) — like `HpvUppySource` wraps
Uppy. The client does the reassembly, SHA-256 verification, resume and reconnect;
this source renders the QR and feeds completed blobs into the gallery.

```html
<script src="src/vendor/w2ws-consumer.js"></script>
<script src="src/js/sources/w2ws.js"></script>
```

```js
g.registerSource(new HpvW2wsSource({ url: 'wss://w2ws.example.com/ws' }));
```

| Option | Default | Notes |
|--------|---------|-------|
| `id` | `'w2ws'` | tab id |
| `label` | `'Celular (QR)'` | tab text |
| `url` | `''` | the bridge WS endpoint `wss://host/ws` (**required** — the client otherwise defaults to the current host, wrong from `file://`/another origin) |
| `opts` | derived | `create_session` opts, **merged over** defaults derived from the gallery (`maxFiles ← maxItems`, `maxFileBytes ← maxSizeMB`, `locale`) — e.g. `{ locale: 'pt-BR' }` overrides just the locale. Server clamps to its ceilings. |
| `title` / `steps` / `openLabel` / `connectingText` / `waitingHint` / `connectedHint` / `receivedText(n)` / `expiredText` / `retryLabel` / `errorText` / `checksumErrorText` / `missingText` | pt-BR | UI copy |

**Behavior:** shows the QR (`qrPayload`) + a fallback link (`publicUrl`) + an
expiry countdown; `onUploader` updates the status; **checksum-failed files are
dropped** with an error; `session_expired`/errors show a **Gerar novo QR** retry.
A consumer reconnect mints a new session → the client re-fires `onSession` and the
QR re-renders. Filenames/MIME from the phone are untrusted — they only ever become
a `File` name, never HTML (the core escapes everything it renders).

**Setup:** needs a running node-w2ws bridge and `consumer-client.js` on the page
(vendored here). Point `url` at the bridge; use `wss://` from an HTTPS page. No
bridge-side change is required — the consumer side is unauthenticated in v1 (if the
bridge later adds consumer auth/Origin allowlisting, pass it via `opts`/allowlist
your origin).

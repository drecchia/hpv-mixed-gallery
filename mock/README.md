# Mock — telegram2ws bridge

A **zero-dependency** stand-in for the `node-telegram2ws` bridge, so you can demo
the [`HpvTelegramSource`](../docs/plugins/sources.md#hpvtelegramsource) end-to-end
without a real Telegram bot. Pure Node (built-in `http` + `crypto`, hand-rolled
WebSocket) — no `npm install`.

## Run

```bash
node mock/telegram2ws-mock.js
# optional: a real-looking bot name + a LAN-reachable host for phone scanning
TELEGRAM_BOT_NAME=YourBot MOCK_HOST=192.168.1.20:8081 node mock/telegram2ws-mock.js
```

Then open `index.html` and click the **Telegram** tab. The demo already registers
`new HpvTelegramSource()` pointed at `ws://localhost:8081`, so the QR appears
immediately.

| Env | Default | Purpose |
|-----|---------|---------|
| `WEBSOCKET_PORT` | `8081` | WS + HTTP port (match the source's `url`). |
| `TELEGRAM_BOT_NAME` | `Telegram2WsDemoBot` | Bot name in the deep link. |
| `MOCK_HOST` | `localhost:<port>` | Host used in links (set to your LAN IP for phone scanning). |

## How it works

- The gallery connects over WebSocket and sends `create_session`.
- The mock replies `session_created` with a **QR** (`qrPayload`) that is an
  `api.qrserver.com` SVG encoding the **real Telegram deep link**
  `https://t.me/<bot>?start=FORWARD_PICTURE:<session>` — the `?start=` payload is
  the bot's initial message, exactly like the real bridge.
- A photo sent for that session is pushed back as `media_forward` (the source
  `ack`s it) and appears in the gallery via the active target.

## Sending a photo

- **With a real bot:** scan the QR — it opens Telegram and links the session.
- **Without a bot (mock testing):** open the **simulator** page the mock serves:

  ```
  http://localhost:8081/sim
  ```

  It targets the latest active session; pick an image (or click *gerar uma imagem
  de teste*) and it streams into the gallery.

## HTTP endpoints (used by the simulator)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/sim` | The phone simulator page. |
| `GET` | `/sessions` | JSON list of active session ids. |
| `POST` | `/send` | `{ s, name, mime, data }` (data = data URL/base64) → pushes `media_forward`. |

> Dev mock only — it implements the `FORWARD_PICTURE` happy path, not the full
> protocol (no FILL_FORM/AI, no Redis, no real Telegram). For production use the
> actual `node-telegram2ws` server.

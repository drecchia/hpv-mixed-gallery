# `HpvCameraCapture` — camera capture (real WebRTC)

File: `src/js/plugins/camera-capture.js`

A live `<video>` preview inside the active tab. The capture button draws the
current frame to a canvas, encodes a JPEG **blob**, wraps it in a `File`, and
feeds it to `gallery.addFiles` — so the captured photo flows through the core's
limits, object-URL lifecycle, and thumbnail rendering like any uploaded image.

## Requirements

`navigator.mediaDevices.getUserMedia` requires a **secure context** — HTTPS or
`http://localhost`. It does **not** work from `file://`. Without permission/camera
the area shows a message instead of crashing.

## Usage

```html
<script src="src/js/plugins/camera-capture.js"></script>
```

```js
gallery.registerUploadPlugin(new HpvCameraCapture());

// or configured
gallery.registerUploadPlugin(new HpvCameraCapture({
  label: 'Câmera',
  maxWidth: 1920,
  quality: 0.9,
  facingMode: 'user',          // front camera
}));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'camera'` | Tab id / DOM scope. |
| `label` | string | `'Captura de Câmera'` | Tab button text. |
| `idleText` | string | `'Iniciando câmera…'` | Status shown while starting / between states. |
| `captureLabel` | string | `'Capturar'` | Capture button text. |
| `flipLabel` | string | `'Trocar câmera'` | Flip button title/aria-label. |
| `quality` | number | `0.85` | JPEG quality 0–1. |
| `maxWidth` | number | `1280` | Captures wider than this are downscaled (aspect kept). |
| `facingMode` | string | `'environment'` | Initial camera: `'environment'` (back) or `'user'` (front). |
| `fileName` | `(ts) => string` | `` ts => `camera-${ts}.jpg` `` | Names the captured file (`ts` = `Date.now()`). |
| `unsupportedText` | string | "Câmera indisponível — requer HTTPS ou localhost e permissão." | Shown when getUserMedia is unavailable/blocked. |

## Behavior & lifecycle

- Uses `onShow`/`onHide`: the stream starts when you open the camera tab (panel
  open) and **stops** when you switch tabs or close the panel (`track.stop()`),
  releasing the camera — privacy-correct. Reopening restarts it.
- The capture button is enabled only after `loadedmetadata` (so `videoWidth` is
  known); the flip button re-acquires the stream with the other `facingMode`.
- On capture: frame → canvas (downscaled to `maxWidth`) → `canvas.toBlob('image/jpeg', quality)`
  → `new File([blob], fileName(Date.now()))` → `gallery.addFiles([file])`.
- Respects capacity: when full, capture shows `galleryFull` and adds nothing.

## Notes

- The stage is a fixed-height (240px) cover-fit preview so the controls always
  fit within the panel.
- For headless testing, launch Chrome with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.

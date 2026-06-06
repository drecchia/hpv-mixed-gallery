# `HpvLocalUpload` — local file upload

File: `src/js/plugins/local-upload.js`

A dashed dropzone that opens the native file picker on click and accepts
drag-and-drop. Files are handed to the core via `gallery.addFiles`, so the core
enforces size/capacity, creates object URLs, and renders thumbnails.

## Usage

```html
<script src="src/js/plugins/local-upload.js"></script>
```

```js
gallery.registerUploadPlugin(new HpvLocalUpload());

// or configured
gallery.registerUploadPlugin(new HpvLocalUpload({
  label: 'Do computador',
  accept: '.pdf,.jpg,.png',
  multiple: true,
}));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'local'` | Tab id / DOM scope. |
| `label` | string | `'Upload Local'` | Tab button text. |
| `title` | string | `'Clique para buscar ou arraste seu arquivo para cá'` | Dropzone heading + aria-label. |
| `hint` | string | `'Formatos aceitos: PDF, XLSX, JPG, PNG até 15MB'` | Dropzone sub-text. Keep in sync with the core's `maxSizeMB` if you change it. |
| `accept` | string | `''` | Native `<input accept>` filter. |
| `multiple` | boolean | `true` | Allow selecting/dropping multiple files. |

## Behavior

- **Click** the dropzone → opens the hidden `<input type="file">`. If the gallery
  is full, shows `galleryFull` instead of opening an empty picker.
- **Drag-and-drop** targets the **whole open panel** (not just the dashed box) —
  a near-miss otherwise lets the browser open the dropped file and replace the
  app. The dashed box highlights (`.is-dragover`) while dragging over the panel.
- Selected/dropped files go to `gallery.addFiles(files)`; the input is reset
  after each change so the same file can be picked twice.
- Keyboard-accessible: the dropzone is a focusable `role="button"`; Enter/Space
  opens the picker.

## Notes

- No external dependency.
- Works from `file://` and any origin.

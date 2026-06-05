# hpv-mixed-gallery

Mixed media (documents + images) upload gallery, distilled from the Photon UX
prototype into a single vanilla-JS class. Progressive-disclosure upload panel
(local / camera tabs + dropzone), a type-aware card grid, an empty state, and a
footer counter + save action.

## Dependencies

Host page must load **Bulma 1.0.x** (layout/buttons) and **FontAwesome 6** (icons).
See `index.html` for the CDN tags. The component ships its own scoped CSS.

## Usage

```html
<link rel="stylesheet" href="src/css/hpv-mixed-gallery.css">
<div id="media-library"></div>
<script src="src/js/hpv-mixed-gallery.js"></script>
<script>
  const gallery = new HpvMixedGallery('media-library', {
    items: [{ name: 'config.pdf', size: '2.4 MB', ext: 'PDF' }],
    onSave: (c, assets) => console.log(assets),
  });
</script>
```

## Options

| Option        | Type     | Default            | Notes                                   |
| ------------- | -------- | ------------------ | --------------------------------------- |
| `items`       | array    | `[]`               | Initial assets `{ name, size, ext }`.   |
| `title`       | string   | `'Arquivos e Imagens'` | Header title.                       |
| `subtitle`    | string   | …                  | Header subtitle.                        |
| `acceptHint`  | string   | …                  | Dropzone helper text.                   |
| `saveLabel`   | string   | `'Salvar Galeria'` | Footer button label.                    |
| `accept`      | string   | `''`               | Native `<input accept>` filter.         |
| `enableCamera`| boolean  | `true`             | Show the "Captura de Câmera" tab.       |
| `animate`     | boolean  | `true`             | Micro-interactions; set `false` to disable. |
| `onAdd`       | function | `null`             | `fn(component, asset)`                   |
| `onRemove`    | function | `null`             | `fn(component, id, asset)`              |
| `onSave`      | function | `null`             | `fn(component, assets)`                  |
| `onCreate`    | function | `null`             | `fn(component)`                          |
| `isDebug`     | boolean  | `false`            | Routes `debug()` to `console`.          |

## Public API

`addAsset({name, size, ext})` → id · `removeAsset(id)` · `getAssets()` ·
`getCount()` · `clear()` · `openUpload()` / `closeUpload()` / `toggleUpload()` ·
`setMethod('local' | 'camera')` · `destroy()`

## Behavior notes vs. the prototype

- File picker accepts **multiple** files; selecting the same file twice works
  (input is reset after each change).
- The dropzone's advertised drag-and-drop is wired up (the prototype only
  showed the affordance).
- Filenames are HTML-escaped before rendering.
- `Salvar` fires `onSave` instead of the prototype's `alert()`.

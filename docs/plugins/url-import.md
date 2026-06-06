# `HpvUrlImport` — import from a remote URL

File: `src/js/plugins/url-import.js`

A URL field + **Add** button. On submit, the asset is added referencing the
pasted URL. Two modes: store the URL as-is (`reference`), or download it
(`fetch`).

## Usage

```html
<script src="src/js/plugins/url-import.js"></script>
```

```js
gallery.registerUploadPlugin(new HpvUrlImport());

// download the URL into the gallery instead of referencing it
gallery.registerUploadPlugin(new HpvUrlImport({ label: 'Link', mode: 'fetch' }));
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | string | `'url'` | Tab id / DOM scope. |
| `label` | string | `'Por URL'` | Tab button text. |
| `placeholder` | string | `'https://exemplo.com/arquivo.jpg'` | Input placeholder. |
| `hint` | string | … | Sub-text under the field. |
| `addLabel` | string | `'Adicionar'` | Submit button text. |
| `mode` | `'reference' \| 'fetch'` | `'reference'` | See behavior. |
| `validate` | `(url) => boolean` | `url => /^https?:\/\//i.test(url)` | URL validation. |
| `nameFrom` | `(url) => string` | `null` | Override the derived file name. |
| `invalidText` | string | `'Informe uma URL http(s) válida.'` | Shown on invalid input. |
| `fetchErrorText` | string | `'Não foi possível baixar a URL.'` | Shown on fetch failure (`mode: 'fetch'`). |

## Behavior

- Submits via a `<form>` — works with both **Enter** in the field and the button.
  The input clears after a successful add.
- **`reference`** (default): adds `gallery.addAsset({ name, ext, url })` with the
  remote URL. No network call — works for cross-origin images/PDFs that allow
  hotlinking. The card uses the URL for thumbnail/preview/download.
- **`fetch`**: `fetch(url)` → blob → `new File([blob], name)` → `gallery.addFiles`
  (goes through size/capacity + object-URL). Subject to CORS.
- Validates the URL and enforces capacity; bad input / full gallery show inline
  messages.

## Type inference (caveat)

The asset's type comes from the **URL's extension** (e.g. `…/photo.jpg` → `JPG`
image thumbnail; `…/manual.pdf` → PDF card). URLs **without** an extension (many
CDN/redirect URLs) are typed as a generic file (icon, no image thumbnail). Pass
`nameFrom` to supply a sensible filename (with extension) when needed.

## Notes

- No external dependency.
- `reference` mode never downloads, so it's the most robust across origins; use
  `fetch` only when you want the bytes stored locally (CORS permitting).

// hpv-mixed-gallery source — paste from the clipboard.
// Two ways in: press Ctrl/Cmd+V while the tab is open (paste event), or click the
// button (async Clipboard API). Images become files; a copied http(s) URL becomes
// a { url } acquisition. Everything goes through gallery.ingest → the active target.

class HpvClipboardSource {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'clipboard';
		this.options = {
			label: options.label || 'Colar',
			title: options.title || 'Cole uma imagem com Ctrl+V',
			hint:
				options.hint ||
				'Imagens ou links copiados para a área de transferência',
			pickLabel: options.pickLabel || 'Colar da área de transferência',
			emptyText:
				options.emptyText ||
				'Nenhuma imagem ou link na área de transferência.',
			deniedText:
				options.deniedText ||
				'Sem acesso à área de transferência — use Ctrl+V.',
		};
	}

	init(gallery) {
		this.gallery = gallery;
		this._onClick = (e) => this._handleClick(e);
		this._onPaste = (e) => this._handlePaste(e);
		gallery.container.addEventListener('click', this._onClick);
		// paste targets the focused element / document — listen globally, but only
		// act while this source's tab is the active, open one.
		document.addEventListener('paste', this._onPaste);
	}

	renderArea(gallery) {
		const o = this.options;
		const esc = (s) => gallery._escape(s);
		return `
			<div class="mg-clipboard" data-plugin="${esc(this.id)}">
				<span class="icon is-large mb-2 mg-up-icon"><i class="fa-regular fa-clipboard fa-2x"></i></span>
				<p class="is-size-7 has-text-weight-semibold">${esc(o.title)}</p>
				<p class="is-size-7 has-text-grey mt-1 mb-3">${esc(o.hint)}</p>
				<button class="button is-small is-dark mg-accent-btn" type="button" data-role="clip-pick" data-plugin="${esc(this.id)}">
					<span class="icon"><i class="fa-regular fa-clipboard"></i></span><span>${esc(o.pickLabel)}</span>
				</button>
			</div>`;
	}

	destroy() {
		if (this.gallery)
			this.gallery.container.removeEventListener('click', this._onClick);
		document.removeEventListener('paste', this._onPaste);
		this.gallery = null;
	}

	// -- internal --

	_active() {
		return (
			this.gallery &&
			this.gallery.uploadMethod === this.id &&
			this.gallery.isUploadOpen
		);
	}

	_handlePaste(e) {
		if (!this._active()) return;
		if (this._ingestFromTransfer(e.clipboardData)) e.preventDefault();
	}

	_handleClick(e) {
		if (
			e.target.closest(
				`[data-role="clip-pick"][data-plugin="${this.id}"]`,
			)
		)
			this._pick();
	}

	// Button → async Clipboard API (needs a user gesture + permission).
	async _pick() {
		const g = this.gallery;
		const o = this.options;
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
			return;
		}
		if (!(navigator.clipboard && navigator.clipboard.read)) {
			g.showError(o.deniedText);
			return;
		}
		try {
			const items = await navigator.clipboard.read();
			const files = [];
			for (const item of items) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (type)
					files.push(this._named(await item.getType(type), type));
			}
			if (files.length) {
				g.ingest(files.map((f) => ({ file: f })));
				return;
			}
			if (navigator.clipboard.readText) {
				const text = (
					(await navigator.clipboard.readText()) || ''
				).trim();
				if (/^https?:\/\//i.test(text)) {
					g.ingest([{ url: text, name: this._nameFromUrl(text) }]);
					return;
				}
			}
			g.showError(o.emptyText);
		} catch (err) {
			g.showError(o.deniedText);
		}
	}

	// Paste event → read from the DataTransfer. Returns true if it ingested.
	_ingestFromTransfer(dt) {
		if (!dt) return false;
		const files = [];
		if (dt.files && dt.files.length) {
			for (const f of dt.files) files.push(f);
		} else if (dt.items) {
			for (const it of dt.items) {
				if (it.kind === 'file') {
					const f = it.getAsFile();
					if (f) files.push(f);
				}
			}
		}
		if (files.length) {
			this.gallery.ingest(
				files.map((f) => ({
					file: f.name ? f : this._named(f, f.type),
				})),
			);
			return true;
		}
		const text = ((dt.getData && dt.getData('text/plain')) || '').trim();
		if (/^https?:\/\//i.test(text)) {
			this.gallery.ingest([{ url: text, name: this._nameFromUrl(text) }]);
			return true;
		}
		return false;
	}

	_named(blob, type) {
		const mime = type || blob.type || 'image/png';
		const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
		return new File([blob], `colado-${Date.now()}.${ext}`, { type: mime });
	}
	_nameFromUrl(url) {
		try {
			return (
				decodeURIComponent(
					new URL(url).pathname.split('/').pop() || '',
				) || 'arquivo'
			);
		} catch (e) {
			return 'arquivo';
		}
	}
}

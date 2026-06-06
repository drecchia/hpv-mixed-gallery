// hpv-mixed-gallery plugin — import a file from a pasted remote URL.
// A URL field + Add button; on submit the asset is added referencing the URL.
//   mode: 'reference' (default) — store the URL as-is (no fetch; works for
//                                 cross-origin images/PDFs that allow hotlinking).
//   mode: 'fetch'              — fetch the URL → blob → File → addFiles (subject
//                                to CORS; goes through the core's size/object-URL).

class HpvUrlImport {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'url';
		this.options = {
			label: options.label || 'Por URL',
			placeholder:
				options.placeholder || 'https://exemplo.com/arquivo.jpg',
			hint:
				options.hint ||
				'Cole o endereço de uma imagem ou documento e clique em Adicionar',
			addLabel: options.addLabel || 'Adicionar',
			mode: options.mode || 'reference', // 'reference' | 'fetch'
			invalidText:
				options.invalidText || 'Informe uma URL http(s) válida.',
			fetchErrorText:
				options.fetchErrorText || 'Não foi possível baixar a URL.',
			validate: options.validate || ((url) => /^https?:\/\//i.test(url)),
			nameFrom: options.nameFrom || null, // (url) => name
		};
	}

	init(gallery) {
		this.gallery = gallery;
		const c = gallery.container;
		this._onSubmit = (e) => this._handleSubmit(e);
		c.addEventListener('submit', this._onSubmit);
	}

	renderArea(gallery) {
		const o = this.options;
		const esc = (s) => gallery._escape(s);
		return `
			<form class="mg-url" data-role="url-form" data-plugin="${esc(this.id)}">
				<div class="field has-addons mb-2">
					<div class="control is-expanded">
						<input class="input is-small" type="url" data-role="url-input" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.label)}" />
					</div>
					<div class="control">
						<button class="button is-small is-dark mg-accent-btn" type="submit">${esc(o.addLabel)}</button>
					</div>
				</div>
				<p class="is-size-7 has-text-grey">${esc(o.hint)}</p>
			</form>`;
	}

	destroy() {
		if (this.gallery)
			this.gallery.container.removeEventListener(
				'submit',
				this._onSubmit,
			);
		this.gallery = null;
	}

	// -- internal --

	_handleSubmit(e) {
		const form = e.target.closest(
			`[data-role="url-form"][data-plugin="${this.id}"]`,
		);
		if (!form) return;
		e.preventDefault();
		const input = form.querySelector('[data-role="url-input"]');
		const url = (input.value || '').trim();
		if (!url) return;
		this._add(url);
		input.value = '';
	}

	async _add(url) {
		const g = this.gallery;
		const o = this.options;
		if (!o.validate(url)) {
			g.showError(o.invalidText);
			return;
		}
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
			return;
		}
		g.clearError();
		const name = this._name(url);

		if (o.mode === 'fetch') {
			try {
				const res = await fetch(url);
				if (!res.ok) throw new Error('HTTP ' + res.status);
				const blob = await res.blob();
				g.addFiles([new File([blob], name, { type: blob.type })]);
			} catch (err) {
				g.showError(o.fetchErrorText);
			}
			return;
		}
		// reference mode: store the remote URL directly
		g.addAsset({ name, ext: this._ext(name), url });
	}

	_name(url) {
		if (this.options.nameFrom) return this.options.nameFrom(url);
		try {
			const path = new URL(url).pathname;
			const last = decodeURIComponent(path.split('/').pop() || '');
			return last || 'arquivo';
		} catch (e) {
			return 'arquivo';
		}
	}
	_ext(name) {
		const p = (name + '').split('.');
		return p.length > 1 ? p.pop().toUpperCase() : '';
	}
}

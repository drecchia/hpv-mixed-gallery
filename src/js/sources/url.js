// hpv-mixed-gallery source — paste a remote URL.
// Emits a { url, name, ext } acquisition; the active target decides what to do
// with it (the local target stores the URL by reference; server/S3 targets
// fetch the bytes first).

class HpvUrlSource {
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
			invalidText:
				options.invalidText || 'Informe uma URL http(s) válida.',
			validate: options.validate || ((url) => /^https?:\/\//i.test(url)),
			nameFrom: options.nameFrom || null, // (url) => name
		};
	}

	init(gallery) {
		this.gallery = gallery;
		this._onSubmit = (e) => this._handleSubmit(e);
		gallery.container.addEventListener('submit', this._onSubmit);
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

	_add(url) {
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
		const name = this._name(url);
		g.ingest([{ url, name, ext: this._ext(name) }]);
	}

	_name(url) {
		if (this.options.nameFrom) return this.options.nameFrom(url);
		try {
			const last = decodeURIComponent(
				new URL(url).pathname.split('/').pop() || '',
			);
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

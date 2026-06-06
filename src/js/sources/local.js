// hpv-mixed-gallery source — local file (picker + drag & drop).
// Acquires File objects and hands them to gallery.addFiles (→ ingest → the
// active target). What happens to the bytes is the target's job.

class HpvLocalSource {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'local';
		this.options = {
			label: options.label || 'Upload Local',
			title:
				options.title ||
				'Clique para buscar ou arraste seu arquivo para cá',
			hint:
				options.hint ||
				'Formatos aceitos: PDF, XLSX, JPG, PNG até 15MB',
			accept: options.accept || '',
			multiple: options.multiple !== false,
		};
	}

	init(gallery) {
		this.gallery = gallery;
		const c = gallery.container;
		this._onClick = (e) => this._handleClick(e);
		this._onChange = (e) => this._handleChange(e);
		this._onDragOver = (e) => this._handleDragOver(e);
		this._onDragLeave = (e) => this._handleDragLeave(e);
		this._onDrop = (e) => this._handleDrop(e);
		c.addEventListener('click', this._onClick);
		c.addEventListener('change', this._onChange);
		c.addEventListener('dragover', this._onDragOver);
		c.addEventListener('dragleave', this._onDragLeave);
		c.addEventListener('drop', this._onDrop);
	}

	renderArea(gallery) {
		const o = this.options;
		const esc = (s) => gallery._escape(s);
		return `
			<div class="photon-dropzone" data-role="dropzone" data-plugin="${esc(this.id)}" role="button" tabindex="0" aria-label="${esc(o.title)}">
				<span class="icon is-large mb-2 mg-up-icon"><i class="fa-solid fa-cloud-arrow-up fa-2x"></i></span>
				<p class="is-size-7 has-text-weight-semibold">${esc(o.title)}</p>
				<p class="is-size-7 has-text-grey mt-1">${esc(o.hint)}</p>
			</div>
			<input type="file" data-role="file-input" data-plugin="${esc(this.id)}" style="display: none;"${o.accept ? ` accept="${esc(o.accept)}"` : ''}${o.multiple ? ' multiple' : ''}>`;
	}

	destroy() {
		const c = this.gallery && this.gallery.container;
		if (c) {
			c.removeEventListener('click', this._onClick);
			c.removeEventListener('change', this._onChange);
			c.removeEventListener('dragover', this._onDragOver);
			c.removeEventListener('dragleave', this._onDragLeave);
			c.removeEventListener('drop', this._onDrop);
		}
		this.gallery = null;
	}

	// -- internal --

	_dropzone() {
		return this.gallery.container.querySelector(
			`[data-role="dropzone"][data-plugin="${this.id}"]`,
		);
	}
	_input() {
		return this.gallery.container.querySelector(
			`[data-role="file-input"][data-plugin="${this.id}"]`,
		);
	}
	_panel() {
		return this.gallery.container.querySelector(
			'[data-role="upload-panel"]',
		);
	}

	_handleClick(e) {
		if (
			!e.target.closest(
				`[data-role="dropzone"][data-plugin="${this.id}"]`,
			)
		)
			return;
		const g = this.gallery;
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
		} else {
			const input = this._input();
			if (input) input.click();
		}
	}

	_handleChange(e) {
		if (
			!e.target.matches(
				`[data-role="file-input"][data-plugin="${this.id}"]`,
			)
		)
			return;
		const files = e.target.files;
		if (files && files.length) this.gallery.addFiles(files);
		e.target.value = ''; // allow re-selecting the same file
	}

	_isDropTarget(e) {
		const g = this.gallery;
		const panel = this._panel();
		return (
			g.uploadMethod === this.id &&
			g.isUploadOpen &&
			panel &&
			panel.contains(e.target)
		);
	}
	_handleDragOver(e) {
		if (!this._isDropTarget(e)) return;
		e.preventDefault();
		const dz = this._dropzone();
		if (dz) dz.classList.add('is-dragover');
	}
	_handleDragLeave(e) {
		const panel = this._panel();
		if (panel && !panel.contains(e.relatedTarget)) {
			const dz = this._dropzone();
			if (dz) dz.classList.remove('is-dragover');
		}
	}
	_handleDrop(e) {
		if (!this._isDropTarget(e)) return;
		e.preventDefault();
		const dz = this._dropzone();
		if (dz) dz.classList.remove('is-dragover');
		const files = e.dataTransfer && e.dataTransfer.files;
		if (files && files.length) this.gallery.addFiles(files);
	}
}

// hpv-mixed-gallery plugin — XHR upload to a server.
// Picker + drag-drop like the local plugin, but each file is POSTed to an
// endpoint as multipart/form-data with progress; on success the asset is added
// using the URL the server returns (via responseParser). Ported/adapted from
// hpv-mini-gallery's file-uploader-xhr to the mixed-gallery plugin contract.

class HpvXhrUpload {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'server';
		this.options = {
			label: options.label || 'Enviar ao servidor',
			title: options.title || 'Clique ou arraste para enviar ao servidor',
			hint: options.hint || 'Os arquivos vão direto para o servidor',
			accept: options.accept || '',
			multiple: options.multiple !== false,
			endpoint: options.endpoint || '/upload',
			fieldName: options.fieldName || 'file',
			headers: options.headers || {},
			withCredentials: !!options.withCredentials,
			timeout: options.timeout || 60000,
			// responseParser(responseText, file) => url string | { name, size, ext, url }
			responseParser: options.responseParser || null,
			onUploadSuccess: options.onUploadSuccess || null,
			onUploadError: options.onUploadError || null,
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
			<input type="file" data-role="file-input" data-plugin="${esc(this.id)}" style="display: none;"${o.accept ? ` accept="${esc(o.accept)}"` : ''}${o.multiple ? ' multiple' : ''}>
			<p class="mg-xhr-progress" data-role="xhr-progress" hidden></p>`;
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
	_progress(msg) {
		const el = this.gallery.container.querySelector(
			`[data-role="xhr-progress"]`,
		);
		if (!el) return;
		if (msg) {
			el.textContent = msg;
			el.hidden = false;
		} else {
			el.hidden = true;
			el.textContent = '';
		}
	}

	_handleClick(e) {
		if (
			!e.target.closest(
				`[data-role="dropzone"][data-plugin="${this.id}"]`,
			)
		)
			return;
		const g = this.gallery;
		if (g.isFull())
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
		else {
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
		if (files && files.length) this._uploadAll(files);
		e.target.value = '';
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
		if (files && files.length) this._uploadAll(files);
	}

	_uploadAll(fileList) {
		const g = this.gallery;
		const files = Array.from(fileList);
		let done = 0;
		const total = files.length;
		files.forEach((file) => {
			if (g.isFull()) {
				g.showError(g.options.labels.galleryFull(g.options.maxItems));
				return;
			}
			this._upload(file, (ok) => {
				done++;
				if (done >= total) this._progress(''); // hide when all settled
				if (!ok) return;
			});
		});
	}

	_upload(file, cb) {
		const o = this.options;
		const g = this.gallery;
		const xhr = new XMLHttpRequest();
		const form = new FormData();
		form.append(o.fieldName, file, file.name);

		xhr.open('POST', o.endpoint, true);
		xhr.timeout = o.timeout;
		xhr.withCredentials = o.withCredentials;
		Object.keys(o.headers).forEach((k) =>
			xhr.setRequestHeader(k, o.headers[k]),
		);

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable)
				this._progress(
					`Enviando ${file.name}… ${Math.round((e.loaded / e.total) * 100)}%`,
				);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const parsed = this._parse(xhr.responseText, file);
				const url = typeof parsed === 'string' ? parsed : parsed.url;
				g.addAsset({
					name: (parsed && parsed.name) || file.name,
					size: (parsed && parsed.size) || this._fmtSize(file.size),
					ext: (parsed && parsed.ext) || this._ext(file.name),
					url: url || undefined,
				});
				if (o.onUploadSuccess) o.onUploadSuccess(file, xhr, g);
				cb(true);
			} else {
				this._fail(file, `HTTP ${xhr.status}`, cb);
			}
		};
		xhr.onerror = () => this._fail(file, 'erro de rede', cb);
		xhr.ontimeout = () => this._fail(file, 'tempo esgotado', cb);
		xhr.send(form);
	}

	_parse(text, file) {
		if (this.options.responseParser)
			return this.options.responseParser(text, file);
		try {
			const json = JSON.parse(text);
			return json.url || json.location || json;
		} catch (e) {
			return text && /^https?:|^\//.test(text.trim()) ? text.trim() : {};
		}
	}

	_fail(file, reason, cb) {
		this.gallery.showError(`Falha ao enviar "${file.name}" — ${reason}.`);
		if (this.options.onUploadError)
			this.options.onUploadError(file, reason, this.gallery);
		cb(false);
	}

	_ext(name) {
		const p = (name + '').split('.');
		return p.length > 1 ? p.pop().toUpperCase() : '';
	}
	_fmtSize(bytes) {
		const mb = bytes / 1024 / 1024;
		return mb >= 1
			? mb.toFixed(1) + ' MB'
			: Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}
}

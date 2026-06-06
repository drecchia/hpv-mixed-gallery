// hpv-mixed-gallery plugin — Amazon S3 signed upload (browser → S3 direct).
//
// The browser never holds AWS credentials. For each file it obtains signed
// upload params from YOUR backend, then uploads the bytes straight to S3.
// Two flows are supported (per file or globally via the `method` option):
//   • presigned PUT  — PUT the raw file to a presigned URL.
//   • presigned POST — POST multipart with the policy `fields` to the bucket URL.
//
// Supply ONE of:
//   sign(file, gallery) => Promise<{ method?, url, fields?, headers?, publicUrl? }>
//   signEndpoint        — the plugin POSTs { name, type, size } and expects that JSON.
//
// On success the asset is added with its public URL (option `publicUrl`, or the
// signer's `publicUrl`, or derived: PUT url minus query / POST url + fields.key).

class HpvS3Upload {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 's3';
		this.options = {
			// --- tab / dropzone UI
			label: options.label || 'Amazon S3',
			title: options.title || 'Clique ou arraste para enviar ao S3',
			hint: options.hint || 'Upload direto ao bucket via URL assinada',
			accept: options.accept || '',
			multiple: options.multiple !== false,
			// --- signing (provide sign OR signEndpoint)
			sign: options.sign || null,
			signEndpoint: options.signEndpoint || null,
			signMethod: options.signMethod || 'POST',
			signHeaders: options.signHeaders || {
				'Content-Type': 'application/json',
			},
			// --- S3 upload
			method: options.method || 'PUT', // used when the signer doesn't specify
			fieldName: options.fieldName || 'file', // presigned POST file field
			headers: options.headers || {}, // extra headers on the S3 request
			withCredentials: !!options.withCredentials, // sign request credentials
			timeout: options.timeout || 60000,
			publicUrl: options.publicUrl || null, // (file, signed) => url
			// --- callbacks
			onUploadProgress: options.onUploadProgress || null,
			onUploadSuccess: options.onUploadSuccess || null,
			onUploadError: options.onUploadError || null,
			onSignError: options.onSignError || null,
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
				<span class="icon is-large mb-2 mg-up-icon"><i class="fa-brands fa-aws fa-2x"></i></span>
				<p class="is-size-7 has-text-weight-semibold">${esc(o.title)}</p>
				<p class="is-size-7 has-text-grey mt-1">${esc(o.hint)}</p>
			</div>
			<input type="file" data-role="file-input" data-plugin="${esc(this.id)}" style="display: none;"${o.accept ? ` accept="${esc(o.accept)}"` : ''}${o.multiple ? ' multiple' : ''}>
			<p class="mg-xhr-progress" data-role="s3-progress" hidden></p>`;
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

	// -- UI plumbing (same shape as the local/xhr plugins) --

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
			'[data-role="s3-progress"]',
		);
		if (!el) return;
		el.hidden = !msg;
		el.textContent = msg || '';
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

	// -- upload --

	_uploadAll(fileList) {
		const g = this.gallery;
		Array.from(fileList).forEach((file) => {
			if (g.isFull()) {
				g.showError(g.options.labels.galleryFull(g.options.maxItems));
				return;
			}
			this._uploadOne(file);
		});
	}

	async _uploadOne(file) {
		const g = this.gallery;
		const o = this.options;
		let signed;
		try {
			signed = await this._sign(file);
		} catch (err) {
			this._fail(file, 'assinatura falhou', o.onSignError);
			return;
		}
		if (!signed || !signed.url) {
			this._fail(file, 'sem URL assinada');
			return;
		}

		const method = (signed.method || o.method).toUpperCase();
		const xhr = new XMLHttpRequest();
		xhr.open(method, signed.url, true);
		xhr.timeout = o.timeout;
		// credentials are for the (cross-origin) S3 request — usually false
		xhr.upload.onprogress = (e) => {
			if (!e.lengthComputable) return;
			const pct = Math.round((e.loaded / e.total) * 100);
			this._progress(`Enviando ${file.name}… ${pct}%`);
			if (o.onUploadProgress) o.onUploadProgress(file, pct, g);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const url = this._publicUrl(file, signed);
				g.addAsset({
					name: file.name,
					size: this._fmtSize(file.size),
					ext: this._ext(file.name),
					url: url || undefined,
				});
				if (o.onUploadSuccess) o.onUploadSuccess(file, url, signed, g);
				this._progress('');
			} else {
				this._fail(file, `HTTP ${xhr.status}`);
			}
		};
		xhr.onerror = () => this._fail(file, 'erro de rede');
		xhr.ontimeout = () => this._fail(file, 'tempo esgotado');

		if (method === 'POST') {
			// presigned POST policy: fields first, file last; let the browser set
			// the multipart Content-Type (with boundary).
			const form = new FormData();
			const fields = signed.fields || {};
			Object.keys(fields).forEach((k) => form.append(k, fields[k]));
			form.append(o.fieldName, file, file.name);
			this._setHeaders(xhr, o.headers);
			xhr.send(form);
		} else {
			// presigned PUT: raw bytes; S3 needs the object's content type.
			this._setHeaders(xhr, {
				'Content-Type': file.type || 'application/octet-stream',
				...(signed.headers || {}),
				...o.headers,
			});
			xhr.send(file);
		}
	}

	async _sign(file) {
		const o = this.options;
		if (typeof o.sign === 'function') return o.sign(file, this.gallery);
		if (!o.signEndpoint)
			throw new Error('HpvS3Upload: provide sign() or signEndpoint');
		const res = await fetch(o.signEndpoint, {
			method: o.signMethod,
			headers: o.signHeaders,
			credentials: o.withCredentials ? 'include' : 'same-origin',
			body: JSON.stringify({
				name: file.name,
				type: file.type,
				size: file.size,
			}),
		});
		if (!res.ok) throw new Error('sign endpoint ' + res.status);
		return res.json();
	}

	_publicUrl(file, signed) {
		if (this.options.publicUrl) return this.options.publicUrl(file, signed);
		if (signed.publicUrl) return signed.publicUrl;
		const method = (signed.method || this.options.method).toUpperCase();
		if (method === 'PUT') return (signed.url || '').split('?')[0];
		if (signed.fields && signed.fields.key)
			return signed.url.replace(/\/$/, '') + '/' + signed.fields.key;
		return undefined;
	}

	_setHeaders(xhr, headers) {
		Object.keys(headers).forEach((k) => {
			if (headers[k] != null) xhr.setRequestHeader(k, headers[k]);
		});
	}

	_fail(file, reason, cb) {
		this.gallery.showError(
			`Falha no upload S3 de "${file.name}" — ${reason}.`,
		);
		const handler = cb || this.options.onUploadError;
		if (handler) handler(file, reason, this.gallery);
		this._progress('');
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

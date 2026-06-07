// hpv-mixed-gallery target — upload to a server via XHR.
// store(acq, ctx): POST the file (multipart) to `endpoint`, report progress via
// ctx.progress, and resolve to the asset to add (with the server's file URL).
// Set as the storage target: gallery.setTarget(new HpvXhrTarget({ endpoint }));

class HpvXhrTarget {
	constructor(options = {}) {
		this.id = options.id || 'xhr';
		this.options = {
			endpoint: options.endpoint || '/upload',
			fieldName: options.fieldName || 'file',
			thumbFieldName: options.thumbFieldName || 'thumb', // field for the thumbnail
			headers: options.headers || {},
			withCredentials: !!options.withCredentials,
			timeout: options.timeout || 60000,
			// responseParser(text, file) => url string | { url } | { name, size, ext, url }
			responseParser: options.responseParser || null,
		};
	}

	async store(acq, ctx) {
		const file = acq.file || (await this._fetchToFile(acq.url));
		const parsed = await this._post(file, ctx);
		const url = typeof parsed === 'string' ? parsed : parsed && parsed.url;
		// upload the thumbnail too (separate field/request) so both are persisted
		let thumbUrl;
		if (acq.thumb) {
			const tfile = new File(
				[acq.thumb],
				this._thumbName(file, acq.thumb),
				{
					type: acq.thumb.type,
				},
			);
			const tp = await this._post(
				tfile,
				ctx,
				this.options.thumbFieldName,
			);
			thumbUrl = typeof tp === 'string' ? tp : tp && tp.url;
		}
		return {
			name: (parsed && parsed.name) || file.name,
			size: (parsed && parsed.size) || this._fmtSize(file.size),
			ext: (parsed && parsed.ext) || this._ext(file.name),
			url: url || undefined,
			thumbUrl: thumbUrl || undefined,
		};
	}

	_thumbName(file, thumb) {
		const ext = (thumb.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
		return file.name + '.thumb.' + ext;
	}

	// -- internal --

	_post(file, ctx, fieldName) {
		const o = this.options;
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			const form = new FormData();
			form.append(fieldName || o.fieldName, file, file.name);
			xhr.open('POST', o.endpoint, true);
			xhr.timeout = o.timeout;
			xhr.withCredentials = o.withCredentials;
			Object.keys(o.headers).forEach((k) =>
				xhr.setRequestHeader(k, o.headers[k]),
			);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable)
					ctx.progress(
						`Enviando ${file.name}… ${Math.round((e.loaded / e.total) * 100)}%`,
					);
			};
			xhr.onload = () =>
				xhr.status >= 200 && xhr.status < 300
					? resolve(this._parse(xhr.responseText, file))
					: reject(
							new Error(
								`Falha ao enviar "${file.name}" — HTTP ${xhr.status}.`,
							),
						);
			xhr.onerror = () =>
				reject(
					new Error(`Falha ao enviar "${file.name}" — erro de rede.`),
				);
			xhr.ontimeout = () =>
				reject(
					new Error(
						`Falha ao enviar "${file.name}" — tempo esgotado.`,
					),
				);
			xhr.send(form);
		});
	}

	_parse(text, file) {
		if (this.options.responseParser)
			return this.options.responseParser(text, file);
		try {
			const j = JSON.parse(text);
			return j.url || j.location || {};
		} catch (e) {
			return /^https?:|^\//.test((text || '').trim()) ? text.trim() : {};
		}
	}

	async _fetchToFile(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Não foi possível baixar ${url}.`);
		const blob = await res.blob();
		return new File([blob], this._nameFromUrl(url), { type: blob.type });
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

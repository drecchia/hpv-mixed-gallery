// hpv-mixed-gallery target — direct-to-S3 signed upload.
// store(acq, ctx): get signed params from YOUR backend (sign/signEndpoint), then
// PUT the raw bytes (or POST the policy) straight to S3, and resolve to the asset
// with its public URL. The browser never holds AWS credentials.
// Set as the storage target: gallery.setTarget(new HpvS3Target({ sign }));

class HpvS3Target {
	constructor(options = {}) {
		this.id = options.id || 's3';
		this.options = {
			sign: options.sign || null, // (file) => Promise<{ method?, url, fields?, headers?, publicUrl? }>
			signEndpoint: options.signEndpoint || null,
			signMethod: options.signMethod || 'POST',
			signHeaders: options.signHeaders || {
				'Content-Type': 'application/json',
			},
			method: options.method || 'PUT',
			fieldName: options.fieldName || 'file',
			headers: options.headers || {},
			withCredentials: !!options.withCredentials,
			timeout: options.timeout || 60000,
			publicUrl: options.publicUrl || null, // (file, signed) => url
		};
	}

	async store(acq, ctx) {
		const file = acq.file || (await this._fetchToFile(acq.url));
		const signed = await this._sign(file);
		if (!signed || !signed.url)
			throw new Error(`Sem URL assinada para "${file.name}".`);
		await this._upload(signed, file, ctx);
		// sign + upload the thumbnail too, so both are stored in the bucket
		let thumbUrl;
		if (acq.thumb) {
			const ext = (acq.thumb.type.split('/')[1] || 'webp').replace(
				'jpeg',
				'jpg',
			);
			const tfile = new File([acq.thumb], file.name + '.thumb.' + ext, {
				type: acq.thumb.type,
			});
			const tsigned = await this._sign(tfile);
			if (tsigned && tsigned.url) {
				await this._upload(tsigned, tfile, ctx);
				thumbUrl = this._publicUrl(tfile, tsigned) || undefined;
			}
		}
		return {
			name: file.name,
			size: this._fmtSize(file.size),
			ext: this._ext(file.name),
			url: this._publicUrl(file, signed) || undefined,
			thumbUrl: thumbUrl,
		};
	}

	// -- internal --

	async _sign(file) {
		const o = this.options;
		if (typeof o.sign === 'function') return o.sign(file);
		if (!o.signEndpoint)
			throw new Error('HpvS3Target: provide sign() or signEndpoint.');
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
		if (!res.ok) throw new Error('Falha ao assinar — ' + res.status);
		return res.json();
	}

	_upload(signed, file, ctx) {
		const o = this.options;
		const method = (signed.method || o.method).toUpperCase();
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open(method, signed.url, true);
			xhr.timeout = o.timeout;
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable)
					ctx.progress(
						`Enviando ${file.name}… ${Math.round((e.loaded / e.total) * 100)}%`,
					);
			};
			xhr.onload = () =>
				xhr.status >= 200 && xhr.status < 300
					? resolve()
					: reject(
							new Error(
								`Falha no upload S3 de "${file.name}" — HTTP ${xhr.status}.`,
							),
						);
			xhr.onerror = () =>
				reject(
					new Error(
						`Falha no upload S3 de "${file.name}" — erro de rede.`,
					),
				);
			xhr.ontimeout = () =>
				reject(
					new Error(
						`Falha no upload S3 de "${file.name}" — tempo esgotado.`,
					),
				);
			if (method === 'POST') {
				const form = new FormData();
				const fields = signed.fields || {};
				Object.keys(fields).forEach((k) => form.append(k, fields[k]));
				form.append(o.fieldName, file, file.name);
				this._setHeaders(xhr, o.headers);
				xhr.send(form);
			} else {
				this._setHeaders(xhr, {
					'Content-Type': file.type || 'application/octet-stream',
					...(signed.headers || {}),
					...o.headers,
				});
				xhr.send(file);
			}
		});
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

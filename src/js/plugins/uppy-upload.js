// hpv-mixed-gallery plugin — Uppy Dashboard integration.
// Mounts an inline Uppy Dashboard in the active tab. Requires Uppy on the page
// (window.Uppy, e.g. the CDN bundle + its CSS). Ported/adapted from
// hpv-mini-gallery's file-uploader-uppy to the mixed-gallery plugin contract.
//
//   mode: 'local' (default) — files chosen in the Dashboard are added straight
//                             to the gallery (gallery.addFiles); no server.
//   mode: 'xhr'             — files are uploaded via Uppy's XHRUpload to
//                             `endpoint`; assets are added on 'upload-success'.

class HpvUppyUpload {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'uppy';
		this.options = {
			label: options.label || 'Uppy',
			mode: options.mode || 'local', // 'local' | 'xhr'
			endpoint: options.endpoint || '/upload',
			fieldName: options.fieldName || 'file',
			height: options.height || 320,
			note: options.note || 'Imagens e documentos',
			uppyOptions: options.uppyOptions || {},
			dashboardOptions: options.dashboardOptions || {},
			missingText:
				options.missingText ||
				'Uppy não está carregado — inclua o bundle do Uppy na página.',
		};
		this.uppy = null;
	}

	init(gallery) {
		this.gallery = gallery;
	}

	renderArea(gallery) {
		return `<div class="mg-uppy" data-plugin="${gallery._escape(this.id)}" data-role="uppy-target"></div>`;
	}

	onShow() {
		this._mount();
	}
	onHide() {
		this._teardown();
	}

	destroy() {
		this._teardown();
		this.gallery = null;
	}

	// -- internal --

	_target() {
		return this.gallery.container.querySelector(
			`[data-role="uppy-target"][data-plugin="${this.id}"]`,
		);
	}

	_mount() {
		const target = this._target();
		if (!target) return;
		if (typeof Uppy === 'undefined' || !Uppy.Uppy) {
			target.innerHTML = `<p class="mg-uppy-missing">${this.gallery._escape(this.options.missingText)}</p>`;
			return;
		}
		this._teardown();
		const g = this.gallery;

		this.uppy = new Uppy.Uppy({
			autoProceed: this.options.mode === 'xhr',
			...this.options.uppyOptions,
		});
		this.uppy.use(Uppy.Dashboard, {
			inline: true,
			target,
			height: this.options.height,
			note: this.options.note,
			proudlyDisplayPoweredByUppy: false,
			...this.options.dashboardOptions,
		});

		if (this.options.mode === 'xhr' && Uppy.XHRUpload) {
			this.uppy.use(Uppy.XHRUpload, {
				endpoint: this.options.endpoint,
				fieldName: this.options.fieldName,
			});
			this.uppy.on('upload-success', (file, response) => {
				const url =
					(response && response.uploadURL) ||
					(response && response.body && response.body.url) ||
					null;
				g.addAsset({
					name: file.name,
					size: this._fmtSize(file.size),
					ext: this._ext(file.name),
					url: url || undefined,
				});
			});
		} else {
			// local mode: add the chosen file straight to the gallery
			this.uppy.on('file-added', (file) => {
				if (file && file.data) g.addFiles([file.data]);
				if (this.uppy) this.uppy.removeFile(file.id); // keep dashboard tidy
			});
		}
	}

	_teardown() {
		if (!this.uppy) return;
		try {
			if (typeof this.uppy.close === 'function') this.uppy.close();
			else if (typeof this.uppy.destroy === 'function')
				this.uppy.destroy();
		} catch (e) {
			/* ignore */
		}
		this.uppy = null;
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

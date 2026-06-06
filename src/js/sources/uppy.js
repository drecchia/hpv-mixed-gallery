// hpv-mixed-gallery source — Uppy Dashboard.
// Mounts an inline Uppy Dashboard; chosen files are handed to gallery.addFiles
// (→ active target). Requires Uppy on the page (window.Uppy + its CSS).
// (Uploading is the target's job here — this is purely a file source.)

class HpvUppySource {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'uppy';
		this.options = {
			label: options.label || 'Uppy',
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
		this.uppy = new Uppy.Uppy({ ...this.options.uppyOptions });
		this.uppy.use(Uppy.Dashboard, {
			inline: true,
			target,
			height: this.options.height,
			note: this.options.note,
			proudlyDisplayPoweredByUppy: false,
			...this.options.dashboardOptions,
		});
		this.uppy.on('file-added', (file) => {
			if (file && file.data) {
				// data is a File for browse/drop, but a nameless Blob for some
				// sources (webcam/url) — the core needs a name.
				const named =
					file.data instanceof File && file.data.name
						? file.data
						: new File([file.data], file.name || 'arquivo', {
								type:
									file.type ||
									(file.data && file.data.type) ||
									'',
							});
				g.addFiles([named]); // → active target
			}
			if (this.uppy) this.uppy.removeFile(file.id); // keep dashboard tidy
		});
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
}

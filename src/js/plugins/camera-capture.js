// hpv-mixed-gallery plugin — Camera capture (real WebRTC).
// Live <video> preview inside the active tab; capture draws a frame to a canvas,
// encodes a JPEG blob, and feeds it to the core via gallery.addFiles([file]).
// Stream starts on onShow (tab active + panel open) and stops on onHide/destroy,
// so the camera is released when not in use.
//
// Note: navigator.mediaDevices.getUserMedia requires a secure context
// (HTTPS or http://localhost) — it does NOT work from file://.

class HpvCameraCapture {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'camera';
		this.options = {
			label: options.label || 'Captura de Câmera',
			idleText: options.idleText || 'Iniciando câmera…',
			captureLabel: options.captureLabel || 'Capturar',
			flipLabel: options.flipLabel || 'Trocar câmera',
			quality: options.quality || 0.85, // JPEG quality 0–1
			maxWidth: options.maxWidth || 1280, // downscale captures wider than this
			facingMode: options.facingMode || 'environment', // 'environment' | 'user'
			fileName: options.fileName || ((ts) => `camera-${ts}.jpg`),
			unsupportedText:
				options.unsupportedText ||
				'Câmera indisponível — requer HTTPS ou localhost e permissão.',
		};
		this.stream = null;
		this.facingMode = this.options.facingMode;
	}

	init(gallery) {
		this.gallery = gallery;
		this._onClick = (e) => this._handleClick(e);
		gallery.container.addEventListener('click', this._onClick);
	}

	renderArea(gallery) {
		const o = this.options;
		const esc = (s) => gallery._escape(s);
		return `
			<div class="mg-camera" data-plugin="${esc(this.id)}">
				<div class="mg-camera-stage">
					<video class="mg-camera-video" data-role="cam-video" autoplay playsinline muted></video>
					<p class="mg-camera-status" data-role="cam-status">${esc(o.idleText)}</p>
				</div>
				<div class="mg-camera-controls">
					<button class="button is-small" type="button" data-role="cam-flip" title="${esc(o.flipLabel)}" aria-label="${esc(o.flipLabel)}">
						<span class="icon"><i class="fa-solid fa-camera-rotate"></i></span>
					</button>
					<button class="button is-small is-dark mg-accent-btn" type="button" data-role="cam-shoot" disabled>
						<span class="icon"><i class="fa-solid fa-camera"></i></span>
						<span>${esc(o.captureLabel)}</span>
					</button>
				</div>
			</div>`;
	}

	onShow() {
		this._start();
	}
	onHide() {
		this._stop();
	}

	destroy() {
		this._stop();
		if (this.gallery)
			this.gallery.container.removeEventListener('click', this._onClick);
		this.gallery = null;
	}

	// -- internal --

	_root() {
		return this.gallery.container.querySelector(
			`.mg-camera[data-plugin="${this.id}"]`,
		);
	}
	_video() {
		const r = this._root();
		return r && r.querySelector('[data-role="cam-video"]');
	}
	_shoot() {
		const r = this._root();
		return r && r.querySelector('[data-role="cam-shoot"]');
	}
	_status(msg) {
		const r = this._root();
		const s = r && r.querySelector('[data-role="cam-status"]');
		if (s) s.textContent = msg;
	}

	_supported() {
		return !!(
			navigator.mediaDevices && navigator.mediaDevices.getUserMedia
		);
	}

	async _start() {
		if (!this.gallery) return;
		const video = this._video();
		if (!video) return; // camera tab not currently rendered
		if (!this._supported()) {
			this._status(this.options.unsupportedText);
			return;
		}
		this._stop();
		this._status(this.options.idleText);
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: this.facingMode,
					width: { ideal: this.options.maxWidth },
				},
				audio: false,
			});
			const v = this._video(); // may have changed while awaiting
			if (!v) {
				this._stop();
				return;
			}
			v.srcObject = this.stream;
			// enable capture only once dimensions are known (videoWidth > 0)
			v.onloadedmetadata = () => {
				const shoot = this._shoot();
				if (shoot) shoot.disabled = false;
				this._status('');
			};
		} catch (err) {
			this.stream = null;
			this._status(`Erro de câmera: ${err.message || err.name}`);
		}
	}

	_stop() {
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		const v = this._video();
		if (v) v.srcObject = null;
		const shoot = this._shoot();
		if (shoot) shoot.disabled = true;
	}

	_handleClick(e) {
		if (e.target.closest('[data-role="cam-flip"]') && this._root()) {
			this._flip();
		} else if (
			e.target.closest('[data-role="cam-shoot"]') &&
			this._root()
		) {
			this._capture();
		}
	}

	async _flip() {
		this.facingMode =
			this.facingMode === 'environment' ? 'user' : 'environment';
		await this._start();
	}

	_capture() {
		const g = this.gallery;
		if (!this.stream) return;
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
			return;
		}
		const video = this._video();
		let w = video.videoWidth;
		let h = video.videoHeight;
		if (!w || !h) return;
		const max = this.options.maxWidth;
		if (w > max) {
			h = Math.round((h * max) / w);
			w = max;
		}
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		canvas.getContext('2d').drawImage(video, 0, 0, w, h);
		canvas.toBlob(
			(blob) => {
				if (!blob) return;
				const name = this.options.fileName(Date.now());
				const file = new File([blob], name, { type: 'image/jpeg' });
				g.addFiles([file]); // core handles limits + object URL + thumbnail
			},
			'image/jpeg',
			this.options.quality,
		);
	}
}

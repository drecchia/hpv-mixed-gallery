// hpv-mixed-gallery source — node-w2ws (Web-to-WebSocket file/photo bridge).
//
// Thin wrapper around the bridge's own reference client `W2WSConsumer`
// (src/vendor/w2ws-consumer.js — a window global), like HpvUppySource wraps Uppy.
// It shows a QR that opens the bridge's mobile uploader page; the phone streams
// files (chunked, checksum-verified, resumable) and the client hands us each
// finished Blob, which we feed to gallery.ingest → the active target.
//
// Requires the W2WSConsumer client loaded on the page and a running node-w2ws
// bridge. Pass { url: 'wss://host/ws' } (the client defaults to the current
// host, which is wrong from file:// / a different origin).

class HpvW2wsSource {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'w2ws';
		this.options = {
			label: options.label || 'Celular (QR)',
			url: options.url || '', // wss://host/ws
			opts: options.opts || null, // create_session opts; else derived from limits
			title: options.title || 'Envie do seu celular',
			steps: options.steps || [
				'Escaneie o QR code com a câmera do celular',
				'Abra o link e tire ou escolha as fotos',
				'Elas aparecem aqui automaticamente',
			],
			openLabel: options.openLabel || 'Abrir no celular',
			connectingText: options.connectingText || 'Conectando…',
			waitingHint: options.waitingHint || 'Aguardando o celular…',
			connectedHint:
				options.connectedHint || 'Celular conectado — pode enviar.',
			receivedText:
				options.receivedText || ((n) => `${n} arquivo(s) recebido(s)`),
			expiredText: options.expiredText || 'Sessão expirada.',
			retryLabel: options.retryLabel || 'Gerar novo QR',
			errorText:
				options.errorText ||
				'Não foi possível conectar ao serviço de upload.',
			checksumErrorText:
				options.checksumErrorText ||
				'Falha de integridade (checksum) — arquivo ignorado.',
			missingText:
				options.missingText ||
				'Cliente W2WSConsumer não carregado — inclua consumer-client.js na página.',
		};
		this.consumer = null;
		this._state = { phase: 'idle' };
		this._received = 0;
		this._countdown = null;
	}

	init(gallery) {
		this.gallery = gallery;
		this._onClick = (e) => this._handleClick(e);
		gallery.container.addEventListener('click', this._onClick);
	}

	renderArea(gallery) {
		return `<div class="mg-qr" data-plugin="${gallery._escape(this.id)}" data-role="w2-root"></div>`;
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

	// -- connection (delegated to W2WSConsumer) --

	_start() {
		if (!this.gallery) return;
		this._stop();
		this._received = 0;
		if (typeof W2WSConsumer === 'undefined') {
			this._setPhase('error', { error: this.options.missingText });
			return;
		}
		this._setPhase('connecting');
		const o = this.options;
		const g = this.gallery;
		// derived defaults from the gallery limits; caller opts override per-field
		const opts = {
			locale: (navigator.language || 'pt').slice(0, 2),
			maxFiles: g.options.maxItems || undefined,
			maxFileBytes: g.options.maxSizeMB
				? g.options.maxSizeMB * 1024 * 1024
				: undefined,
			...(o.opts || {}),
		};
		try {
			this.consumer = new W2WSConsumer({
				url: o.url || undefined,
				opts,
				handlers: {
					onStatus: (s) => this._onStatus(s),
					onSession: (s) => this._onSession(s),
					onUploader: (joined) => this._onUploader(joined),
					onFileProgress: (p) => this._onProgress(p),
					onFileComplete: (f) => this._onFile(f),
					onError: (msg) =>
						this._setPhase('error', { error: msg || o.errorText }),
				},
			});
			this.consumer.start();
		} catch (e) {
			this._setPhase('error', { error: o.errorText });
		}
	}

	_stop() {
		this._stopCountdown();
		if (this.consumer) {
			try {
				this.consumer.stop();
			} catch (e) {
				/* ignore */
			}
			this.consumer = null;
		}
		this._state = { phase: 'idle' };
	}

	_onStatus(s) {
		if (s === 'expired') {
			this._stopCountdown();
			this._setPhase('expired');
		}
		// connecting/reconnecting/ready/disconnected → the client manages it;
		// a fresh session re-fires onSession (re-render). errors come via onError.
	}

	_onSession(s) {
		this._setPhase('waiting', {
			qrPayload: s.qrPayload,
			deepLink: s.publicUrl,
			expiresAt: s.expiresAt,
		});
		if (s.expiresAt) this._startCountdown();
	}

	_onUploader(joined) {
		if (this._received) return; // don't overwrite the received counter
		const el =
			this._root() && this._root().querySelector('[data-role="w2-meta"]');
		if (el)
			el.textContent = joined
				? this.options.connectedHint
				: this.options.waitingHint;
	}

	_onProgress(p) {
		const el =
			this._root() && this._root().querySelector('[data-role="w2-meta"]');
		if (el) el.textContent = `Recebendo… ${p.pct || 0}%`;
	}

	_onFile(f) {
		const g = this.gallery;
		if (f.checksumOk === false) {
			g.showError(this.options.checksumErrorText);
			return;
		}
		if (!f.blob) return;
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
			return;
		}
		const name = f.name || 'arquivo-' + Date.now();
		g.addFiles([
			new File([f.blob], name, {
				type: f.mime || f.blob.type || 'application/octet-stream',
			}),
		]);
		this._received++;
		this._renderReceived();
	}

	// -- rendering (reuses the .mg-qr-* styles) --

	_root() {
		return (
			this.gallery &&
			this.gallery.container.querySelector(
				`[data-role="w2-root"][data-plugin="${this.id}"]`,
			)
		);
	}

	_setPhase(phase, data = {}) {
		this._state = { phase, ...data };
		this._render();
	}

	_render() {
		const root = this._root();
		if (!root) return;
		const o = this.options;
		const s = this._state;
		const esc = (x) => this.gallery._escape(x);

		if (s.phase === 'connecting') {
			root.innerHTML = `<p class="mg-qr-status">${esc(o.connectingText)}</p>`;
			return;
		}
		if (s.phase === 'waiting') {
			const steps = o.steps.map((t) => `<li>${esc(t)}</li>`).join('');
			const meta = this._received
				? esc(o.receivedText(this._received))
				: esc(o.waitingHint);
			const link = this._safeLink(s.deepLink);
			const openBtn =
				s.deepLink && link !== '#'
					? `<a class="button is-small is-link mg-qr-open" href="${esc(link)}" target="_blank" rel="noopener"><span class="icon"><i class="fa-solid fa-mobile-screen-button"></i></span><span>${esc(o.openLabel)}</span></a>`
					: '';
			const countdown = s.expiresAt
				? ` · <span data-role="w2-countdown"></span>`
				: '';
			root.innerHTML = `
				<div class="mg-qr-grid">
					<img class="mg-qr-qr" src="${esc(s.qrPayload)}" alt="QR code upload" width="180" height="180" />
					<div class="mg-qr-info">
						<p class="mg-qr-title">${esc(o.title)}</p>
						<ol class="mg-qr-steps">${steps}</ol>
						${openBtn}
						<p class="mg-qr-meta"><span data-role="w2-meta">${meta}</span>${countdown}</p>
					</div>
				</div>`;
			if (s.expiresAt) this._tick();
			return;
		}
		const text =
			s.phase === 'expired' ? o.expiredText : s.error || o.errorText;
		const cls = s.phase === 'error' ? ' mg-qr-error' : '';
		root.innerHTML = `
			<div class="mg-qr-center">
				<p class="mg-qr-status${cls}">${esc(text)}</p>
				<button class="button is-small is-dark mg-accent-btn" type="button" data-role="w2-retry" data-plugin="${esc(this.id)}">${esc(o.retryLabel)}</button>
			</div>`;
	}

	_renderReceived() {
		const root = this._root();
		const el = root && root.querySelector('[data-role="w2-meta"]');
		if (el) el.textContent = this.options.receivedText(this._received);
	}

	_safeLink(url) {
		return /^(https?:)/i.test(String(url || '').trim()) ? url : '#';
	}

	_handleClick(e) {
		if (
			e.target.closest(`[data-role="w2-retry"][data-plugin="${this.id}"]`)
		)
			this._start();
	}

	// -- countdown (reuses w2-countdown slot) --

	_startCountdown() {
		this._stopCountdown();
		this._countdown = setInterval(() => this._tick(), 1000);
	}
	_stopCountdown() {
		if (this._countdown) {
			clearInterval(this._countdown);
			this._countdown = null;
		}
	}
	_tick() {
		const s = this._state;
		if (s.phase !== 'waiting' || !s.expiresAt) return;
		const ms = s.expiresAt - Date.now();
		if (ms <= 0) {
			this._stopCountdown();
			this._setPhase('expired');
			return;
		}
		const root = this._root();
		const el = root && root.querySelector('[data-role="w2-countdown"]');
		if (el) {
			const sec = Math.ceil(ms / 1000);
			const m = Math.floor(sec / 60);
			const ss = String(sec % 60).padStart(2, '0');
			el.textContent = `expira em ${m}:${ss}`;
		}
	}
}

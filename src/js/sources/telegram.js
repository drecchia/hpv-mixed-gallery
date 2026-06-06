// hpv-mixed-gallery source — Telegram → WebSocket (node-telegram2ws bridge).
//
// Shows a QR code; the user scans it to open a Telegram bot session, then the
// photos they send in Telegram stream into the gallery over a WebSocket. The
// image is acquired here and handed to gallery.addFiles → the active target, so
// Telegram photos compose with any storage (kept local, uploaded to S3, …).
//
// Protocol (FORWARD_PICTURE), per node-telegram2ws:
//   →  create_session { mode:'FORWARD_PICTURE', locale }
//   ←  session_created { qrPayload(dataURL), deepLink, expiresAt }
//   ←  media_forward  { messageId, media:{ mime, data, metadata } }
//   →  ack { messageId }                                  (server times out at 10s)
//   ←  session_expiring | session_error | error ;  session TTL ~5 min.
//
// The stream is opened on tab-show (onShow) and closed on tab-hide/destroy —
// the bridge cleans the session up on disconnect.

class HpvTelegramSource {
	constructor(options = {}) {
		this.gallery = null;
		this.id = options.id || 'telegram';
		this.options = {
			label: options.label || 'Telegram',
			url: options.url || 'ws://localhost:8081',
			// 'telegram2ws' (create_session/session_created/media_forward/ack) or
			// 'i2w' (no handshake; server pushes {type:'qrcode'|'image', base64}).
			protocol: options.protocol || 'telegram2ws',
			locale: options.locale || (navigator.language || 'en').slice(0, 2),
			clientMeta: options.clientMeta || null,
			pingInterval: options.pingInterval || 25000,
			title: options.title || 'Envie fotos pelo Telegram',
			steps: options.steps || [
				'Abra o app Telegram no seu celular',
				'Escaneie o QR code (ou toque em Abrir no Telegram)',
				'Envie as fotos na conversa com o bot',
			],
			openLabel: options.openLabel || 'Abrir no Telegram',
			connectingText: options.connectingText || 'Conectando ao Telegram…',
			waitingHint: options.waitingHint || 'Aguardando suas fotos…',
			receivedText:
				options.receivedText || ((n) => `${n} foto(s) recebida(s)`),
			expiredText: options.expiredText || 'Sessão expirada.',
			retryLabel: options.retryLabel || 'Gerar novo QR',
			errorText:
				options.errorText ||
				'Não foi possível conectar ao serviço do Telegram.',
			mediaErrorText:
				options.mediaErrorText ||
				'Falha ao receber a foto do Telegram.',
		};
		this.ws = null;
		this._state = { phase: 'idle' };
		this._closing = false;
		this._countdown = null;
		this._ping = null;
		this._received = 0;
	}

	init(gallery) {
		this.gallery = gallery;
		this._onClick = (e) => this._handleClick(e);
		gallery.container.addEventListener('click', this._onClick);
	}

	renderArea(gallery) {
		return `<div class="mg-telegram" data-plugin="${gallery._escape(this.id)}" data-role="tg-root"></div>`;
	}

	onShow() {
		this._connect();
	}
	onHide() {
		this._teardown();
	}

	destroy() {
		this._teardown();
		if (this.gallery)
			this.gallery.container.removeEventListener('click', this._onClick);
		this.gallery = null;
	}

	// -- connection --

	_connect() {
		if (!this.gallery) return;
		this._teardown();
		this._closing = false;
		this._received = 0;
		this._setPhase('connecting');
		let ws;
		try {
			ws = new WebSocket(this.options.url);
		} catch (e) {
			this._setPhase('error', { error: this.options.errorText });
			return;
		}
		this.ws = ws;
		ws.onopen = () => {
			if (this.options.protocol === 'telegram2ws') {
				const msg = {
					action: 'create_session',
					mode: 'FORWARD_PICTURE',
					locale: this.options.locale,
				};
				if (this.options.clientMeta)
					msg.clientMeta = this.options.clientMeta;
				ws.send(JSON.stringify(msg));
				this._ping = setInterval(() => {
					if (ws.readyState === 1)
						ws.send(JSON.stringify({ action: 'ping' }));
				}, this.options.pingInterval);
			}
			// i2w: send nothing — the server pushes {type:'qrcode'} then {type:'image'}
		};
		ws.onmessage = (e) => this._onMessage(e);
		ws.onerror = () => {
			if (!this._closing)
				this._setPhase('error', { error: this.options.errorText });
		};
		ws.onclose = () => {
			if (
				!this._closing &&
				this._state.phase !== 'expired' &&
				this._state.phase !== 'error'
			)
				this._setPhase('error', { error: this.options.errorText });
		};
	}

	_teardown() {
		this._closing = true;
		this._stopCountdown();
		if (this._ping) {
			clearInterval(this._ping);
			this._ping = null;
		}
		if (this.ws) {
			try {
				this.ws.onopen =
					this.ws.onmessage =
					this.ws.onerror =
					this.ws.onclose =
						null;
				this.ws.close();
			} catch (e) {
				/* ignore */
			}
			this.ws = null;
		}
		this._state = { phase: 'idle' };
	}

	_onMessage(e) {
		let msg;
		try {
			msg = JSON.parse(e.data);
		} catch (_) {
			return;
		}
		// i2w protocol (type-based, no handshake/ack): the server pushes the QR
		// then each photo as a full data URL.
		if (msg.type === 'qrcode') {
			this._setPhase('waiting', { qrPayload: msg.base64 });
			return;
		}
		if (msg.type === 'image') {
			this._ingestMedia(msg.base64, msg.mime, {});
			return;
		}
		// telegram2ws protocol (action-based)
		switch (msg.action) {
			case 'session_created':
				this._setPhase('waiting', {
					qrPayload: msg.qrPayload,
					deepLink: msg.deepLink,
					expiresAt: msg.expiresAt,
				});
				this._startCountdown();
				break;
			case 'media_forward': {
				const m = msg.media || {};
				// ack first so the bridge doesn't hit its 10s resend/timeout
				if (this.ws && this.ws.readyState === 1 && msg.messageId)
					this.ws.send(
						JSON.stringify({
							action: 'ack',
							messageId: msg.messageId,
						}),
					);
				this._ingestMedia(m.data, m.mime, m.metadata || {});
				break;
			}
			case 'session_error':
				this._setPhase('error', {
					error: msg.error || this.options.errorText,
				});
				break;
			case 'error':
				this._setPhase('error', {
					error: msg.message || this.options.errorText,
				});
				break;
			// session_expiring → handled by the countdown; pong → ignore
		}
	}

	// data may be a full data URL (Jimp/i2w) or bare base64.
	async _ingestMedia(data, mimeIn, meta) {
		if (!data) return;
		const g = this.gallery;
		if (g.isFull()) {
			g.showError(g.options.labels.galleryFull(g.options.maxItems));
			return;
		}
		try {
			const mime = mimeIn || 'image/jpeg';
			const dataUrl = String(data).startsWith('data:')
				? data
				: `data:${mime};base64,${data}`;
			const blob = await (await fetch(dataUrl)).blob();
			g.addFiles([
				new File([blob], this._name(meta, mime), { type: mime }),
			]);
			this._received++;
			this._renderReceived();
		} catch (err) {
			g.showError(this.options.mediaErrorText);
		}
	}

	_name(meta, mime) {
		const md = meta || {};
		const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
		const base =
			(md.caption && md.caption.trim()) ||
			md.telegramFileUniqueId ||
			'telegram-' + (md.telegramFileId || Date.now());
		return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${ext}`;
	}

	// -- rendering --

	_root() {
		return (
			this.gallery &&
			this.gallery.container.querySelector(
				`[data-role="tg-root"][data-plugin="${this.id}"]`,
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
			root.innerHTML = `<p class="mg-tg-status">${esc(o.connectingText)}</p>`;
			return;
		}
		if (s.phase === 'waiting') {
			const steps = o.steps.map((t) => `<li>${esc(t)}</li>`).join('');
			const meta = this._received
				? esc(o.receivedText(this._received))
				: esc(o.waitingHint);
			// Deep link + countdown only exist in the telegram2ws protocol; i2w
			// just pushes a QR. Allowlist the (server-supplied) link scheme.
			const link = this._safeLink(s.deepLink);
			const openBtn =
				s.deepLink && link !== '#'
					? `<a class="button is-small is-link mg-tg-open" href="${esc(link)}" target="_blank" rel="noopener"><span class="icon"><i class="fa-brands fa-telegram"></i></span><span>${esc(o.openLabel)}</span></a>`
					: '';
			const countdown = s.expiresAt
				? ` · <span data-role="tg-countdown"></span>`
				: '';
			root.innerHTML = `
				<div class="mg-tg-grid">
					<img class="mg-tg-qr" src="${esc(s.qrPayload)}" alt="QR code Telegram" width="180" height="180" />
					<div class="mg-tg-info">
						<p class="mg-tg-title">${esc(o.title)}</p>
						<ol class="mg-tg-steps">${steps}</ol>
						${openBtn}
						<p class="mg-tg-meta"><span data-role="tg-received">${meta}</span>${countdown}</p>
					</div>
				</div>`;
			if (s.expiresAt) this._tick();
			return;
		}
		// expired / error
		const text =
			s.phase === 'expired' ? o.expiredText : s.error || o.errorText;
		const cls = s.phase === 'error' ? ' mg-tg-error' : '';
		root.innerHTML = `
			<div class="mg-tg-center">
				<p class="mg-tg-status${cls}">${esc(text)}</p>
				<button class="button is-small is-dark mg-accent-btn" type="button" data-role="tg-retry" data-plugin="${esc(this.id)}">${esc(o.retryLabel)}</button>
			</div>`;
	}

	_renderReceived() {
		const root = this._root();
		const el = root && root.querySelector('[data-role="tg-received"]');
		if (el) el.textContent = this.options.receivedText(this._received);
	}

	// Only let the deep link through if it uses a safe scheme (Telegram uses
	// https://t.me/… or tg://); anything else (javascript:, data:, …) → '#'.
	_safeLink(url) {
		return /^(https?:|tg:)/i.test(String(url || '').trim()) ? url : '#';
	}

	_handleClick(e) {
		if (
			e.target.closest(`[data-role="tg-retry"][data-plugin="${this.id}"]`)
		)
			this._connect(); // regenerate the session/QR
	}

	// -- countdown --

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
		const el = root && root.querySelector('[data-role="tg-countdown"]');
		if (el) {
			const sec = Math.ceil(ms / 1000);
			const m = Math.floor(sec / 60);
			const ss = String(sec % 60).padStart(2, '0');
			el.textContent = `expira em ${m}:${ss}`;
		}
	}
}

'use strict';
/*
 * W2WSConsumer — reference client for the token-protected ("consumer") side.
 *
 * Lifecycle:
 *   const c = new W2WSConsumer({ opts: { locale:'pt', allowedMime:['image/*'], maxFileBytes: 5e6 },
 *                               handlers: { onSession, onFileComplete, ... } });
 *   c.start();
 *
 * It opens a WS, calls create_session, surfaces the QR via onSession(), then
 * reassembles the base64 chunks the bridge relays from the phone and fires
 * onFileComplete({ blob }) once each file arrives (checksum-verified).
 *
 * The bridge ACKs every chunk to the uploader on our behalf, so this client
 * only needs to send `file_received` when a file is fully reassembled.
 */
(function (global) {
	function wsUrl() {
		return (
			(location.protocol === 'https:' ? 'wss' : 'ws') +
			'://' +
			location.host +
			'/ws'
		);
	}
	function b64ToBytes(b64) {
		var bin = atob(b64),
			len = bin.length,
			u = new Uint8Array(len);
		for (var i = 0; i < len; i++) u[i] = bin.charCodeAt(i);
		return u;
	}
	function concat(chunks, total) {
		var out = new Uint8Array(total),
			off = 0;
		for (var i = 0; i < chunks.length; i++) {
			if (chunks[i]) {
				out.set(chunks[i], off);
				off += chunks[i].length;
			}
		}
		return out;
	}
	function sha256hex(bytes) {
		if (!(global.crypto && crypto.subtle)) return Promise.resolve(null);
		return crypto.subtle
			.digest('SHA-256', bytes)
			.then(function (h) {
				return Array.prototype.map
					.call(new Uint8Array(h), function (b) {
						return ('0' + b.toString(16)).slice(-2);
					})
					.join('');
			})
			.catch(function () {
				return null;
			});
	}

	function W2WSConsumer(cfg) {
		cfg = cfg || {};
		this.url = cfg.url || wsUrl();
		this.opts = cfg.opts || {};
		this.h = cfg.handlers || {};
		this.ws = null;
		this.sessionId = null;
		this.files = {}; // fileId -> { name, mime, size, chunks:[], received:0 }
		this._stopped = false;
		this._attempt = 0;
	}

	W2WSConsumer.prototype._emit = function (name) {
		var fn = this.h[name];
		if (fn)
			try {
				fn.apply(null, Array.prototype.slice.call(arguments, 1));
			} catch (e) {
				/* noop */
			}
	};
	W2WSConsumer.prototype._send = function (obj) {
		if (this.ws && this.ws.readyState === 1) {
			obj.sessionId = this.sessionId;
			this.ws.send(JSON.stringify(obj));
		}
	};

	W2WSConsumer.prototype.start = function () {
		var self = this;
		this._stopped = false;
		this._emit('onStatus', this._attempt ? 'reconnecting' : 'connecting');
		var ws = new WebSocket(this.url);
		this.ws = ws;

		ws.onopen = function () {
			self._attempt = 0;
			self.files = {};
			self._send({ action: 'create_session', opts: self.opts });
		};
		ws.onmessage = function (ev) {
			var m;
			try {
				m = JSON.parse(ev.data);
			} catch (e) {
				return;
			}
			self._handle(m);
		};
		ws.onclose = function () {
			self._emit('onStatus', 'disconnected');
			if (self._stopped) return;
			self._attempt++;
			var d = Math.min(15000, 500 * Math.pow(2, self._attempt - 1));
			setTimeout(
				function () {
					self.start();
				},
				Math.round(d * (0.5 + Math.random() * 0.5)),
			);
		};
		ws.onerror = function () {
			try {
				ws.close();
			} catch (e) {}
		};

		// heartbeat
		if (!this._hb)
			this._hb = setInterval(function () {
				if (self.ws && self.ws.readyState === 1)
					self._send({ action: 'ping' });
			}, 22000);
	};

	W2WSConsumer.prototype.stop = function () {
		this._stopped = true;
		clearInterval(this._hb);
		this._hb = null;
		try {
			this.ws.close();
		} catch (e) {}
	};

	W2WSConsumer.prototype._handle = function (m) {
		var self = this;
		switch (m.action) {
			case 'session_created':
				this.sessionId = m.sessionId;
				this._emit('onStatus', 'ready');
				this._emit('onSession', {
					sessionId: m.sessionId,
					uploaderToken: m.uploaderToken,
					publicUrl: m.publicUrl,
					qrPayload: m.qrPayload,
					limits: m.limits,
					locale: m.locale,
					expiresAt: m.expiresAt,
				});
				break;
			case 'uploader_joined':
				this._emit('onUploader', true, m.clientMeta || {});
				break;
			case 'uploader_left':
				this._emit('onUploader', false, {});
				break;
			case 'file_begin':
				this.files[m.fileId] = {
					name: m.name,
					mime: m.mime,
					size: Number(m.size || 0),
					totalChunks: Number(m.totalChunks || 0),
					chunks: [],
					received: 0,
				};
				this._emit('onFileBegin', {
					fileId: m.fileId,
					name: m.name,
					mime: m.mime,
					size: Number(m.size || 0),
				});
				break;
			case 'file_chunk': {
				var f = this.files[m.fileId];
				if (!f) return;
				var bytes = b64ToBytes(m.data || '');
				f.chunks[m.seq] = bytes;
				f.received += bytes.length;
				this._emit('onFileProgress', {
					fileId: m.fileId,
					receivedBytes: f.received,
					size: f.size,
					pct: f.size
						? Math.min(100, Math.round((f.received / f.size) * 100))
						: 0,
				});
				break;
			}
			case 'file_end': {
				var ff = this.files[m.fileId];
				if (!ff) return;
				var all = concat(ff.chunks, ff.received);
				sha256hex(all).then(function (sum) {
					var ok = !m.checksum || !sum || sum === m.checksum;
					var blob = new Blob([all], {
						type: ff.mime || 'application/octet-stream',
					});
					self._send({
						action: 'file_received',
						fileId: m.fileId,
						checksum: sum,
					});
					self._emit('onFileComplete', {
						fileId: m.fileId,
						name: ff.name,
						mime: ff.mime,
						size: all.length,
						blob: blob,
						checksumOk: ok,
					});
					delete self.files[m.fileId];
				});
				break;
			}
			case 'session_expired':
				this._emit('onStatus', 'expired');
				this._emit('onError', 'session_expired:' + m.reason);
				break;
			case 'error':
				this._emit('onError', m.message || m.code || 'error');
				break;
		}
	};

	global.W2WSConsumer = W2WSConsumer;
})(window);

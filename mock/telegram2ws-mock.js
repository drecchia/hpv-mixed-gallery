#!/usr/bin/env node
// Zero-dependency mock of the node-telegram2ws bridge, for demoing the
// HpvTelegramSource end-to-end without a real Telegram bot.
//
// It serves, on a single port (default 8081):
//   • the WebSocket the gallery connects to (create_session / session_created /
//     media_forward / ack / ping), and
//   • a tiny "phone" simulator page (GET /sim) that pushes photos to the gallery.
//
// The QR (session_created.qrPayload) is an api.qrserver.com image URL encoding the
// Telegram bot deep link — https://t.me/<bot>?start=FORWARD_PICTURE:<session> —
// exactly like the real bridge (the ?start= payload is the bot's initial message).
// To test WITHOUT a real bot, open the simulator page (GET /sim) directly: it
// targets the latest session and pushes the photo over the gallery's WebSocket.
//
// Run:
//   TELEGRAM_BOT_NAME=YourBot node mock/telegram2ws-mock.js
//   → open the demo (index.html), click the "Telegram" tab to see the QR
//   → with a real bot: scan the QR (opens t.me, sends /start FORWARD_PICTURE:…)
//   → without a bot:    open http://localhost:8081/sim and send a photo
//
// LAN scanning (phone): set MOCK_HOST to your machine's IP so /sim is reachable:
//   MOCK_HOST=192.168.1.20:8081 node mock/telegram2ws-mock.js
//
// This is a DEV MOCK — it implements only the FORWARD_PICTURE happy path.

const http = require('http');
const crypto = require('crypto');

const PORT = parseInt(process.env.WEBSOCKET_PORT || '8081', 10);
const HOST_FOR_LINKS = process.env.MOCK_HOST || `localhost:${PORT}`;
const BOT_NAME = process.env.TELEGRAM_BOT_NAME || 'Telegram2WsDemoBot';
const SESSION_TTL_MS = 5 * 60 * 1000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const sessions = new Map(); // sessionId -> { socket, expiresAt, timer }
const rid = (n = 16) => crypto.randomBytes(32).toString('hex').slice(0, n);
const log = (...a) => console.log('[mock]', ...a);

// ---------------------------------------------------------------------------
// Minimal WebSocket framing (text frames; server→client unmasked)
// ---------------------------------------------------------------------------

function wsAccept(key) {
	return crypto
		.createHash('sha1')
		.update(key + WS_GUID)
		.digest('base64');
}

function encodeFrame(str) {
	const payload = Buffer.from(str, 'utf8');
	const len = payload.length;
	let header;
	if (len < 126) {
		header = Buffer.from([0x81, len]);
	} else if (len < 65536) {
		header = Buffer.alloc(4);
		header[0] = 0x81;
		header[1] = 126;
		header.writeUInt16BE(len, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x81;
		header[1] = 127;
		header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
		header.writeUInt32BE(len >>> 0, 6);
	}
	return Buffer.concat([header, payload]);
}

function sendJSON(socket, obj) {
	try {
		socket.write(encodeFrame(JSON.stringify(obj)));
	} catch (e) {
		/* socket gone */
	}
}

// Parse complete (masked) client frames out of a buffer; returns the leftover.
function parseFrames(buf) {
	const frames = [];
	let off = 0;
	while (off + 2 <= buf.length) {
		const b1 = buf[off + 1];
		const opcode = buf[off] & 0x0f;
		const masked = (b1 & 0x80) !== 0;
		let len = b1 & 0x7f;
		let p = off + 2;
		if (len === 126) {
			if (p + 2 > buf.length) break;
			len = buf.readUInt16BE(p);
			p += 2;
		} else if (len === 127) {
			if (p + 8 > buf.length) break;
			len = Number(buf.readBigUInt64BE(p));
			p += 8;
		}
		let mask = null;
		if (masked) {
			if (p + 4 > buf.length) break;
			mask = buf.slice(p, p + 4);
			p += 4;
		}
		if (p + len > buf.length) break;
		let payload = buf.slice(p, p + len);
		if (masked) {
			const out = Buffer.allocUnsafe(len);
			for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
			payload = out;
		}
		frames.push({ opcode, payload });
		off = p + len;
	}
	return { frames, rest: buf.slice(off) };
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

function handleClientMessage(socket, msg) {
	switch (msg && msg.action) {
		case 'create_session': {
			const id = rid(16);
			// Real Telegram deep link: scanning it opens the bot and sends the
			// initial message "/start FORWARD_PICTURE:<session>".
			const deepLink = `https://t.me/${BOT_NAME}?start=FORWARD_PICTURE:${id}`;
			const qrPayload =
				'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' +
				encodeURIComponent(deepLink) +
				'&ecc=L&format=svg&qzone=5';
			const expiresAt = Date.now() + SESSION_TTL_MS;
			cleanupSocket(socket); // one session per socket
			socket._sessionId = id;
			const timer = setTimeout(() => sessions.delete(id), SESSION_TTL_MS);
			sessions.set(id, { socket, expiresAt, timer });
			sendJSON(socket, {
				action: 'session_created',
				messageId: rid(16),
				sessionId: id,
				deepLink,
				qrPayload,
				expiresAt,
			});
			log(`session ${id} created → ${deepLink}`);
			break;
		}
		case 'ping':
			sendJSON(socket, { action: 'pong', timestamp: Date.now() });
			break;
		case 'ack':
			log(`ack ${msg.messageId}`);
			break;
		case 'nack':
			log(`nack ${msg.messageId}: ${msg.reason}`);
			break;
	}
}

function pushMedia(sessionId, info) {
	const s = sessions.get(sessionId);
	if (!s) return false;
	const data = info.data || '';
	sendJSON(s.socket, {
		action: 'media_forward',
		messageId: rid(16),
		sessionId,
		media: {
			type: 'image',
			mime: info.mime || 'image/jpeg',
			size: data.length,
			data, // data URL (Jimp-style) — the source tolerates bare base64 too
			metadata: {
				width: info.width || null,
				height: info.height || null,
				format: 'JPEG',
				timestamp: Math.floor(Date.now() / 1000),
				caption: info.caption || null,
				telegramFileId: rid(20),
				telegramFileUniqueId: rid(12),
			},
		},
		timestamp: Date.now(),
	});
	log(`media → session ${sessionId} (${info.name || 'photo'})`);
	return true;
}

function cleanupSocket(socket) {
	const id = socket && socket._sessionId;
	if (id && sessions.has(id)) {
		clearTimeout(sessions.get(id).timer);
		sessions.delete(id);
	}
	if (socket) socket._sessionId = null;
}

// ---------------------------------------------------------------------------
// HTTP (simulator page + /send + /sessions) and the WS upgrade
// ---------------------------------------------------------------------------

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'content-type',
	'access-control-allow-methods': 'GET,POST,OPTIONS',
};

const server = http.createServer((req, res) => {
	const u = new URL(req.url, `http://${req.headers.host || HOST_FOR_LINKS}`);
	if (req.method === 'OPTIONS') {
		res.writeHead(204, CORS);
		return res.end();
	}
	if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/sim')) {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		return res.end(simulatorPage(u.searchParams.get('s') || ''));
	}
	if (req.method === 'GET' && u.pathname === '/sessions') {
		res.writeHead(200, { 'content-type': 'application/json', ...CORS });
		return res.end(JSON.stringify([...sessions.keys()]));
	}
	if (req.method === 'POST' && u.pathname === '/send') {
		let body = '';
		req.on('data', (c) => {
			body += c;
			if (body.length > 30e6) req.destroy();
		});
		req.on('end', () => {
			let data;
			try {
				data = JSON.parse(body);
			} catch (e) {
				res.writeHead(400, CORS);
				return res.end('{"ok":false}');
			}
			const ok = pushMedia(data.s, data);
			res.writeHead(ok ? 200 : 404, {
				'content-type': 'application/json',
				...CORS,
			});
			res.end(JSON.stringify({ ok }));
		});
		return;
	}
	res.writeHead(404, CORS);
	res.end('not found');
});

server.on('upgrade', (req, socket) => {
	const key = req.headers['sec-websocket-key'];
	if (!key) return socket.destroy();
	socket.write(
		'HTTP/1.1 101 Switching Protocols\r\n' +
			'Upgrade: websocket\r\n' +
			'Connection: Upgrade\r\n' +
			`Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`,
	);
	log('gallery connected');
	socket._buf = Buffer.alloc(0);
	socket.on('data', (chunk) => {
		socket._buf = Buffer.concat([socket._buf, chunk]);
		const { frames, rest } = parseFrames(socket._buf);
		socket._buf = rest;
		for (const f of frames) {
			if (f.opcode === 0x8) return socket.end(); // close
			if (f.opcode !== 0x1) continue; // only text frames
			let msg;
			try {
				msg = JSON.parse(f.payload.toString('utf8'));
			} catch (e) {
				continue;
			}
			handleClientMessage(socket, msg);
		}
	});
	socket.on('close', () => cleanupSocket(socket));
	socket.on('error', () => cleanupSocket(socket));
});

server.listen(PORT, () => {
	log(`telegram2ws mock on :${PORT}`);
	log(`  gallery WS → ws://${HOST_FOR_LINKS}`);
	log(
		`  QR/bot     → https://t.me/${BOT_NAME}?start=FORWARD_PICTURE:<session>`,
	);
	log(`  simulator  → http://${HOST_FOR_LINKS}/sim  (no-bot testing)`);
});

// ---------------------------------------------------------------------------
// The "phone" simulator page (served at /sim)
// ---------------------------------------------------------------------------

function simulatorPage(s) {
	// session ids are hex; sanitise + JSON-encode so it's a safe JS string literal
	const safe = JSON.stringify(
		String(s)
			.replace(/[^a-f0-9]/gi, '')
			.slice(0, 32),
	);
	return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Telegram (mock)</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:440px;margin:2rem auto;padding:0 1rem;color:#1e293b}
  h2{margin:.2rem 0}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:1rem;margin-top:1rem}
  button{font:inherit;padding:.5rem .9rem;border:0;border-radius:8px;background:#3390ec;color:#fff;cursor:pointer}
  button.alt{background:#e2e8f0;color:#1e293b}
  #status{min-height:1.3em;font-size:14px;color:#475569;margin-top:.6rem}
  code{background:#f1f5f9;padding:1px 6px;border-radius:4px}
</style></head>
<body>
  <h2>📷 Telegram <small style="color:#94a3b8">(mock)</small></h2>
  <p>Simula o celular do usuário. Sessão: <code id="sid">…</code></p>
  <div class="card">
    <p><strong>Enviar uma foto</strong></p>
    <input type="file" accept="image/*" id="file">
    <p style="margin-top:.8rem"><button class="alt" id="test">Ou gerar uma imagem de teste</button></p>
    <p id="status"></p>
  </div>
<script>
(function(){
  var sid = ${safe};
  var sidEl = document.getElementById('sid');
  var statusEl = document.getElementById('status');
  function setSid(v){ sid=v; sidEl.textContent = v || '(nenhuma — gere o QR na galeria)'; }
  setSid(sid);
  if(!sid){ fetch('/sessions').then(function(r){return r.json();}).then(function(a){ if(a.length) setSid(a[a.length-1]); }).catch(function(){}); }
  function send(name, mime, dataUrl){
    if(!sid){ statusEl.textContent='Sem sessao ativa.'; return; }
    statusEl.textContent='Enviando...';
    fetch('/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({s:sid,name:name,mime:mime,data:dataUrl})})
      .then(function(r){return r.json();})
      .then(function(j){ statusEl.textContent = j.ok ? '\\u2713 Enviado! Veja aparecer na galeria.' : 'Falha: sessao nao encontrada (gere um novo QR).'; })
      .catch(function(e){ statusEl.textContent='Erro: '+e; });
  }
  document.getElementById('file').onchange=function(){
    var f=this.files[0]; if(!f) return;
    var rd=new FileReader(); rd.onload=function(){ send(f.name, f.type||'image/jpeg', rd.result); }; rd.readAsDataURL(f);
  };
  document.getElementById('test').onclick=function(){
    var c=document.createElement('canvas'); c.width=c.height=400; var x=c.getContext('2d');
    x.fillStyle='#3390ec'; x.fillRect(0,0,400,400);
    x.fillStyle='#fff'; x.font='bold 30px system-ui'; x.fillText('Foto de teste',54,190);
    x.font='18px system-ui'; x.fillText(new Date().toLocaleTimeString(),54,232);
    send('teste-'+Date.now()+'.png','image/png',c.toDataURL('image/png'));
  };
})();
</script>
</body></html>`;
}

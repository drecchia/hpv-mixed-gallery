// hpv-mixed-gallery — mixed media (documents + images) upload gallery.
// Distilled from the Photon UX prototype. Layout/buttons come from Bulma and
// icons from FontAwesome; both must be loaded by the host page.

class HpvMixedGalleryError extends Error {
	constructor(message) {
		super(message);
		this.name = 'HpvMixedGalleryError';
	}
}

class HpvMixedGallery {
	constructor(containerId, options = {}) {
		this.defaultOptions = {
			// --- data
			items: [], // initial assets: [{ name, size, ext }]
			// --- behavior
			maxSizeMB: 15, // reject files larger than this (0 / null = no limit)
			maxItems: 0, // max assets the gallery can hold (0 = unlimited)
			animate: true, // micro-interactions (panel reveal, icon morph, button feedback)
			confirmRemove: true, // require an inline confirm before deleting a card
			target: null, // storage Target { store(acq, ctx) }; null = built-in local store
			readOnly: false, // view-only: hide upload/delete/save UI; previews still work
			// --- all user-facing copy (override any single string; pt-BR defaults).
			//     Upload-method strings (tab label, dropzone copy) live in the
			//     registered upload plugins, not here.
			labels: {
				title: 'Arquivos e Imagens',
				subtitle:
					'Gerencie documentos técnicos e imagens anexadas de forma integrada.',
				addButton: 'Adicionar', // toggle, panel closed
				closeButton: 'Fechar', // toggle, panel open
				sourceLabel: 'Origem do arquivo:',
				sectionTitle: 'Itens Salvos',
				emptyTitle: 'Nenhum arquivo anexado',
				emptyText:
					'Comece a compilar seu inventário subindo fotos técnicas do rack ou relatórios PDF de configuração.',
				emptyButton: 'Anexar Primeiro Arquivo',
				saveButton: 'Salvar Galeria',
				removeTitle: 'Remover',
				confirmRemoveTitle: 'Confirmar remoção',
				cancelTitle: 'Cancelar',
				// counter(count, max) — max is 0 when there is no gallery limit
				counter: (n, max) =>
					max ? `${n} de ${max}` : `Mostrando ${n} item(ns)`,
				tooLarge: (name, limitMB, sizeText) =>
					`"${name}" excede o limite de ${limitMB} MB (tem ${sizeText}).`,
				galleryFull: (max) =>
					`Galeria cheia (limite de ${max}). Remova um item para adicionar outro.`,
				limitReached: (max, rejected) =>
					`Limite de ${max} arquivos atingido — ${rejected} não adicionado(s).`,
			},
			// --- callbacks
			onAdd: null, // fn(component, asset)
			onRemove: null, // fn(component, id, asset)
			onReject: null, // fn(component, file, reason) — e.g. file too large
			onItemClick: null, // fn(component, asset, id) — any card clicked
			onSave: null, // fn(component, assets)
			onCreate: null, // fn(component)
			isDebug: false,
		};

		this.options = { ...this.defaultOptions, ...options };
		// labels merge one level deep so callers can override individual strings
		this.options.labels = {
			...this.defaultOptions.labels,
			...(options.labels || {}),
		};
		this.container = document.getElementById(containerId);

		if (!this.container)
			throw new HpvMixedGalleryError(
				`Container #${containerId} not found`,
			);

		// state
		this.items = new Map(); // id(string) -> asset
		this.isUploadOpen = false;
		this.uploadMethod = null; // active source id (set on register)
		this._sources = []; // registered upload sources (the tabs)
		this._target = this.options.target || null; // active storage target
		this.readOnly = !!this.options.readOnly; // view-only mode
		this._seq = 0;
		this._confirmingId = null; // card currently armed for delete (one at a time)
		this._confirmTimeout = null;
		this._errorTimeout = null;
		this._objectUrls = new Set(); // object URLs we created (must be revoked)

		this._init();

		if (this.options.onCreate) this.options.onCreate(this);
	}

	// -------------------------------------------------------------------------
	// Setup (called once from constructor)
	// -------------------------------------------------------------------------

	_init() {
		this._createElements();
		this._setupEventListeners();
		this._loadItems(this.options.items);
		this._updateTotal();
	}

	_createElements() {
		const o = this.options;
		const L = o.labels;
		this.container.innerHTML = `
			<div class="hpv-mixed-gallery${o.animate ? '' : ' mg-no-motion'}${o.readOnly ? ' is-readonly' : ''}">
				<div class="columns is-mobile is-vcentered mb-5">
					<div class="column">
						<h1 class="title is-5 mb-1 mg-title">${L.title}</h1>
						<p class="subtitle is-7 mb-0 mg-subtitle">${L.subtitle}</p>
					</div>
					<div class="column is-narrow">
						<button class="button is-small is-dark mg-accent-btn" data-action="toggle-upload">
							<span class="icon is-small"><i class="fa-solid fa-plus mg-toggle-icon" data-role="toggle-icon"></i></span>
							<span data-role="toggle-text">${L.addButton}</span>
						</button>
					</div>
				</div>

				<div class="upload-disclosure-panel" data-role="upload-panel">
					<div class="field mb-3">
						<label class="label is-size-7 mg-subtitle">${L.sourceLabel}</label>
						<div class="buttons has-addons mb-0" data-role="tabs"></div>
					</div>
					<div data-role="upload-area"></div>
					<p class="mg-upload-progress" data-role="upload-progress" hidden></p>
					<p class="mg-upload-error" data-role="upload-error" hidden></p>
				</div>

				<div class="mb-5">
					<h2 class="is-size-7 has-text-weight-bold has-text-grey mg-section-title mb-4">${L.sectionTitle}</h2>
					<div class="columns is-multiline is-mobile" data-role="grid" style="display: none;"></div>
					<div class="empty-state-wrapper" data-role="empty">
						<div class="mb-2 mg-empty-icon">
							<span class="icon is-large"><i class="fa-regular fa-folder-open fa-3x"></i></span>
						</div>
						<h3 class="title is-6 mb-2 mg-empty-title">${L.emptyTitle}</h3>
						<p class="is-size-7 has-text-grey mb-4 mg-empty-text">${L.emptyText}</p>
						<button class="button is-small is-light mg-empty-btn" data-action="open-upload">
							<i class="fa-solid fa-plus-circle mr-1"></i> ${L.emptyButton}
						</button>
					</div>
				</div>

				<div class="is-flex is-justify-content-space-between is-align-items-center pt-4 mg-footer">
					<span class="is-size-7 has-text-grey mg-counter" data-role="counter">${L.counter(0, o.maxItems || 0)}</span>
					<button class="button is-small is-dark mg-accent-btn mg-save-btn" data-action="save">${L.saveButton}</button>
				</div>
			</div>`;

		// cache refs
		this._root = this.container.querySelector('.hpv-mixed-gallery');
		this._panel = this.container.querySelector(
			'[data-role="upload-panel"]',
		);
		this._tabs = this.container.querySelector('[data-role="tabs"]');
		this._uploadArea = this.container.querySelector(
			'[data-role="upload-area"]',
		);
		this._uploadError = this.container.querySelector(
			'[data-role="upload-error"]',
		);
		this._uploadProgress = this.container.querySelector(
			'[data-role="upload-progress"]',
		);
		this._grid = this.container.querySelector('[data-role="grid"]');
		this._empty = this.container.querySelector('[data-role="empty"]');
		this._counter = this.container.querySelector('[data-role="counter"]');
		this._toggleIcon = this.container.querySelector(
			'[data-role="toggle-icon"]',
		);
		this._toggleText = this.container.querySelector(
			'[data-role="toggle-text"]',
		);
		this._saveBtn = this.container.querySelector('[data-action="save"]');
	}

	_setupEventListeners() {
		// File-picker / drag-drop / camera events are owned by upload plugins.
		this._onClick = (e) => this._handleClick(e);
		this._onKeydown = (e) => this._handleKeydown(e);
		this.container.addEventListener('click', this._onClick);
		this.container.addEventListener('keydown', this._onKeydown);
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	toggleUpload() {
		this.isUploadOpen ? this.closeUpload() : this.openUpload();
	}

	openUpload() {
		if (this.readOnly) return; // no uploading in view-only mode
		this.isUploadOpen = true;
		this._panel.classList.add('is-open');
		this._toggleIcon.classList.add('is-rotated'); // plus rotates into an ×
		this._toggleText.innerText = this.options.labels.closeButton;
		this._notifyShow(); // e.g. camera plugin starts its stream
	}

	closeUpload() {
		this.isUploadOpen = false;
		this._notifyHide(); // e.g. camera plugin releases its stream
		this._panel.classList.remove('is-open');
		this._toggleIcon.classList.remove('is-rotated');
		this._toggleText.innerText = this.options.labels.addButton;
		this._clearUploadError();
	}

	_activePlugin() {
		return this._sources.find((p) => p.id === this.uploadMethod) || null;
	}
	_notifyShow() {
		const p = this._activePlugin();
		if (p && typeof p.onShow === 'function') p.onShow(this);
	}
	_notifyHide() {
		const p = this._activePlugin();
		if (p && typeof p.onHide === 'function') p.onHide(this);
	}

	// Register an upload SOURCE (a tab): { id, options.label, init(gallery),
	// renderArea(gallery), destroy(), onShow?, onHide? }. First registered is
	// the active tab. A source acquires files/urls and calls gallery.ingest().
	registerSource(source) {
		if (!source || this._sources.includes(source)) return;
		this._sources.push(source);
		if (typeof source.init === 'function') source.init(this);
		if (!this.uploadMethod) this.uploadMethod = source.id; // first = active
		this._renderTabs();
		this._renderActiveArea();
		if (this.isUploadOpen && this.uploadMethod === source.id)
			this._notifyShow();
	}

	unregisterSource(source) {
		const i = this._sources.indexOf(source);
		if (i < 0) return;
		if (typeof source.destroy === 'function') source.destroy();
		this._sources.splice(i, 1);
		if (this.uploadMethod === source.id)
			this.uploadMethod = this._sources.length
				? this._sources[0].id
				: null;
		this._renderTabs();
		this._renderActiveArea();
	}

	// Set the storage target ({ store(acquisition, ctx) => Promise<asset|null> }).
	// null restores the built-in local store (object URL for files, ref for urls).
	setTarget(target) {
		this._target = target || null;
	}

	// Toggle view-only mode after creation: hides the upload toggle + panel, the
	// save button, per-card delete, and the empty-state add button (CSS via
	// .is-readonly), and blocks UI-driven mutations. Item preview still works, and
	// the programmatic API (addAsset/removeAsset/ingest/…) is unaffected.
	setReadOnly(on) {
		this.readOnly = !!on;
		this._root.classList.toggle('is-readonly', this.readOnly);
		if (this.readOnly && this.isUploadOpen) this.closeUpload();
	}

	// Deprecated aliases — a combo "upload plugin" is just a source that does its
	// own storage (calls addFiles/addAsset directly).
	registerUploadPlugin(plugin) {
		this.registerSource(plugin);
	}
	unregisterUploadPlugin(plugin) {
		this.unregisterSource(plugin);
	}

	setMethod(id) {
		if (!this._sources.some((p) => p.id === id)) return;
		if (id === this.uploadMethod) return;
		this._notifyHide(); // stop the outgoing plugin (e.g. camera stream)
		this.uploadMethod = id;
		this._renderTabs();
		this._renderActiveArea();
		this._clearUploadError();
		if (this.isUploadOpen) this._notifyShow();
	}

	// --- plugin-facing helpers ---
	isFull() {
		return this._isFull();
	}
	showError(msg) {
		this._showUploadError(msg);
	}
	clearError() {
		this._clearUploadError();
	}

	addAsset(asset) {
		if (this._isFull()) return null; // gallery capacity backstop
		// newest-first + entrance animation for user-added cards
		const stored = this._insertAsset(asset, {
			animateIn: true,
			prepend: true,
		});
		if (!stored) return null;
		if (this.options.onAdd) this.options.onAdd(this, stored);
		return stored.id;
	}

	removeAsset(id) {
		id = id + '';
		if (!this.items.has(id)) return;
		if (this._confirmingId === id) this._disarmRemove();
		const asset = this.items.get(id);
		this.items.delete(id);
		this._revokeOwnedUrl(asset);
		const node = this._grid.querySelector(`[data-id="${id}"]`);
		this._removeCardNode(node, () => this._updateTotal());
		if (this.options.onRemove) this.options.onRemove(this, id, asset);
	}

	getAssets() {
		return Array.from(this.items.values()).map((a) => ({ ...a }));
	}

	// Image-type assets only (handy for wiring a previewer/lightbox).
	getImages() {
		return Array.from(this.items.values())
			.filter((a) => this._isImage(a.ext))
			.map((a) => ({ ...a }));
	}

	getCount() {
		return this.items.size;
	}

	clear() {
		this._disarmRemove();
		this._revokeAllOwnedUrls();
		this.items.clear();
		while (this._grid.firstChild) this._grid.firstChild.remove();
		this._updateTotal();
	}

	destroy() {
		if (this._confirmTimeout) clearTimeout(this._confirmTimeout);
		if (this._errorTimeout) clearTimeout(this._errorTimeout);
		this._revokeAllOwnedUrls();
		this._sources.forEach((p) => {
			if (typeof p.destroy === 'function') p.destroy();
		});
		this._sources = [];
		this.container.removeEventListener('click', this._onClick);
		this.container.removeEventListener('keydown', this._onKeydown);
		this.container.innerHTML = '';
		this.items = null;
		this.container = null;
		this.options = null;
	}

	// -------------------------------------------------------------------------
	// Internal — rendering
	// -------------------------------------------------------------------------

	_loadItems(rawItems) {
		if (!rawItems || !rawItems.length) return;
		rawItems.forEach((asset) => this._insertAsset(asset));
	}

	_insertAsset(asset, { animateIn = false, prepend = false } = {}) {
		if (!asset || !asset.name) return null;
		const id = 'asset-' + ++this._seq;
		const ext = (asset.ext || this._extOf(asset.name)).toUpperCase();
		const stored = {
			id,
			name: asset.name + '',
			size: asset.size || '',
			ext,
		};
		if (asset.url) stored.url = asset.url + ''; // optional preview source
		this.items.set(id, stored);
		// newest-first: user-added cards go to the top; initial items keep order
		this._grid.insertAdjacentHTML(
			prepend ? 'afterbegin' : 'beforeend',
			this._renderCard(stored),
		);
		const node = prepend
			? this._grid.firstElementChild
			: this._grid.lastElementChild;
		if (animateIn) this._enterCardNode(node);
		this._updateTotal();
		return stored;
	}

	// Play a one-shot entrance animation on a freshly inserted card.
	_enterCardNode(node) {
		if (!node || !this._shouldAnimate()) return;
		node.classList.add('is-entering');
		const done = (e) => {
			if (e.target !== node) return;
			node.classList.remove('is-entering');
			node.removeEventListener('animationend', done);
		};
		node.addEventListener('animationend', done);
	}

	// Segmented tabs, one per registered upload plugin.
	_renderTabs() {
		this._tabs.innerHTML = this._sources
			.map((p) => {
				const active = p.id === this.uploadMethod;
				const label = this._escape(
					(p.options && p.options.label) || p.id,
				);
				return `<button class="button is-small${
					active ? ' is-selected mg-tab-active' : ''
				}" data-action="method" data-method="${this._escape(p.id)}">${label}</button>`;
			})
			.join('');
	}

	// Render the active plugin's upload UI into the area.
	_renderActiveArea() {
		const p = this._sources.find((x) => x.id === this.uploadMethod);
		this._uploadArea.innerHTML = p ? p.renderArea(this) : '';
	}

	_renderCard(a) {
		const L = this.options.labels;
		return `
			<div class="column is-4-desktop is-4-tablet is-6-mobile" data-id="${a.id}">
				<div class="library-card">
					${this._renderPreview(a)}
					<div class="library-card-info">
						<div class="is-flex is-justify-content-between is-align-items-center">
							<div class="mg-card-meta">
								<p class="library-title" title="${this._escape(a.name)}">${this._escape(a.name)}</p>
								<p class="library-meta">${this._escape(a.size)}${a.size ? ' • ' : ''}${this._escape(a.ext)}</p>
							</div>
							<span class="mg-card-actions">
								<button class="btn-delete-asset mg-trash" data-action="remove" data-id="${a.id}" title="${this._escape(L.removeTitle)}" aria-label="${this._escape(L.removeTitle)}">
									<i class="fa-regular fa-trash-can"></i>
								</button>
								<span class="mg-confirm">
									<button class="btn-confirm-remove" data-action="remove-confirm" data-id="${a.id}" title="${this._escape(L.confirmRemoveTitle)}" aria-label="${this._escape(L.confirmRemoveTitle)}">
										<i class="fa-solid fa-check"></i>
									</button>
									<button class="btn-cancel-remove" data-action="remove-cancel" data-id="${a.id}" title="${this._escape(L.cancelTitle)}" aria-label="${this._escape(L.cancelTitle)}">
										<i class="fa-solid fa-xmark"></i>
									</button>
								</span>
							</span>
						</div>
					</div>
				</div>
			</div>`;
	}

	_renderPreview(a) {
		// Every card's preview is an activatable control (fires onItemClick) and
		// is keyboard-focusable for a11y.
		const attrs = `data-action="item" data-id="${a.id}" role="button" tabindex="0" aria-label="${this._escape(a.name)}"`;
		if (this._isImage(a.ext)) {
			// real thumbnail when the asset has a url, else a placeholder icon
			const inner = a.url
				? `<img class="mg-thumb" src="${this._escape(a.url)}" alt="${this._escape(a.name)}" loading="lazy" draggable="false">`
				: `<i class="fa-regular fa-image mg-img-icon"></i>`;
			return `<div class="mini-view mg-img-view" ${attrs}>${inner}</div>`;
		}
		if (a.ext === 'PDF') {
			return `
				<div class="mini-view pdf-indicator" ${attrs}>
					<span class="icon is-large mg-z2"><i class="fa-regular fa-file-pdf mg-pdf-icon"></i></span>
					<span class="format-badge badge-pdf mg-z2">${this._escape(a.ext)}</span>
				</div>`;
		}
		if (['XLS', 'XLSX', 'CSV'].includes(a.ext)) {
			return `
				<div class="mini-view xls-indicator" ${attrs}>
					<span class="icon is-large mg-z2"><i class="fa-regular fa-file-excel mg-xls-icon"></i></span>
					<span class="format-badge badge-xls mg-z2">${this._escape(a.ext)}</span>
				</div>`;
		}
		return `<div class="mini-view" ${attrs}><span class="icon is-large mg-z2"><i class="fa-regular fa-file mg-file-icon"></i></span></div>`;
	}

	// -------------------------------------------------------------------------
	// Internal — events
	// -------------------------------------------------------------------------

	_handleClick(e) {
		const trigger = e.target.closest('[data-action]');
		if (!trigger) return;

		// view-only: allow item preview, block every mutating action (defense in
		// depth — the controls are also hidden via .is-readonly CSS)
		if (this.readOnly && trigger.dataset.action !== 'item') return;

		switch (trigger.dataset.action) {
			case 'toggle-upload':
				this.toggleUpload();
				break;
			case 'open-upload':
				this.openUpload();
				break;
			case 'method':
				this.setMethod(trigger.dataset.method);
				break;
			case 'item': {
				const asset = this.items.get(trigger.dataset.id + '');
				if (asset && this.options.onItemClick)
					this.options.onItemClick(this, asset, asset.id);
				break;
			}
			case 'remove':
				this._requestRemove(trigger.dataset.id);
				break;
			case 'remove-confirm':
				this.removeAsset(trigger.dataset.id);
				break;
			case 'remove-cancel':
				this._disarmRemove();
				break;
			case 'save':
				this._handleSave();
				break;
		}
	}

	// Enter/Space activate any focusable role="button" control (cards, plugin
	// dropzones) by synthesizing a click. Native <button>s handle keys natively.
	_handleKeydown(e) {
		if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
		const el = e.target.closest('[role="button"]');
		if (!el || el.tagName === 'BUTTON' || !this.container.contains(el))
			return;
		e.preventDefault();
		el.click();
	}

	_handleSave() {
		if (this.options.onSave) this.options.onSave(this, this.getAssets());
	}

	// Ingest acquisitions — `{ file }` or `{ url, name?, ext? }`. The single
	// chokepoint: enforces capacity + per-file size, routes each through the
	// active target's store() (or the built-in local store), then adds the asset.
	async ingest(acquisitions) {
		const list = Array.from(acquisitions || []);
		const ctx = this._targetCtx();
		let rejectedForSpace = 0;
		for (const acq of list) {
			if (!acq) continue;
			if (this._isFull()) {
				rejectedForSpace++;
				continue;
			}
			if (
				acq.file &&
				this.options.maxSizeMB &&
				acq.file.size > this.options.maxSizeMB * 1024 * 1024
			) {
				this._showUploadError(
					this.options.labels.tooLarge(
						acq.file.name,
						this.options.maxSizeMB,
						this._formatSize(acq.file.size),
					),
				);
				if (this.options.onReject)
					this.options.onReject(this, acq.file, 'too-large');
				continue;
			}
			this._clearUploadError();
			try {
				const store = this._target
					? this._target.store.bind(this._target)
					: this._localStore.bind(this);
				const asset = await store(acq, ctx);
				if (asset) this.addAsset(asset);
			} catch (err) {
				this._showUploadError(
					(err && err.message) || 'Falha no upload.',
				);
				this.debug('error', err);
			}
		}
		if (rejectedForSpace > 0) {
			this._showUploadError(
				this.options.labels.limitReached(
					this.options.maxItems,
					rejectedForSpace,
				),
			);
		}
		this._setProgress('');
	}

	// Convenience for sources that hold raw File objects.
	addFiles(fileList) {
		this.ingest(Array.from(fileList).map((file) => ({ file })));
	}

	_isFull() {
		const max = this.options.maxItems || 0;
		return max > 0 && this.items.size >= max;
	}

	// Context handed to a target's store(): object URLs created via ctx.objectUrl
	// are tracked and revoked by the core; ctx.progress surfaces in the panel.
	_targetCtx() {
		return {
			gallery: this,
			options: this.options,
			labels: this.options.labels,
			objectUrl: (blob) => {
				const u = URL.createObjectURL(blob);
				this._objectUrls.add(u);
				return u;
			},
			progress: (msg) => this._setProgress(msg),
		};
	}

	// Default target (no setTarget): keep the file in the gallery. Files get a
	// tracked object URL (preview/download); url references are stored as-is.
	_localStore(acq, ctx) {
		if (acq.url) {
			return { name: acq.name || 'arquivo', ext: acq.ext, url: acq.url };
		}
		const f = acq.file;
		if (!f) return null;
		return {
			name: f.name,
			size: this._formatSize(f.size),
			ext: this._extOf(f.name),
			url: ctx.objectUrl(f),
		};
	}

	_setProgress(msg) {
		if (!this._uploadProgress) return;
		this._uploadProgress.hidden = !msg;
		this._uploadProgress.textContent = msg || '';
	}

	// Inline delete confirmation — one card armed at a time, auto-cancels.
	_requestRemove(id) {
		if (!this.options.confirmRemove) {
			this.removeAsset(id);
			return;
		}
		this._armRemove(id);
	}

	_armRemove(id) {
		id = id + '';
		if (this._confirmingId === id) return;
		this._disarmRemove();
		const node = this._grid.querySelector(`[data-id="${id}"]`);
		if (!node) return;
		node.classList.add('is-confirming');
		this._confirmingId = id;
		this._confirmTimeout = setTimeout(() => this._disarmRemove(), 4000);
	}

	_disarmRemove() {
		if (this._confirmTimeout) {
			clearTimeout(this._confirmTimeout);
			this._confirmTimeout = null;
		}
		if (this._confirmingId) {
			const node = this._grid.querySelector(
				`[data-id="${this._confirmingId}"]`,
			);
			if (node) node.classList.remove('is-confirming');
			this._confirmingId = null;
		}
	}

	// Animate the card out (fade + shrink) before detaching it, then onDone().
	_removeCardNode(node, onDone) {
		if (!node || !this._shouldAnimate()) {
			if (node) node.remove();
			onDone();
			return;
		}
		let finished = false;
		let fallback = null;
		const finish = () => {
			if (finished) return;
			finished = true;
			clearTimeout(fallback);
			node.removeEventListener('transitionend', onEnd);
			node.remove();
			onDone();
		};
		const onEnd = (e) => {
			if (e.target === node) finish();
		};
		node.addEventListener('transitionend', onEnd);
		fallback = setTimeout(finish, 420); // safety net if transitionend is missed
		node.classList.add('is-removing'); // triggers the CSS transition
	}

	_shouldAnimate() {
		return (
			this.options.animate &&
			!(
				window.matchMedia &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches
			)
		);
	}

	_showUploadError(msg) {
		if (this._errorTimeout) clearTimeout(this._errorTimeout);
		this._uploadError.textContent = msg;
		this._uploadError.hidden = false;
		this._errorTimeout = setTimeout(() => this._clearUploadError(), 6000);
	}

	_clearUploadError() {
		if (this._errorTimeout) {
			clearTimeout(this._errorTimeout);
			this._errorTimeout = null;
		}
		this._uploadError.hidden = true;
		this._uploadError.textContent = '';
	}

	// -------------------------------------------------------------------------
	// Internal — helpers
	// -------------------------------------------------------------------------

	_updateTotal() {
		const total = this.items.size;
		const max = this.options.maxItems || 0;
		this._counter.innerText = this.options.labels.counter(total, max);
		this._root.classList.toggle('is-full', this._isFull());
		if (this._saveBtn) this._saveBtn.disabled = total === 0; // nothing to save
		if (total === 0) {
			this._grid.style.display = 'none';
			this._empty.style.display = 'flex';
		} else {
			this._grid.style.display = 'flex';
			this._empty.style.display = 'none';
		}
	}

	_extOf(name) {
		const parts = (name + '').split('.');
		return parts.length > 1 ? parts.pop() : '';
	}

	_isImage(ext) {
		return ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(
			(ext || '').toUpperCase(),
		);
	}

	// Revoke object URLs we created (never caller-supplied urls like the demo's).
	_revokeOwnedUrl(asset) {
		if (asset && asset.url && this._objectUrls.has(asset.url)) {
			URL.revokeObjectURL(asset.url);
			this._objectUrls.delete(asset.url);
		}
	}

	_revokeAllOwnedUrls() {
		this._objectUrls.forEach((u) => URL.revokeObjectURL(u));
		this._objectUrls.clear();
	}

	_escape(str) {
		// Escapes both text and attribute contexts (quotes included).
		return (str + '').replace(
			/[&<>"']/g,
			(c) =>
				({
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#39;',
				})[c],
		);
	}

	_formatSize(bytes) {
		if (typeof bytes !== 'number') return '';
		const mb = bytes / 1024 / 1024;
		if (mb >= 1) return mb.toFixed(1) + ' MB';
		return Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}

	debug(method, ...args) {
		if (this.options.isDebug) console[method](...args);
	}
}

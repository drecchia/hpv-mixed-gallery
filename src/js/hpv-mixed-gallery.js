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
			// --- labels (pt-BR defaults, from the source prototype)
			title: 'Arquivos e Imagens',
			subtitle:
				'Gerencie documentos técnicos e imagens anexadas de forma integrada.',
			acceptHint: 'Formatos aceitos: PDF, XLSX, JPG, PNG até 15MB',
			saveLabel: 'Salvar Galeria',
			// --- behavior
			accept: '', // native <input> accept attribute, e.g. '.pdf,.jpg'
			enableCamera: true, // show the "Captura de Câmera" tab
			// --- callbacks
			onAdd: null, // fn(component, asset)
			onRemove: null, // fn(component, id, asset)
			onSave: null, // fn(component, assets)
			onCreate: null, // fn(component)
			isDebug: false,
		};

		this.options = { ...this.defaultOptions, ...options };
		this.container = document.getElementById(containerId);

		if (!this.container)
			throw new HpvMixedGalleryError(
				`Container #${containerId} not found`,
			);

		// state
		this.items = new Map(); // id(string) -> asset
		this.isUploadOpen = false;
		this.uploadMethod = 'local'; // 'local' | 'camera'
		this._seq = 0;

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
		this.container.innerHTML = `
			<div class="hpv-mixed-gallery">
				<div class="columns is-mobile is-vcentered mb-5">
					<div class="column">
						<h1 class="title is-5 mb-1 mg-title">${o.title}</h1>
						<p class="subtitle is-7 mb-0 mg-subtitle">${o.subtitle}</p>
					</div>
					<div class="column is-narrow">
						<button class="button is-small is-dark mg-accent-btn" data-action="toggle-upload">
							<span class="icon is-small"><i class="fa-solid fa-plus mg-toggle-icon" data-role="toggle-icon"></i></span>
							<span data-role="toggle-text">Adicionar</span>
						</button>
					</div>
				</div>

				<div class="upload-disclosure-panel" data-role="upload-panel">
					<div class="field mb-3">
						<label class="label is-size-7 mg-subtitle">Origem do arquivo:</label>
						<div class="buttons has-addons mb-0">
							<button class="button is-small is-selected mg-tab-active" data-action="method" data-method="local" data-role="tab-local">Upload Local</button>
							${
								o.enableCamera
									? `<button class="button is-small" data-action="method" data-method="camera" data-role="tab-camera">Captura de Câmera</button>`
									: ''
							}
						</div>
					</div>
					<div data-role="upload-area">${this._renderUploadArea()}</div>
				</div>

				<div class="mb-5">
					<h2 class="is-size-7 has-text-weight-bold has-text-grey mg-section-title mb-4">Itens Salvos</h2>
					<div class="columns is-multiline is-mobile" data-role="grid" style="display: none;"></div>
					<div class="empty-state-wrapper" data-role="empty">
						<div class="mb-2 mg-empty-icon">
							<span class="icon is-large"><i class="fa-regular fa-folder-open fa-3x"></i></span>
						</div>
						<h3 class="title is-6 mb-2 mg-empty-title">Nenhum arquivo anexado</h3>
						<p class="is-size-7 has-text-grey mb-4 mg-empty-text">Comece a compilar seu inventário subindo fotos técnicas do rack ou relatórios PDF de configuração.</p>
						<button class="button is-small is-light mg-empty-btn" data-action="open-upload">
							<i class="fa-solid fa-plus-circle mr-1"></i> Anexar Primeiro Arquivo
						</button>
					</div>
				</div>

				<div class="is-flex is-justify-content-space-between is-align-items-center pt-4 mg-footer">
					<span class="is-size-7 has-text-grey mg-counter" data-role="counter">Mostrando 0 item(ns)</span>
					<button class="button is-small is-dark mg-accent-btn mg-save-btn" data-action="save">${o.saveLabel}</button>
				</div>

				<input type="file" data-role="file-input" style="display: none;" ${
					o.accept ? `accept="${o.accept}"` : ''
				}>
			</div>`;

		// cache refs
		this._panel = this.container.querySelector(
			'[data-role="upload-panel"]',
		);
		this._uploadArea = this.container.querySelector(
			'[data-role="upload-area"]',
		);
		this._grid = this.container.querySelector('[data-role="grid"]');
		this._empty = this.container.querySelector('[data-role="empty"]');
		this._counter = this.container.querySelector('[data-role="counter"]');
		this._fileInput = this.container.querySelector(
			'[data-role="file-input"]',
		);
		this._toggleIcon = this.container.querySelector(
			'[data-role="toggle-icon"]',
		);
		this._toggleText = this.container.querySelector(
			'[data-role="toggle-text"]',
		);
	}

	_setupEventListeners() {
		this._onClick = (e) => this._handleClick(e);
		this._onFileChange = (e) => this._handleFileChange(e);
		this._onDragOver = (e) => this._handleDragOver(e);
		this._onDragLeave = (e) => this._handleDragLeave(e);
		this._onDrop = (e) => this._handleDrop(e);

		this.container.addEventListener('click', this._onClick);
		this.container.addEventListener('change', this._onFileChange);
		this.container.addEventListener('dragover', this._onDragOver);
		this.container.addEventListener('dragleave', this._onDragLeave);
		this.container.addEventListener('drop', this._onDrop);
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	toggleUpload() {
		this.isUploadOpen ? this.closeUpload() : this.openUpload();
	}

	openUpload() {
		this.isUploadOpen = true;
		this._panel.classList.add('is-open');
		this._toggleIcon.classList.add('is-rotated'); // plus rotates into an ×
		this._toggleText.innerText = 'Fechar';
	}

	closeUpload() {
		this.isUploadOpen = false;
		this._panel.classList.remove('is-open');
		this._toggleIcon.classList.remove('is-rotated');
		this._toggleText.innerText = 'Adicionar';
	}

	setMethod(method) {
		if (method !== 'local' && method !== 'camera') return;
		this.uploadMethod = method;

		const local = this.container.querySelector('[data-role="tab-local"]');
		const cam = this.container.querySelector('[data-role="tab-camera"]');
		if (local)
			local.className =
				'button is-small' +
				(method === 'local' ? ' is-selected mg-tab-active' : '');
		if (cam)
			cam.className =
				'button is-small' +
				(method === 'camera' ? ' is-selected mg-tab-active' : '');

		this._uploadArea.innerHTML = this._renderUploadArea();
	}

	addAsset(asset) {
		const stored = this._insertAsset(asset);
		if (!stored) return null;
		if (this.options.onAdd) this.options.onAdd(this, stored);
		return stored.id;
	}

	removeAsset(id) {
		id = id + '';
		if (!this.items.has(id)) return;
		const asset = this.items.get(id);
		this.items.delete(id);
		const node = this._grid.querySelector(`[data-id="${id}"]`);
		if (node) node.remove();
		this._updateTotal();
		if (this.options.onRemove) this.options.onRemove(this, id, asset);
	}

	getAssets() {
		return Array.from(this.items.values()).map(
			({ id, name, size, ext }) => ({
				id,
				name,
				size,
				ext,
			}),
		);
	}

	getCount() {
		return this.items.size;
	}

	clear() {
		this.items.clear();
		while (this._grid.firstChild) this._grid.firstChild.remove();
		this._updateTotal();
	}

	destroy() {
		this.container.removeEventListener('click', this._onClick);
		this.container.removeEventListener('change', this._onFileChange);
		this.container.removeEventListener('dragover', this._onDragOver);
		this.container.removeEventListener('dragleave', this._onDragLeave);
		this.container.removeEventListener('drop', this._onDrop);
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

	_insertAsset(asset) {
		if (!asset || !asset.name) return null;
		const id = 'asset-' + ++this._seq;
		const ext = (asset.ext || this._extOf(asset.name)).toUpperCase();
		const stored = {
			id,
			name: asset.name + '',
			size: asset.size || '',
			ext,
		};
		this.items.set(id, stored);
		this._grid.insertAdjacentHTML('beforeend', this._renderCard(stored));
		this._updateTotal();
		return stored;
	}

	_renderUploadArea() {
		if (this.uploadMethod === 'camera') {
			return `
				<div class="photon-dropzone" data-action="camera">
					<span class="icon is-large mb-2 mg-cam-icon"><i class="fa-solid fa-camera fa-2x"></i></span>
					<p class="is-size-7 has-text-weight-semibold">Capturar da Câmera</p>
					<p class="is-size-7 has-text-grey mt-1">Conectando câmera do terminal ou tablet integrado...</p>
				</div>`;
		}
		return `
			<div class="photon-dropzone" data-action="pick" data-role="dropzone">
				<span class="icon is-large mb-2 mg-up-icon"><i class="fa-solid fa-cloud-arrow-up fa-2x"></i></span>
				<p class="is-size-7 has-text-weight-semibold">Clique para buscar ou arraste seu arquivo para cá</p>
				<p class="is-size-7 has-text-grey mt-1">${this.options.acceptHint}</p>
			</div>`;
	}

	_renderCard(a) {
		return `
			<div class="column is-4-desktop is-4-tablet is-6-mobile" data-id="${a.id}">
				<div class="library-card">
					${this._renderPreview(a.ext)}
					<div class="library-card-info">
						<div class="is-flex is-justify-content-between is-align-items-center">
							<div class="mg-card-meta">
								<p class="library-title" title="${this._escape(a.name)}">${this._escape(a.name)}</p>
								<p class="library-meta">${this._escape(a.size)}${a.size ? ' • ' : ''}${this._escape(a.ext)}</p>
							</div>
							<button class="btn-delete-asset" data-action="remove" data-id="${a.id}">
								<i class="fa-regular fa-trash-can"></i>
							</button>
						</div>
					</div>
				</div>
			</div>`;
	}

	_renderPreview(ext) {
		if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(ext)) {
			return `<div class="mini-view mg-img-view"><i class="fa-regular fa-image mg-img-icon"></i></div>`;
		}
		if (ext === 'PDF') {
			return `
				<div class="mini-view pdf-indicator">
					<span class="icon is-large mg-z2"><i class="fa-regular fa-file-pdf mg-pdf-icon"></i></span>
					<span class="format-badge badge-pdf mg-z2">PDF</span>
				</div>`;
		}
		if (['XLS', 'XLSX', 'CSV'].includes(ext)) {
			return `
				<div class="mini-view xls-indicator">
					<span class="icon is-large mg-z2"><i class="fa-regular fa-file-excel mg-xls-icon"></i></span>
					<span class="format-badge badge-xls mg-z2">XLSX</span>
				</div>`;
		}
		return `<div class="mini-view"><span class="icon is-large mg-z2"><i class="fa-regular fa-file mg-file-icon"></i></span></div>`;
	}

	// -------------------------------------------------------------------------
	// Internal — events
	// -------------------------------------------------------------------------

	_handleClick(e) {
		const trigger = e.target.closest('[data-action]');
		if (!trigger) return;

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
			case 'pick':
				this._fileInput.click();
				break;
			case 'camera':
				this._simulateCameraSnap();
				break;
			case 'remove':
				this.removeAsset(trigger.dataset.id);
				break;
			case 'save':
				this._handleSave();
				break;
		}
	}

	_handleFileChange(e) {
		if (!e.target.matches('[data-role="file-input"]')) return;
		const files = e.target.files;
		if (!files || !files.length) return;
		Array.from(files).forEach((file) => this._addFromFile(file));
		e.target.value = ''; // allow re-selecting the same file
	}

	_handleDragOver(e) {
		const zone = e.target.closest('[data-role="dropzone"]');
		if (!zone) return;
		e.preventDefault();
		zone.classList.add('is-dragover');
	}

	_handleDragLeave(e) {
		const zone = e.target.closest('[data-role="dropzone"]');
		if (zone) zone.classList.remove('is-dragover');
	}

	_handleDrop(e) {
		const zone = e.target.closest('[data-role="dropzone"]');
		if (!zone) return;
		e.preventDefault();
		zone.classList.remove('is-dragover');
		const files = e.dataTransfer && e.dataTransfer.files;
		if (!files || !files.length) return;
		Array.from(files).forEach((file) => this._addFromFile(file));
	}

	_handleSave() {
		if (this.options.onSave) this.options.onSave(this, this.getAssets());
	}

	_addFromFile(file) {
		this.addAsset({
			name: file.name,
			size: this._formatSize(file.size),
			ext: this._extOf(file.name),
		});
	}

	_simulateCameraSnap() {
		this.addAsset({
			name: 'foto_painel_hardware.jpg',
			size: '840 KB',
			ext: 'JPG',
		});
	}

	// -------------------------------------------------------------------------
	// Internal — helpers
	// -------------------------------------------------------------------------

	_updateTotal() {
		const total = this.items.size;
		this._counter.innerText = `Mostrando ${total} item(ns)`;
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

	_escape(str) {
		const div = document.createElement('div');
		div.textContent = str + '';
		return div.innerHTML;
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

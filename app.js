/**
 * WebNotes – Autarke GoodNotes-Alternative (app.js – Teil 1: Meilenstein 3)
 * Fokus:
 *  - Wacom Cintiq 22 (Wacom Pro Pen 2) & iPad (Apple Pencil) Ultra-Low-Latency Zeichen-Engine
 *  - Kugelsichere Palm Rejection (Pen-Lock, 2-Finger-Touch-Gate, 500ms Toolbar-Palm-Shield)
 *  - 240Hz Coalesced Sub-Pixel Events + quadratische Bézier-Glättung ohne Nachzieh-Effekt
 *  - 450ms Hold-to-Snap für gerade Linien mit Gummiband & Winkel-Snapping (0°, 45°, 90° ±3°)
 *  - Multiply-Marker (Highlighter) ohne Selbst-Abdunkeln innerhalb eines Zuges
 *  - Strich- & Teil-Radierer, Lasso-Auswahl, Formen, Textfelder/Sprechblasen, Lineal & Dashboard-UI
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. KONSTANTEN & GLOBALER APP-STATE
    // =========================================================================
    const PAGE_WIDTH = 1120;
    const PAGE_HEIGHT = 1584; // Exaktes DIN-A4 Seitenverhältnis (1 : 1.414285)
    const HOLD_TO_SNAP_MS = 450;
    const HOLD_RADIUS_PX = 5.0;
    const PALM_SHIELD_COOLDOWN_MS = 500;

    const AppState = {
        authenticated: false,
        folders: [],
        notebooks: [],
        selectedFolderId: 'all',
        searchQuery: '',
        sortOrder: 'modified_desc',

        // Aktuell geöffnetes Heft
        currentNotebook: null,   // meta.json Inhalt
        currentPageIndex: 0,
        pagesCache: {},          // pageId -> { strokes, shapes, texts, images, stickers, backgroundAsset, lastModified }
        assetImageCache: {},     // url -> HTMLImageElement

        // Undo / Redo Stacks pro Seite (pageId -> { undo: [], redo: [] })
        historyByPage: {},

        // Werkzeug-Status
        activeTool: 'pen',          // 'lasso' | 'pen' | 'eraser' | 'text' | 'sticker' | 'image' | 'shapes' | 'laser'
        penSubMode: 'ballpoint',    // 'ballpoint' | 'highlighter' | 'shape_draw'
        eraserMode: 'stroke',       // 'stroke' | 'partial'
        shapeType: 'line',          // 'line' | 'arrow' | 'rect' | 'ellipse' | 'callout' | 'axes'
        activeColor: '#111827',

        // 3 frei belegbare Strichstärken-Slots (separat für Kugelschreiber & Marker)
        widthSlots: {
            ballpoint: [2.2, 4.0, 8.5],
            highlighter: [14.0, 24.0, 36.0],
            shape_draw: [2.5, 4.0, 6.5]
        },
        activeWidthSlot: 1,

        // Viewport-Transformation (Pan & Zoom)
        viewZoom: 0.75,
        viewPanX: 0,
        viewPanY: 0,

        // Wacom Cintiq 22 & iPad Pointer-Tracking & Palm Rejection
        activePenPointerId: null,
        isPenDrawing: false,
        lastPenActivityTime: 0,
        palmShieldTimer: null,
        tempHardwareEraser: false,

        // 2-Finger-Touch-Geste (Einzelner Touch wird komplett ignoriert!)
        touchPointers: new Map(),   // pointerId -> { x, y }
        pinchState: null,           // { startDist, startMidX, startMidY, startZoom, startPanX, startPanY }

        // Maus-Panning (Rechte/Mittlere Maustaste oder Leertaste + Ziehen)
        mousePanState: null,
        isSpacePressed: false,

        // Aktueller Strich & 450ms Hold-to-Snap
        currentStroke: null,        // { id, mode, color, width, points: [{x,y,t}], isSnappedLine: false }
        holdSnapTimer: null,
        lastMovePoint: null,

        // Aktuelle Form beim Aufziehen
        activeShapeDraft: null,

        // Lasso-Auswahl
        lassoPolygon: [],
        lassoSelection: null,       // { strokeIds:[], shapeIds:[], textIds:[], imageIds:[], stickerIds:[], bounds:{x,y,w,h}, dragMode:null, startPt:null }

        // Interaktive Bild-Bearbeitung (Antippen, Verschieben, Skalieren, Drehen – PC & Touch)
        selectedImageId: null,
        imageDragState: null,       // { pointerId, mode: 'move'|'scale'|'rotate', imgId, startPt, origImg, corner }

        // Interaktive Labor-Geräte (Chemix-Stil)
        selectedLabId: null,
        labDragState: null,         // { pointerId, mode: 'move'|'scale'|'rotate', labId, startPt, origLab, corner }

        // Laserpointer-Spuren
        laserTrails: [],
        laserAnimFrame: null,

        // Interaktives Lineal
        ruler: {
            visible: false,
            x: 220,
            y: 420,
            angleDeg: 0,
            dragging: false,
            rotating: false,
            dragStartX: 0,
            dragStartY: 0,
            startRulerX: 0,
            startRulerY: 0,
            startAngle: 0
        },

        //Inline-Text-Editor
        editingTextObj: null,

        // Auto-Save Debounce
        saveTimers: {}
    };

    // Globale Referenz für Teil 2 (Meilenstein 4: PDF-Pipeline & Offline-Sync)
    window.WebNotesApp = {
        state: AppState
    };

    // =========================================================================
    // 2. DOM-REFERENZEN & CANVAS-KONTEXTE (DESYNCHRONIZED ULTRA-LOW-LATENCY)
    // =========================================================================
    const DOM = {};
    let bgCtx = null;
    let mainCtx = null;
    let hiCtx = null;
    let uiCtx = null;

    function initDOMReferences() {
        DOM.loginOverlay = document.getElementById('login-overlay');
        DOM.loginForm = document.getElementById('login-form');
        DOM.loginPassword = document.getElementById('login-password');
        DOM.loginError = document.getElementById('login-error');

        DOM.dashboardView = document.getElementById('dashboard-view');
        DOM.editorView = document.getElementById('editor-view');

        DOM.folderList = document.getElementById('folder-list');
        DOM.notebooksGrid = document.getElementById('notebooks-grid');
        DOM.currentFolderTitle = document.getElementById('current-folder-title');
        DOM.currentFolderCount = document.getElementById('current-folder-count');
        DOM.dashSearchInput = document.getElementById('dash-search-input');
        DOM.sortNotebooksSelect = document.getElementById('sort-notebooks-select');

        DOM.editorHeader = document.getElementById('editor-header');
        DOM.pagesSidebar = document.getElementById('pages-sidebar');
        DOM.thumbnailsGrid = document.getElementById('thumbnails-grid');
        DOM.notebookTitleInput = document.getElementById('editor-notebook-title');
        DOM.pageIndicatorText = document.getElementById('page-indicator-text');

        DOM.canvasViewport = document.getElementById('canvas-viewport');
        DOM.transformStage = document.getElementById('canvas-transform-stage');
        DOM.sheetContainer = document.getElementById('page-sheet-container');

        DOM.bgCanvas = document.getElementById('bg-canvas');
        DOM.mainCanvas = document.getElementById('main-canvas');
        DOM.hiCanvas = document.getElementById('highlighter-stroke-canvas');
        DOM.uiCanvas = document.getElementById('ui-canvas');

        DOM.rulerEl = document.getElementById('interactive-ruler');
        DOM.rulerAngleBadge = document.getElementById('ruler-angle-badge');
        DOM.lassoBar = document.getElementById('lasso-floating-bar');
        DOM.imageBar = document.getElementById('image-floating-bar');
        DOM.canvasToast = document.getElementById('canvas-toast');

        DOM.inlineTextWrap = document.getElementById('inline-text-editor-wrap');
        DOM.inlineTextArea = document.getElementById('inline-text-area');
        DOM.textFontSize = document.getElementById('text-font-size');
        DOM.textHasBox = document.getElementById('text-has-box');
        DOM.textHasBubble = document.getElementById('text-has-Bubble');

        // Initialisiere alle 4 Canvas-Layer in nativer A4-Auflösung (mit DPR-Skalierung)
        setupCanvasLayers();
    }

    function setupCanvasLayers() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // WICHTIG FÜR PC & IPAD PERFORMANCE:
        // Auf Windows/Chrome führt { desynchronized: true } auf einem Canvas innerhalb eines
        // CSS-transformierten Containers (scale/translate) zu extremem Compositor-Lag.
        // Ohne desynchronized-Konflikt + mit inkrementellem Segment-Drawing läuft es mit 0ms Lag!
        const layers = [
            { canvas: DOM.bgCanvas },
            { canvas: DOM.mainCanvas },
            { canvas: DOM.hiCanvas },
            { canvas: DOM.uiCanvas }
        ];

        layers.forEach(({ canvas }) => {
            canvas.width = PAGE_WIDTH * dpr;
            canvas.height = PAGE_HEIGHT * dpr;
            canvas.style.width = PAGE_WIDTH + 'px';
            canvas.style.height = PAGE_HEIGHT + 'px';

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (canvas === DOM.bgCanvas) bgCtx = ctx;
            if (canvas === DOM.mainCanvas) mainCtx = ctx;
            if (canvas === DOM.hiCanvas) hiCtx = ctx;
            if (canvas === DOM.uiCanvas) uiCtx = ctx;
        });
    }

    // =========================================================================
    // 3. API-KOMMUNIKATION & AUTHENTIFIZIERUNG (+ STATISCHER DEMO-MODUS FÜR GITHUB PAGES)
    // =========================================================================
    const STATIC_DEMO_STORAGE_KEY = 'webnotes_static_demo_store_v1';
    let isStaticDemoMode = (
        window.location.hostname.endsWith('.github.io') ||
        window.location.protocol === 'file:' ||
        new URLSearchParams(window.location.search).get('demo') === '1'
    );
    let staticDemoMemStore = null;

    function createEmptyDemoPage(pageId, now) {
        return {
            pageId,
            lastModified: now,
            strokes: [],
            shapes: [],
            texts: [],
            images: [],
            stickers: [],
            labItems: [],
            backgroundAsset: null
        };
    }

    function createDefaultDemoStore() {
        const now = Date.now();
        const nbId = 'nb_demo_5ntb';
        const coverId = 'page_cover_1';
        const page1Id = 'page_sheet_1';
        return {
            folders: [
                { id: 'fld_mint', name: '5 NTB – Natur & Technik', color: '#6ea864', createdAt: now, order: 1 },
                { id: 'fld_chemie', name: 'Chemie & Übungen', color: '#2b579a', createdAt: now, order: 2 },
                { id: 'fld_allgemein', name: 'Tafelanschriebe', color: '#d97706', createdAt: now, order: 3 }
            ],
            notebooks: {
                [nbId]: {
                    meta: {
                        id: nbId,
                        title: '5 NTB – Natur und Technik (Demo)',
                        folderId: 'fld_mint',
                        createdAt: now,
                        lastModified: now,
                        coverStyle: {
                            preset: 'sage',
                            bgColor: '#88b378',
                            spineColor: '#a3c995',
                            pattern: 'school_label',
                            labelTitle: '5 NTB',
                            labelSub: 'Demo-Heft (Lokal)'
                        },
                        pages: [
                            {
                                id: coverId,
                                isCover: true,
                                paperColor: '#88b378',
                                paperTemplate: 'cover_sage',
                                backgroundAsset: null,
                                lastModified: now
                            },
                            {
                                id: page1Id,
                                isCover: false,
                                paperColor: '#fbf8ee',
                                paperTemplate: 'grid_5mm',
                                backgroundAsset: null,
                                lastModified: now
                            }
                        ]
                    },
                    pages: {
                        [coverId]: createEmptyDemoPage(coverId, now),
                        [page1Id]: createEmptyDemoPage(page1Id, now)
                    }
                }
            }
        };
    }

    function loadStaticDemoStore() {
        if (staticDemoMemStore) return staticDemoMemStore;
        try {
            const raw = localStorage.getItem(STATIC_DEMO_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.folders) && parsed.notebooks && typeof parsed.notebooks === 'object') {
                    staticDemoMemStore = parsed;
                    return staticDemoMemStore;
                }
            }
        } catch (_) {}
        staticDemoMemStore = createDefaultDemoStore();
        saveStaticDemoStore(staticDemoMemStore);
        return staticDemoMemStore;
    }

    function saveStaticDemoStore(store) {
        staticDemoMemStore = store;
        try {
            localStorage.setItem(STATIC_DEMO_STORAGE_KEY, JSON.stringify(store));
        } catch (err) {
            console.warn('Demo-Speicher (localStorage Quota erreicht – bleibt im Arbeitsspeicher aktiv):', err);
        }
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
            reader.readAsDataURL(blob);
        });
    }

    async function handleStaticDemoApiCall(action, payload = null) {
        const store = loadStaticDemoStore();
        const body = (payload && !(payload instanceof FormData)) ? payload : {};
        const now = Date.now();
        const clone = (obj) => JSON.parse(JSON.stringify(obj));

        if (action === 'auth_status' || action === 'ping') {
            return { ok: true, authenticated: true, serverTime: now, _httpStatus: 200 };
        }

        if (action === 'dashboard') {
            const notebooks = Object.values(store.notebooks).map(entry => {
                const m = entry.meta;
                return {
                    id: m.id,
                    title: m.title || 'Unbenanntes Heft',
                    folderId: m.folderId || 'fld_mint',
                    createdAt: m.createdAt || 0,
                    lastModified: m.lastModified || 0,
                    coverStyle: m.coverStyle || {},
                    pageCount: Array.isArray(m.pages) ? m.pages.length : 0,
                    firstPageId: (m.pages && m.pages[0]) ? m.pages[0].id : null
                };
            }).sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

            return { ok: true, folders: clone(store.folders), notebooks: clone(notebooks), serverTime: now, _httpStatus: 200 };
        }

        if (action === 'save_folders') {
            store.folders = Array.isArray(body.folders) ? clone(body.folders) : [];
            saveStaticDemoStore(store);
            return { ok: true, folders: clone(store.folders), lastModified: now, _httpStatus: 200 };
        }

        if (action === 'create_notebook') {
            const nbId = body.id || ('nb_' + now + '_' + Math.random().toString(36).slice(2, 8));
            const title = (body.title || 'Neues Heft').trim();
            const folderId = body.folderId || 'fld_mint';
            const paperColor = body.paperColor || '#fbf8ee';
            const paperTemplate = body.paperTemplate || 'grid_5mm';
            const coverStyle = body.coverStyle || {
                preset: 'sage', bgColor: '#88b378', spineColor: '#a3c995',
                pattern: 'school_label', labelTitle: title, labelSub: 'Demo'
            };
            const hasCover = body.hasCover !== undefined ? !!body.hasCover : true;
            const pages = [];
            const pagesMap = {};

            if (hasCover) {
                const coverId = 'page_cov_' + Math.random().toString(36).slice(2, 10);
                pages.push({
                    id: coverId,
                    isCover: true,
                    paperColor: coverStyle.bgColor || '#88b378',
                    paperTemplate: 'cover_' + (coverStyle.preset || 'sage'),
                    backgroundAsset: null,
                    lastModified: now
                });
                pagesMap[coverId] = createEmptyDemoPage(coverId, now);
            }

            const page1Id = 'page_' + Math.random().toString(36).slice(2, 10);
            pages.push({
                id: page1Id,
                isCover: false,
                paperColor,
                paperTemplate,
                backgroundAsset: null,
                lastModified: now
            });
            pagesMap[page1Id] = createEmptyDemoPage(page1Id, now);

            const meta = { id: nbId, title, folderId, createdAt: now, lastModified: now, coverStyle, pages };
            store.notebooks[nbId] = { meta, pages: pagesMap };
            saveStaticDemoStore(store);
            return { ok: true, notebook: clone(meta), _httpStatus: 200 };
        }

        if (action === 'duplicate_notebook') {
            const src = store.notebooks[body.notebookId];
            if (!src) return { ok: false, error: 'Quell-Heft nicht gefunden.', _httpStatus: 404 };
            const newId = 'nb_' + now + '_' + Math.random().toString(36).slice(2, 8);
            const copy = clone(src);
            copy.meta.id = newId;
            copy.meta.title = (copy.meta.title || 'Heft') + ' (Kopie)';
            copy.meta.createdAt = now;
            copy.meta.lastModified = now;
            store.notebooks[newId] = copy;
            saveStaticDemoStore(store);
            return { ok: true, notebook: clone(copy.meta), _httpStatus: 200 };
        }

        if (action === 'delete_notebook') {
            const nbId = body.notebookId;
            if (!store.notebooks[nbId]) return { ok: false, error: 'Heft nicht gefunden.', _httpStatus: 404 };
            delete store.notebooks[nbId];
            saveStaticDemoStore(store);
            return { ok: true, deletedId: nbId, _httpStatus: 200 };
        }

        if (action === 'get_notebook' || action === 'poll_meta') {
            const entry = store.notebooks[body.notebookId];
            if (!entry) return { ok: false, error: 'Heft nicht gefunden.', _httpStatus: 404 };
            return { ok: true, meta: clone(entry.meta), serverTime: now, _httpStatus: 200 };
        }

        if (action === 'get_all_pages') {
            const entry = store.notebooks[body.notebookId];
            if (!entry) return { ok: false, error: 'Heft nicht gefunden.', _httpStatus: 404 };
            return { ok: true, meta: clone(entry.meta), pages: clone(entry.pages), _httpStatus: 200 };
        }

        if (action === 'get_page') {
            const entry = store.notebooks[body.notebookId];
            if (!entry) return { ok: false, error: 'Heft nicht gefunden.', _httpStatus: 404 };
            if (!entry.pages[body.pageId]) {
                entry.pages[body.pageId] = createEmptyDemoPage(body.pageId, now);
                saveStaticDemoStore(store);
            }
            return { ok: true, page: clone(entry.pages[body.pageId]), _httpStatus: 200 };
        }

        if (action === 'save_meta') {
            const entry = store.notebooks[body.notebookId];
            if (!entry) return { ok: false, error: 'Heft nicht gefunden.', _httpStatus: 404 };
            if (body.title !== undefined) entry.meta.title = String(body.title).trim();
            if (body.folderId !== undefined) entry.meta.folderId = String(body.folderId);
            if (body.coverStyle && typeof body.coverStyle === 'object') entry.meta.coverStyle = clone(body.coverStyle);
            if (Array.isArray(body.pages)) {
                const keepIds = new Set();
                entry.meta.pages = body.pages.map(p => {
                    keepIds.add(p.id);
                    if (!entry.pages[p.id]) {
                        if (p.duplicateFrom && entry.pages[p.duplicateFrom]) {
                            const dup = clone(entry.pages[p.duplicateFrom]);
                            dup.pageId = p.id;
                            dup.lastModified = now;
                            entry.pages[p.id] = dup;
                        } else {
                            entry.pages[p.id] = createEmptyDemoPage(p.id, now);
                        }
                    }
                    const { duplicateFrom, ...cleanMeta } = p;
                    return { ...cleanMeta, lastModified: cleanMeta.lastModified || now };
                });
                Object.keys(entry.pages).forEach(pid => {
                    if (!keepIds.has(pid)) delete entry.pages[pid];
                });
            }
            entry.meta.lastModified = now;
            saveStaticDemoStore(store);
            return { ok: true, meta: clone(entry.meta), lastModified: now, _httpStatus: 200 };
        }

        if (action === 'save_page') {
            const entry = store.notebooks[body.notebookId];
            if (!entry || !body.pageId) return { ok: false, error: 'Heft oder Seite ungültig.', _httpStatus: 404 };
            const incoming = (body.pageData && typeof body.pageData === 'object') ? body.pageData : body;
            const prev = entry.pages[body.pageId] || {};
            entry.pages[body.pageId] = {
                pageId: body.pageId,
                lastModified: now,
                strokes: Array.isArray(incoming.strokes) ? clone(incoming.strokes) : [],
                shapes: Array.isArray(incoming.shapes) ? clone(incoming.shapes) : [],
                texts: Array.isArray(incoming.texts) ? clone(incoming.texts) : [],
                images: Array.isArray(incoming.images) ? clone(incoming.images) : [],
                stickers: Array.isArray(incoming.stickers) ? clone(incoming.stickers) : [],
                labItems: Array.isArray(incoming.labItems) ? clone(incoming.labItems) : [],
                backgroundAsset: incoming.backgroundAsset !== undefined ? incoming.backgroundAsset : (prev.backgroundAsset || null)
            };
            const pMeta = (entry.meta.pages || []).find(p => p.id === body.pageId);
            if (pMeta) {
                pMeta.lastModified = now;
                if (incoming.paperColor !== undefined) pMeta.paperColor = incoming.paperColor;
                if (incoming.paperTemplate !== undefined) pMeta.paperTemplate = incoming.paperTemplate;
                if (incoming.backgroundAsset !== undefined) pMeta.backgroundAsset = incoming.backgroundAsset;
            }
            entry.meta.lastModified = now;
            saveStaticDemoStore(store);
            return { ok: true, pageId: body.pageId, lastModified: now, notebookTs: now, _httpStatus: 200 };
        }

        if (action === 'upload_asset' && payload instanceof FormData) {
            const file = payload.get('file');
            if (!file) return { ok: false, error: 'Keine Datei übergeben.', _httpStatus: 400 };
            const dataUrl = await blobToDataUrl(file);
            return {
                ok: true,
                url: dataUrl,
                fileName: file.name || ('demo_' + now + '.png'),
                _httpStatus: 200
            };
        }

        return { ok: false, error: 'Unbekannte Demo-Aktion: ' + action, _httpStatus: 400 };
    }

    async function apiCall(action, payload = null, method = 'POST') {
        if (isStaticDemoMode) {
            return await handleStaticDemoApiCall(action, payload);
        }

        let url = 'api.php?action=' + encodeURIComponent(action);
        const options = {
            method,
            credentials: 'same-origin',
            headers: {}
        };
        if (method === 'GET' && payload && typeof payload === 'object') {
            for (const [k, v] of Object.entries(payload)) {
                if (v !== undefined && v !== null) {
                    url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(v));
                }
            }
        } else if (method === 'POST' && payload !== null && !(payload instanceof FormData)) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify({ action, ...payload });
        } else if (payload instanceof FormData) {
            options.body = payload;
        }
        const response = await fetch(url, options);
        const rawText = await response.text();
        let data = null;
        try {
            data = JSON.parse(rawText);
        } catch (_) {
            // Statischer Host ohne PHP (z. B. GitHub Pages / statischer Preview-Server):
            // api.php wird als Quelltext ausgeliefert oder mit 405 abgewiesen -> Demo-Modus aktivieren
            if (response.status === 405 || rawText.trim().startsWith('<?php')) {
                isStaticDemoMode = true;
                console.info('WebNotes: Kein PHP-Backend erkannt – wechsle in lokalen Demo-Modus (Browser-Speicher).');
                return await handleStaticDemoApiCall(action, payload);
            }
            data = { ok: false, error: 'Ungültige Server-Antwort' };
        }
        data._httpStatus = response.status;
        return data;
    }

    async function checkAuthAndBoot() {
        AppState.authenticated = true;
        await loadDashboard();
    }

    function loadCachedDashboardFallback() {
        const cached = localStorage.getItem('webnotes_dashboard_cache');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                AppState.folders = parsed.folders || [];
                AppState.notebooks = parsed.notebooks || [];
                renderDashboard();
                return;
            } catch (_) {}
        }
    }

    async function loadDashboard() {
        try {
            const res = await apiCall('dashboard', null, 'GET');
            if (res.ok) {
                AppState.folders = res.folders || [];
                AppState.notebooks = res.notebooks || [];
                localStorage.setItem('webnotes_dashboard_cache', JSON.stringify({
                    folders: AppState.folders,
                    notebooks: AppState.notebooks
                }));
                setSyncStatus('saved', 'Gespeichert ✓');
                renderDashboard();
            }
        } catch (e) {
            setSyncStatus('offline', 'Offline-Puffer!');
            loadCachedDashboardFallback();
        }
    }

    function setSyncStatus(state, text) {
        const badges = [
            document.getElementById('editor-sync-badge'),
            document.getElementById('dash-sync-badge')
        ];
        badges.forEach(badge => {
            if (!badge) return;
            badge.className = 'sync-badge status-' + state;
            const txt = badge.querySelector('.sync-text');
            if (txt) txt.textContent = (isStaticDemoMode && state === 'saved') ? 'Demo (Lokal) ✓' : text;
        });
    }

    // =========================================================================
    // 4. DASHBOARD: ORDNER & HEFTE ANLEGEN, SORTIEREN, ÖFFNEN
    // =========================================================================
    function renderDashboard() {
        renderFolderList();
        renderNotebooksGrid();
        populateFolderSelects();
    }

    function renderFolderList() {
        DOM.folderList.innerHTML = '';

        // "Alle Hefte" Eintrag
        const totalCount = AppState.notebooks.length;
        const allLi = document.createElement('li');
        allLi.className = 'folder-item' + (AppState.selectedFolderId === 'all' ? ' active' : '');
        allLi.innerHTML = `
            <div class="folder-item-left">
                <span class="folder-icon-dot" style="background: #2b579a;"></span>
                <span class="folder-name-text">Alle Hefte</span>
            </div>
            <div class="folder-item-actions">
                <span class="folder-count-pill">${totalCount}</span>
            </div>
        `;
        allLi.addEventListener('click', () => {
            AppState.selectedFolderId = 'all';
            renderDashboard();
        });
        DOM.folderList.appendChild(allLi);

        // Benutzerdefinierte Ordner
        AppState.folders.forEach(folder => {
            const count = AppState.notebooks.filter(n => n.folderId === folder.id).length;
            const li = document.createElement('li');
            li.className = 'folder-item' + (AppState.selectedFolderId === folder.id ? ' active' : '');
            li.innerHTML = `
                <div class="folder-item-left">
                    <span class="folder-icon-dot" style="background: ${escapeHtml(folder.color || '#6ea864')};"></span>
                    <span class="folder-name-text">${escapeHtml(folder.name)}</span>
                </div>
                <div class="folder-item-actions">
                    <button type="button" class="folder-edit-btn" title="Ordner umbenennen / Farbe ändern">✎</button>
                    <span class="folder-count-pill">${count}</span>
                </div>
            `;
            li.addEventListener('click', (e) => {
                if (e.target.closest('.folder-edit-btn')) {
                    e.stopPropagation();
                    openFolderModal(folder);
                    return;
                }
                AppState.selectedFolderId = folder.id;
                renderDashboard();
            });
            DOM.folderList.appendChild(li);
        });
    }

    function renderNotebooksGrid() {
        DOM.notebooksGrid.innerHTML = '';

        // Aktuellen Ordnertitel setzen
        if (AppState.selectedFolderId === 'all') {
            DOM.currentFolderTitle.textContent = 'Alle Hefte';
        } else {
            const fld = AppState.folders.find(f => f.id === AppState.selectedFolderId);
            DOM.currentFolderTitle.textContent = fld ? fld.name : 'Ordner';
        }

        // Filtern & Sortieren
        let list = AppState.notebooks.slice();
        if (AppState.selectedFolderId !== 'all') {
            list = list.filter(n => n.folderId === AppState.selectedFolderId);
        }
        if (AppState.searchQuery.trim() !== '') {
            const q = AppState.searchQuery.trim().toLowerCase();
            list = list.filter(n => (n.title || '').toLowerCase().includes(q));
        }

        if (AppState.sortOrder === 'title_asc') {
            list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
        } else if (AppState.sortOrder === 'created_desc') {
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
            list.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
        }

        DOM.currentFolderCount.textContent = `${list.length} ${list.length === 1 ? 'Heft' : 'Hefte'}`;

        // 1. "+ Neues Heft"-Starter-Karte
        const addCard = document.createElement('div');
        addCard.className = 'notebook-card new-notebook-card';
        addCard.innerHTML = `
            <div class="notebook-cover-box">
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span style="font-weight:700; font-size:0.92rem;">Neues Heft</span>
            </div>
            <div class="notebook-meta-below">
                <div class="notebook-meta-title">Heft erstellen...</div>
                <div class="notebook-meta-sub"><span>Vorlage &amp; Cover wählen</span></div>
            </div>
        `;
        addCard.addEventListener('click', () => openNewNotebookModal());
        DOM.notebooksGrid.appendChild(addCard);

        // 2. Vorhandene Hefte rendern
        list.forEach(nb => {
            const cov = nb.coverStyle || {};
            const bgColor = cov.bgColor || '#88b378';
            const spineColor = cov.spineColor || '#a3c995';
            const dateStr = nb.lastModified ? new Date(nb.lastModified).toLocaleDateString('de-DE') : '';

            const card = document.createElement('div');
            card.className = 'notebook-card';
            card.innerHTML = `
                <div class="notebook-cover-box" style="background: ${escapeHtml(bgColor)};">
                    <div class="notebook-cover-spine" style="background: ${escapeHtml(spineColor)};"></div>
                    <div class="notebook-cover-body">
                        <div class="notebook-cover-label">
                            <div class="notebook-cover-label-title">${escapeHtml(nb.title || 'Heft')}</div>
                            <div class="notebook-cover-label-sub">${nb.pageCount || 1} Seiten</div>
                        </div>
                    </div>
                    <button type="button" class="notebook-card-menu-btn" title="Heft-Aktionen (Duplizieren / Verschieben / Löschen)">⋯</button>
                </div>
                <div class="notebook-meta-below">
                    <div class="notebook-meta-title" title="${escapeHtml(nb.title)}">${escapeHtml(nb.title)}</div>
                    <div class="notebook-meta-sub">
                        <span>${nb.pageCount || 1} S.</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.notebook-card-menu-btn')) {
                    e.stopPropagation();
                    handleNotebookCardMenu(nb);
                    return;
                }
                openNotebook(nb.id);
            });

            DOM.notebooksGrid.appendChild(card);
        });
    }

    function populateFolderSelects() {
        const select = document.getElementById('nb-input-folder');
        if (!select) return;
        select.innerHTML = '';
        AppState.folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            if (AppState.selectedFolderId === f.id) opt.selected = true;
            select.appendChild(opt);
        });
    }

    function openFolderModal(folder = null) {
        const modal = document.getElementById('folder-modal');
        const titleEl = document.getElementById('folder-modal-title');
        const idInput = document.getElementById('folder-edit-id');
        const nameInput = document.getElementById('folder-input-name');
        const delBtn = document.getElementById('btn-delete-folder');
        const colorBtns = document.querySelectorAll('#folder-color-picker .color-swatch');

        if (folder) {
            titleEl.textContent = 'Ordner bearbeiten';
            idInput.value = folder.id;
            nameInput.value = folder.name;
            delBtn.classList.remove('hidden');
            colorBtns.forEach(b => b.classList.toggle('active', b.dataset.folderColor === folder.color));
        } else {
            titleEl.textContent = 'Neuen Ordner anlegen';
            idInput.value = '';
            nameInput.value = '';
            delBtn.classList.add('hidden');
            colorBtns.forEach((b, i) => b.classList.toggle('active', i === 0));
        }

        modal.classList.remove('hidden');
        nameInput.focus();
    }

    function openNewNotebookModal() {
        populateFolderSelects();
        const modal = document.getElementById('notebook-modal');
        const titleInput = document.getElementById('nb-input-title');
        titleInput.value = '';
        modal.classList.remove('hidden');
        titleInput.focus();
    }

    let activeMenuNotebook = null;

    function handleNotebookCardMenu(nb) {
        activeMenuNotebook = nb;
        const modal = document.getElementById('notebook-actions-modal');
        const titleEl = document.getElementById('nb-actions-title');
        const renameInput = document.getElementById('nb-actions-rename-input');
        const folderSelect = document.getElementById('nb-actions-folder-select');

        titleEl.textContent = `Heft „${nb.title}“`;
        renameInput.value = nb.title || '';

        folderSelect.innerHTML = '';
        AppState.folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            if (nb.folderId === f.id) opt.selected = true;
            folderSelect.appendChild(opt);
        });

        modal.classList.remove('hidden');
    }

    // =========================================================================
    // 5. HEFT ÖFFNEN, SEITEN-NAVIGATION & PAPIER-/COVER-GENERATOR
    // =========================================================================
    async function openNotebook(notebookId, pageIndex = 0) {
        setSyncStatus('saving', 'Lädt Heft...');
        try {
            const res = await apiCall('get_all_pages', { notebookId }, 'GET');
            if (res.ok && res.meta) {
                AppState.currentNotebook = res.meta;
                AppState.pagesCache = res.pages || {};
                localStorage.setItem('webnotes_nb_' + notebookId, JSON.stringify({
                    meta: AppState.currentNotebook,
                    pages: AppState.pagesCache
                }));
                setSyncStatus('saved', 'Gespeichert ✓');
            } else {
                throw new Error(res.error || 'Heft konnte nicht geladen werden');
            }
        } catch (err) {
            // Offline-Fallback aus localStorage
            const cached = localStorage.getItem('webnotes_nb_' + notebookId);
            if (cached) {
                const parsed = JSON.parse(cached);
                AppState.currentNotebook = parsed.meta;
                AppState.pagesCache = parsed.pages || {};
                setSyncStatus('offline', 'Offline-Puffer!');
            } else {
                alert('Heft konnte nicht geladen werden.');
                return;
            }
        }

        DOM.dashboardView.classList.add('hidden');
        DOM.editorView.classList.remove('hidden');
        DOM.notebookTitleInput.value = AppState.currentNotebook.title || 'Heft';

        AppState.currentPageIndex = Math.max(0, Math.min(pageIndex, AppState.currentNotebook.pages.length - 1));
        clearLassoSelection();
        commitInlineTextIfActive();

        fitPageToViewport();
        await selectPage(AppState.currentPageIndex);
        renderSidebarThumbnails();
    }

    function getCurrentPageMeta() {
        if (!AppState.currentNotebook || !AppState.currentNotebook.pages) return null;
        return AppState.currentNotebook.pages[AppState.currentPageIndex] || null;
    }

    function getCurrentPageData() {
        const meta = getCurrentPageMeta();
        if (!meta) return null;
        if (!AppState.pagesCache[meta.id]) {
            AppState.pagesCache[meta.id] = {
                pageId: meta.id,
                lastModified: Date.now(),
                strokes: [],
                shapes: [],
                texts: [],
                images: [],
                stickers: [],
                backgroundAsset: meta.backgroundAsset || null
            };
        }
        return AppState.pagesCache[meta.id];
    }

    async function selectPage(index) {
        if (!AppState.currentNotebook || index < 0 || index >= AppState.currentNotebook.pages.length) return;
        commitInlineTextIfActive();
        clearLassoSelection();

        // Falls aktuelle Seite ungespeicherte Änderungen hat, vor Seitenwechsel im Hintergrund sichern
        flushPendingPageSave();

        AppState.currentPageIndex = index;
        const pageMeta = getCurrentPageMeta();

        if (!AppState.pagesCache[pageMeta.id]) {
            try {
                const res = await apiCall('get_page', {
                    notebookId: AppState.currentNotebook.id,
                    pageId: pageMeta.id
                }, 'GET');
                if (res.ok && res.page) {
                    AppState.pagesCache[pageMeta.id] = res.page;
                }
            } catch (_) {}
        }

        updatePageIndicator();
        await renderCurrentPageFull();
        highlightActiveThumbnail();
        updateUndoRedoButtons();
    }

    function updatePageIndicator() {
        const total = AppState.currentNotebook ? AppState.currentNotebook.pages.length : 1;
        const curr = AppState.currentPageIndex + 1;
        DOM.pageIndicatorText.textContent = `Seite ${curr} von ${total}`;
    }

    // Prozeduraler Vektor-Generator für Papierfarbe, Lineaturen & Heft-Cover
    // (Wird sowohl auf #bg-canvas als auch im 300-DPI PDF-Export und in den Thumbnails genutzt!)
    async function renderPageBackgroundToContext(ctx, width, height, pageMeta, notebookMeta) {
        ctx.save();
        const scaleX = width / PAGE_WIDTH;
        const scaleY = height / PAGE_HEIGHT;
        ctx.scale(scaleX, scaleY);

        const tpl = pageMeta.paperTemplate || 'grid_5mm';
        const paperColor = pageMeta.paperColor || '#fbf8ee';

        // 1. Prüfe ob es ein Heft-Cover ist
        if (pageMeta.isCover || tpl.startsWith('cover_')) {
            const cov = (notebookMeta && notebookMeta.coverStyle) ? notebookMeta.coverStyle : {};
            let bg = cov.bgColor || '#88b378';
            let spine = cov.spineColor || '#a3c995';
            if (tpl === 'cover_ocean') { bg = '#2b579a'; spine = '#4a78c2'; }
            if (tpl === 'cover_terracotta') { bg = '#c25e42'; spine = '#db8269'; }
            if (tpl === 'cover_anthracite') { bg = '#334155'; spine = '#475569'; }
            if (tpl === 'cover_sage') { bg = '#88b378'; spine = '#a3c995'; }

            // Cover-Grundfläche
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

            // Heller Buchrücken-Streifen links (wie im Referenz-Screenshot "5 NTB")
            const spineWidth = 132;
            ctx.fillStyle = spine;
            ctx.fillRect(0, 0, spineWidth, PAGE_HEIGHT);

            // Dezente Falzlinie
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(spineWidth, 0);
            ctx.lineTo(spineWidth, PAGE_HEIGHT);
            ctx.stroke();

            // Optionales MINT-Grid oder Schulheft-Etikett
            const pattern = cov.pattern || 'school_label';
            if (pattern === 'mint_grid') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
                ctx.lineWidth = 1;
                const step = 40;
                ctx.beginPath();
                for (let x = spineWidth + step; x < PAGE_WIDTH; x += step) {
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, PAGE_HEIGHT);
                }
                for (let y = step; y < PAGE_HEIGHT; y += step) {
                    ctx.moveTo(spineWidth, y);
                    ctx.lineTo(PAGE_WIDTH, y);
                }
                ctx.stroke();
            } else if (pattern === 'school_label') {
                // Abgerundetes weißes Etikett-Schild oben mittig
                const lblW = 540;
                const lblH = 210;
                const lblX = spineWidth + (PAGE_WIDTH - spineWidth - lblW) / 2;
                const lblY = 230;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
                drawRoundedRectPath(ctx, lblX, lblY, lblW, lblH, 16);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Hilfslinien im Etikett
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(lblX + 36, lblY + 115);
                ctx.lineTo(lblX + lblW - 36, lblY + 115);
                ctx.moveTo(lblX + 36, lblY + 165);
                ctx.lineTo(lblX + lblW - 36, lblY + 165);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        // 2. Normale Papierseite (Warm-Beige #fbf8ee oder Reinweiß #ffffff)
        ctx.fillStyle = paperColor;
        ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

        // 3. Falls PDF-Hintergrund-Asset auf dieser Seite vorhanden ist, hochauflösend zeichnen
        const bgAssetUrl = pageMeta.backgroundAsset || (AppState.pagesCache[pageMeta.id] && AppState.pagesCache[pageMeta.id].backgroundAsset);
        if (bgAssetUrl) {
            const img = await loadImageAsset(bgAssetUrl);
            if (img) {
                ctx.drawImage(img, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            }
        } else {
            // 4. Prozedurale Vektor-Lineatur zeichnen
            const lineColor = paperColor === '#ffffff' ? '#d4dce6' : '#dcd5c4';
            const marginColor = '#e88b84';

            if (tpl === 'grid_5mm') {
                const gridStep = 26.6; // ~5mm auf A4 (210mm -> 42 Kästchen horizontal)
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let x = gridStep; x < PAGE_WIDTH; x += gridStep) {
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, PAGE_HEIGHT);
                }
                for (let y = gridStep; y < PAGE_HEIGHT; y += gridStep) {
                    ctx.moveTo(0, y);
                    ctx.lineTo(PAGE_WIDTH, y);
                }
                ctx.stroke();
            } else if (tpl === 'ruled_margin') {
                const rowStep = 42;
                const topMargin = 110;
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                for (let y = topMargin; y < PAGE_HEIGHT - 60; y += rowStep) {
                    ctx.moveTo(0, y);
                    ctx.lineTo(PAGE_WIDTH, y);
                }
                ctx.stroke();

                // Roter Korrekturrand links & rechts
                ctx.strokeStyle = marginColor;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(118, 0);
                ctx.lineTo(118, PAGE_HEIGHT);
                ctx.stroke();
            } else if (tpl === 'dotted') {
                const dotStep = 26.6;
                ctx.fillStyle = '#b6b0a0';
                for (let x = dotStep; x < PAGE_WIDTH; x += dotStep) {
                    for (let y = dotStep; y < PAGE_HEIGHT; y += dotStep) {
                        ctx.beginPath();
                        ctx.arc(x, y, 1.35, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        ctx.restore();
    }

    function loadImageAsset(url) {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            if (AppState.assetImageCache[url] && AppState.assetImageCache[url].complete) {
                return resolve(AppState.assetImageCache[url]);
            }
            const img = new Image();
            img.onload = () => {
                AppState.assetImageCache[url] = img;
                resolve(img);
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    // =========================================================================
    // 6. HAUPT-RENDERING DER VEKTOROBJEKTE (PFADE, MULTIPLY-MARKER, FORMEN, TEXTE)
    // =========================================================================
    async function renderPageObjectsToContext(ctx, width, height, pageData) {
        if (!pageData) return;
        ctx.save();
        const scaleX = width / PAGE_WIDTH;
        const scaleY = height / PAGE_HEIGHT;
        ctx.scale(scaleX, scaleY);

        // 1. Eingefügte Bilder (Server-Assets, inkl. Rotation um den Mittelpunkt)
        if (Array.isArray(pageData.images)) {
            for (const imgObj of pageData.images) {
                const cachedImg = imgObj.url ? AppState.assetImageCache[imgObj.url] : null;
                const im = (cachedImg && cachedImg.complete) ? cachedImg : await loadImageAsset(imgObj.url);
                if (im) {
                    if (imgObj.rotation) {
                        const cx = imgObj.x + imgObj.w * 0.5;
                        const cy = imgObj.y + imgObj.h * 0.5;
                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.rotate(imgObj.rotation);
                        ctx.drawImage(im, -imgObj.w * 0.5, -imgObj.h * 0.5, imgObj.w, imgObj.h);
                        ctx.restore();
                    } else {
                        ctx.drawImage(im, imgObj.x, imgObj.y, imgObj.w, imgObj.h);
                    }
                }
            }
        }

        // 1b. Chemie-Labor-Geräte (Chemix-Stil Vektorgrafiken, unterhalb von Handschrift/Notizen)
        if (Array.isArray(pageData.labItems) && window.WebNotesLab) {
            for (const labObj of pageData.labItems) {
                window.WebNotesLab.drawLabObject(ctx, labObj);
            }
        }

        // 2. Gespeicherte Vektor-Striche (Kugelschreiber & Multiply-Highlighter)
        if (Array.isArray(pageData.strokes)) {
            for (const stroke of pageData.strokes) {
                drawSmoothStrokeOnContext(ctx, stroke);
            }
        }

        // 3. Geometrische Formen
        if (Array.isArray(pageData.shapes)) {
            for (const shape of pageData.shapes) {
                drawShapeObject(ctx, shape);
            }
        }

        // 4. Textfelder & Sprechblasen
        if (Array.isArray(pageData.texts)) {
            for (const txt of pageData.texts) {
                drawTextObject(ctx, txt);
            }
        }

        // 5. Schul-Sticker / Stempel
        if (Array.isArray(pageData.stickers)) {
            for (const st of pageData.stickers) {
                drawStickerObject(ctx, st);
            }
        }

        ctx.restore();
    }

    /**
     * Zeichnet einen glatten Vektorpfad mittels quadratischer Bézierkurven über die Mittelpunkte
     * aufeinanderfolgender Sub-Pixel-Koordinaten.
     * Für den Textmarker (mode === 'highlighter') wird ein Offscreen-Zwischenpuffer verwendet,
     * damit sich ein einzelner Marker-Zug niemals selbst an Kreuzungspunkten abdunkelt,
     * aber mit globalCompositeOperation = 'multiply' und alpha = 0.35 über der Seite liegt!
     */
    let markerOffscreenCanvas = null;
    let markerOffscreenCtx = null;

    function traceSmoothBezierPath(ctx, points) {
        if (!points || points.length === 0) return;
        ctx.beginPath();
        if (points.length === 1) {
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
            return;
        }
        if (points.length === 2) {
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            return;
        }

        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) * 0.5;
            const midY = (points[i].y + points[i + 1].y) * 0.5;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        // Letztes Segment direkt bis zur aktuellen Stiftspitze (0% Nachzieh-Effekt!)
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
    }

    function drawSmoothStrokeOnContext(ctx, stroke) {
        if (!stroke || !stroke.points || stroke.points.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.width || 4.0;

        if (stroke.mode === 'highlighter') {
            // Um Selbst-Abdunkeln innerhalb eines einzelnen Marker-Zuges auch beim Neuzeichnen
            // zu verhindern, zeichnen wir den Pfad mit alpha 1.0 auf einen Offscreen-Puffer
            // und blenden ihn als Ganzes mit alpha 0.35 + multiply auf den Ziel-Context.
            if (!markerOffscreenCanvas) {
                markerOffscreenCanvas = document.createElement('canvas');
                markerOffscreenCanvas.width = PAGE_WIDTH;
                markerOffscreenCanvas.height = PAGE_HEIGHT;
                markerOffscreenCtx = markerOffscreenCanvas.getContext('2d');
            }
            markerOffscreenCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            markerOffscreenCtx.save();
            markerOffscreenCtx.lineCap = 'round';
            markerOffscreenCtx.lineJoin = 'round';
            markerOffscreenCtx.lineWidth = stroke.width || 24.0;
            markerOffscreenCtx.strokeStyle = stroke.color || '#facc15';
            traceSmoothBezierPath(markerOffscreenCtx, stroke.points);
            markerOffscreenCtx.stroke();
            markerOffscreenCtx.restore();

            ctx.globalAlpha = 0.35;
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(markerOffscreenCanvas, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        } else {
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = stroke.color || '#111827';
            traceSmoothBezierPath(ctx, stroke.points);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawShapeObject(ctx, s) {
        if (!s) return;
        ctx.save();
        ctx.strokeStyle = s.color || '#111827';
        ctx.lineWidth = s.width || 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);

        if (s.shapeType === 'line') {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (s.shapeType === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = Math.max(14, (s.width || 3.5) * 3.8);
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        } else if (s.shapeType === 'rect') {
            ctx.strokeRect(rx, ry, rw, rh);
        } else if (s.shapeType === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.max(1, rw / 2), Math.max(1, rh / 2), 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (s.shapeType === 'callout') {
            // Sprechblase mit Spitze unten links (wie im Referenz-Screenshot "5 NTB")
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            drawCalloutBubblePath(ctx, rx, ry, Math.max(60, rw), Math.max(40, rh));
            ctx.fill();
            ctx.stroke();
        } else if (s.shapeType === 'axes') {
            // Koordinatensystem mit Pfeilspitzen
            ctx.beginPath();
            ctx.moveTo(rx, y2);
            ctx.lineTo(x2, y2);
            ctx.moveTo(rx, y2);
            ctx.lineTo(rx, ry);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawCalloutBubblePath(ctx, x, y, w, h) {
        const r = Math.min(16, w / 4, h / 4);
        const tailW = Math.min(28, w * 0.25);
        const tailH = 22;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r + tailW + 18, y + h);
        ctx.lineTo(x + r + 4, y + h + tailH);
        ctx.lineTo(x + r + 10, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawTextObject(ctx, t) {
        if (!t || !t.text) return;
        ctx.save();
        const fontSize = t.fontSize || 24;
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const lines = String(t.text).split('\n');
        const lineHeight = fontSize * 1.32;
        let maxW = 80;
        lines.forEach(line => {
            const m = ctx.measureText(line).width;
            if (m > maxW) maxW = m;
        });
        const pad = 14;
        const boxW = Math.max(t.w || 0, maxW + pad * 2);
        const boxH = Math.max(t.h || 0, lines.length * lineHeight + pad * 2);
        t.w = boxW;
        t.h = boxH;

        if (t.hasBubble) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = t.color || '#111827';
            ctx.lineWidth = 2.5;
            drawCalloutBubblePath(ctx, t.x, t.y, boxW, boxH);
            ctx.fill();
            ctx.stroke();
        } else if (t.hasBox) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.strokeStyle = t.color || '#111827';
            ctx.lineWidth = 2;
            drawRoundedRectPath(ctx, t.x, t.y, boxW, boxH, 10);
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = t.color || '#111827';
        ctx.textBaseline = 'top';
        lines.forEach((line, idx) => {
            ctx.fillText(line, t.x + pad, t.y + pad + idx * lineHeight);
        });
        ctx.restore();
    }

    function drawStickerObject(ctx, st) {
        if (!st) return;
        ctx.save();
        const w = st.w || 180;
        const h = st.h || 50;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = st.color || '#2b579a';
        ctx.lineWidth = 3;
        drawRoundedRectPath(ctx, st.x, st.y, w, h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = st.color || '#2b579a';
        ctx.font = '800 21px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(st.label || 'MERKE', st.x + w / 2, st.y + h / 2 + 1);
        ctx.restore();
    }

    function drawRoundedRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    async function renderCurrentPageFull() {
        const pageMeta = getCurrentPageMeta();
        const pageData = getCurrentPageData();
        if (!pageMeta || !pageData) return;

        bgCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        await renderPageBackgroundToContext(bgCtx, PAGE_WIDTH, PAGE_HEIGHT, pageMeta, AppState.currentNotebook);

        redrawMainCanvas();
    }

    let eraserRedrawRafId = null;

    function renderPageObjectsSyncFast(ctx, pageData) {
        if (!pageData) return;
        ctx.save();
        if (Array.isArray(pageData.images)) {
            for (const imgObj of pageData.images) {
                const im = imgObj.url ? AppState.assetImageCache[imgObj.url] : null;
                if (im && im.complete) {
                    if (imgObj.rotation) {
                        const cx = imgObj.x + imgObj.w * 0.5;
                        const cy = imgObj.y + imgObj.h * 0.5;
                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.rotate(imgObj.rotation);
                        ctx.drawImage(im, -imgObj.w * 0.5, -imgObj.h * 0.5, imgObj.w, imgObj.h);
                        ctx.restore();
                    } else {
                        ctx.drawImage(im, imgObj.x, imgObj.y, imgObj.w, imgObj.h);
                    }
                }
            }
        }
        if (Array.isArray(pageData.labItems) && window.WebNotesLab) {
            for (const labObj of pageData.labItems) {
                window.WebNotesLab.drawLabObject(ctx, labObj);
            }
        }
        if (Array.isArray(pageData.strokes)) {
            for (const stroke of pageData.strokes) {
                drawSmoothStrokeOnContext(ctx, stroke);
            }
        }
        if (Array.isArray(pageData.shapes)) {
            for (const shape of pageData.shapes) {
                drawShapeObject(ctx, shape);
            }
        }
        if (Array.isArray(pageData.texts)) {
            for (const txt of pageData.texts) {
                drawTextObject(ctx, txt);
            }
        }
        if (Array.isArray(pageData.stickers)) {
            for (const st of pageData.stickers) {
                drawStickerObject(ctx, st);
            }
        }
        ctx.restore();
    }

    function redrawMainCanvasForEraser() {
        const pageData = getCurrentPageData();
        if (!pageData) return;
        mainCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        renderPageObjectsSyncFast(mainCtx, pageData);
    }

    function scheduleEraserRedraw() {
        if (eraserRedrawRafId !== null) return;
        eraserRedrawRafId = requestAnimationFrame(() => {
            eraserRedrawRafId = null;
            redrawMainCanvasForEraser();
        });
    }

    async function redrawMainCanvas() {
        const pageData = getCurrentPageData();
        if (!pageData) return;
        mainCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        hiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        await renderPageObjectsToContext(mainCtx, PAGE_WIDTH, PAGE_HEIGHT, pageData);
        drawUIOverlay();
        updateSingleThumbnail(AppState.currentPageIndex);
    }

    // =========================================================================
    // 7. WACOM CINTIQ 22 & IPAD ZEICHEN-ENGINE (HÖCHSTE PRIORITÄT!)
    //    - Strikter Pen/Mouse-Filter (Touch zeichnet NIEMALS)
    //    - Kein 1-Finger-Panning (Handballen-Schutz), erst ab exakt 2 Touch-Punkten
    //    - 500ms Toolbar-Palm-Shield
    //    - 240Hz Coalesced Sub-Pixel Events
    //    - Wacom Pro Pen 2 Hardware-Radierer (buttons === 32 / button === 5)
    //    - 450ms Hold-to-Snap für gerade Linien mit Gummiband & Winkel-Snapping
    // =========================================================================
    function activatePalmShield() {
        AppState.lastPenActivityTime = performance.now();
        document.body.classList.add('pen-palm-shield-active');
        if (AppState.palmShieldTimer) {
            clearTimeout(AppState.palmShieldTimer);
        }
        AppState.palmShieldTimer = setTimeout(() => {
            if (!AppState.isPenDrawing) {
                document.body.classList.remove('pen-palm-shield-active');
            }
        }, PALM_SHIELD_COOLDOWN_MS);
    }

    function isTouchBlockedByPalmShield(e) {
        if (e.pointerType !== 'touch') return false;
        const elapsed = performance.now() - AppState.lastPenActivityTime;
        return AppState.isPenDrawing || elapsed < PALM_SHIELD_COOLDOWN_MS;
    }

    let cachedCanvasRect = null;
    function refreshCanvasRectCache() {
        if (DOM.uiCanvas) {
            cachedCanvasRect = DOM.uiCanvas.getBoundingClientRect();
        }
    }

    /**
     * Sub-Pixel Koordinatenberechnung auf der A4-Seite (OHNE Math.round() und OHNE Layout-Thrashing!)
     */
    function clientToPageCoords(clientX, clientY) {
        const rect = cachedCanvasRect || DOM.uiCanvas.getBoundingClientRect();
        const scaleX = PAGE_WIDTH / rect.width;
        const scaleY = PAGE_HEIGHT / rect.height;
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;

        // Falls das interaktive Lineal eingeblendet ist und der Stift nahe an der Linealkante zeichnet:
        if (AppState.ruler.visible && AppState.activeTool === 'pen' && !AppState.tempHardwareEraser) {
            const snapped = snapPointToRulerIfClose(x, y);
            if (snapped) {
                x = snapped.x;
                y = snapped.y;
            }
        }
        return { x, y };
    }

    function snapPointToRulerIfClose(px, py) {
        const r = AppState.ruler;
        const cx = r.x + 340;
        const cy = r.y + 38;
        const rad = (r.angleDeg * Math.PI) / 180;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);

        // Punkt ins lokale Koordinatensystem des Lineals rotieren
        const dx = px - cx;
        const dy = py - cy;
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Obere Kante bei localY = -38, untere Kante bei localY = +38
        const snapThreshold = 26;
        if (Math.abs(localX) <= 350) {
            let targetLocalY = null;
            if (Math.abs(localY - (-38)) < snapThreshold) {
                targetLocalY = -39;
            } else if (Math.abs(localY - 38) < snapThreshold) {
                targetLocalY = 39;
            }
            if (targetLocalY !== null) {
                const cosBack = Math.cos(rad);
                const sinBack = Math.sin(rad);
                return {
                    x: cx + localX * cosBack - targetLocalY * sinBack,
                    y: cy + localX * sinBack + targetLocalY * cosBack
                };
            }
        }
        return null;
    }

    function initCanvasPointerEngine() {
        const viewport = DOM.canvasViewport;
        const canvas = DOM.uiCanvas;

        // 1. Windows Ink Rechtsklick-Ring, Textauswahl & Drag-Verhalten kompromisslos blockieren
        ['contextmenu', 'selectstart', 'dragstart'].forEach(evtName => {
            viewport.addEventListener(evtName, (e) => {
                e.preventDefault();
                return false;
            }, { passive: false });
        });

        // 2. UI-Toolbar & Sidebar Palm-Shield: Blockiere Touch-Events auf Header & Sidebar während Stifteingabe
        const shieldZones = document.querySelectorAll('.palm-shield-zone');
        shieldZones.forEach(zone => {
            ['pointerdown', 'pointermove', 'touchstart'].forEach(evtName => {
                zone.addEventListener(evtName, (e) => {
                    const isTouch = (e.pointerType === 'touch') || (e.type === 'touchstart');
                    if (isTouch && (AppState.isPenDrawing || (performance.now() - AppState.lastPenActivityTime < PALM_SHIELD_COOLDOWN_MS))) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                    }
                }, { capture: true, passive: false });
            });
        });

        // 3. Pointer-Events auf dem Viewport / Canvas (inkl. iPad Apple Pencil touchstart preventDefault!)
        // KRITISCH FÜR IPAD SAFARI (iOS 14-18):
        // Wenn bei kurzem Anheben des Apple Pencils (< 1cm) der nächste Strich beginnt,
        // schickt iOS Safari parallel ein touchstart/pointerdown. Ohne direktes touchstart->preventDefault()
        // auf dem Canvas-Element verschluckt iOS WebKit den Beginn des nächsten Pencil-Strichs!
        const blockPencilGestureDelay = (ev) => {
            if (ev.target === canvas || ev.target === viewport || viewport.contains(ev.target)) {
                if (!ev.target.closest('.inline-text-editor-wrap') &&
                    !ev.target.closest('.lasso-floating-bar') &&
                    !ev.target.closest('.floating-page-badge') &&
                    !ev.target.closest('.interactive-ruler')) {
                    ev.preventDefault();
                }
            }
        };
        canvas.addEventListener('touchstart', blockPencilGestureDelay, { passive: false });
        canvas.addEventListener('touchmove', blockPencilGestureDelay, { passive: false });

        viewport.addEventListener('pointerdown', onViewportPointerDown, { passive: false });
        viewport.addEventListener('pointermove', onViewportPointerMove, { passive: false });
        window.addEventListener('pointerup', onViewportPointerUp, { passive: false });
        window.addEventListener('pointercancel', onViewportPointerCancel, { passive: false });
        window.addEventListener('resize', () => { cachedCanvasRect = null; });

        // Mausrad-Zoom / Scrollen am PC
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                const factor = e.deltaY < 0 ? 1.08 : 0.92;
                setZoom(AppState.viewZoom * factor);
            } else {
                AppState.viewPanX -= e.deltaX;
                AppState.viewPanY -= e.deltaY;
                applyViewportTransform();
            }
        }, { passive: false });
    }

    function onViewportPointerDown(e) {
        // Ignoriere Klicks auf eingebettete HTML-Editoren (Inline-Text / Lineal / Lasso- & Bild-Menü / Labor-Panels / Widgets)
        if (e.target.closest('.inline-text-editor-wrap') ||
            e.target.closest('.lasso-floating-bar') ||
            e.target.closest('.floating-page-badge') ||
            e.target.closest('.zoom-controls') ||
            e.target.closest('.interactive-ruler') ||
            e.target.closest('.lab-floating-panel') ||
            e.target.closest('.classroom-widget') ||
            e.target.closest('.widget-menu-popover')) {
            return;
        }

        // FALL A: TOUCH-KONTAKT -> NIEMALS ZEICHNEN!
        // Ausnahme: Wenn das Bild- oder Labor-Werkzeug aktiv ist oder ein Bild/Laborgerät ausgewählt ist,
        // darf 1-Finger-Touch das Element antippen, verschieben, drehen oder skalieren!
        // Beim Schreiben (Stift-Modus) bleibt 1-Finger-Touch (Handballen) komplett ignoriert.
        if (e.pointerType === 'touch') {
            e.preventDefault();
            if (AppState.isPenDrawing) {
                return;
            }
            AppState.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (AppState.touchPointers.size === 1 && (AppState.activeTool === 'lab' || AppState.selectedLabId)) {
                refreshCanvasRectCache();
                const pt = clientToPageCoords(e.clientX, e.clientY);
                if (tryStartLabInteraction(e.pointerId, pt, AppState.activeTool === 'lab')) {
                    AppState.pinchState = null;
                    return;
                }
            }
            if (AppState.touchPointers.size === 1 && (AppState.activeTool === 'image' || AppState.selectedImageId)) {
                refreshCanvasRectCache();
                const pt = clientToPageCoords(e.clientX, e.clientY);
                if (tryStartImageInteraction(e.pointerId, pt, AppState.activeTool === 'image')) {
                    AppState.pinchState = null;
                    return;
                }
            }
            if (AppState.touchPointers.size === 2) {
                AppState.imageDragState = null;
                AppState.labDragState = null;
                startTwoFingerPinchPan();
            } else {
                AppState.pinchState = null;
            }
            return;
        }

        // FALL B: STIFT (e.pointerType === 'pen') ODER MAUS (e.pointerType === 'mouse')
        if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
            return;
        }

        // MAUS-PANNING: Rechte Maustaste (button 2), Mittlere Maustaste (button 1) oder Leertaste + Klick
        if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || AppState.isSpacePressed)) {
            e.preventDefault();
            AppState.mousePanState = {
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startPanX: AppState.viewPanX,
                startPanY: AppState.viewPanY
            };
            try { DOM.canvasViewport.setPointerCapture(e.pointerId); } catch (_) {}
            DOM.uiCanvas.style.cursor = 'grabbing';
            return;
        }

        // WICHTIG FÜR SCHNELLE HANDSCHRIFT AUF WACOM CINTIQ 22:
        // Falls vom vorherigen Buchstaben/Strich noch ein unvollendeter Strich offen war
        // (z. B. weil Absetzen + Wiederaufsetzen innerhalb von < 2ms passierte),
        // schließen wir den alten Strich sofort sauber ab und starten nahtlos den neuen Strich!
        if (AppState.isPenDrawing) {
            finalizeCurrentPenAction();
        }

        e.preventDefault();
        activatePalmShield();
        refreshCanvasRectCache();

        // Laufende Touch-Gesten sofort abbrechen, sobald der Stift aufsetzt
        AppState.touchPointers.clear();
        AppState.pinchState = null;

        AppState.activePenPointerId = e.pointerId;
        AppState.isPenDrawing = true;
        // WICHTIG FÜR IPAD SAFARI: KEIN setPointerCapture für 'pen' aufrufen!
        // In iOS Safari blockiert setPointerCapture nach einem schnellen Absetzen die Registrierung
        // des direkt nachfolgenden Apple-Pencil-Strichs!
        if (e.pointerType === 'mouse') {
            try {
                DOM.canvasViewport.setPointerCapture(e.pointerId);
            } catch (_) {}
        }

        // Wacom Pro Pen 2 Hardware-Radierer-Erkennung (Stift-Rückseite / Seitentaste: buttons === 32 oder button === 5)
        AppState.tempHardwareEraser = (e.buttons === 32 || e.button === 5 || (e.buttons & 32) === 32);

        const pt = clientToPageCoords(e.clientX, e.clientY);
        const effectiveTool = AppState.tempHardwareEraser ? 'eraser' : AppState.activeTool;

        if (effectiveTool === 'eraser') {
            saveHistorySnapshot();
            performEraseAtPoint(pt.x, pt.y);
            AppState.lastMovePoint = pt;
            return;
        }

        if (effectiveTool === 'laser') {
            addLaserPoint(pt.x, pt.y);
            return;
        }

        if (effectiveTool === 'text') {
            openInlineTextEditorAt(pt.x, pt.y);
            AppState.isPenDrawing = false;
            AppState.activePenPointerId = null;
            return;
        }

        if (effectiveTool === 'lab') {
            if (tryStartLabInteraction(e.pointerId, pt, true)) {
                return;
            }
            AppState.isPenDrawing = false;
            AppState.activePenPointerId = null;
            if (AppState.selectedLabId) {
                AppState.selectedLabId = null;
                if (window.WebNotesLab) window.WebNotesLab.syncLabInspectorUI();
                drawUIOverlay();
            }
            return;
        }

        if (AppState.selectedLabId && effectiveTool !== 'eraser' && effectiveTool !== 'laser') {
            if (tryStartLabInteraction(e.pointerId, pt, false)) {
                return;
            }
            AppState.selectedLabId = null;
            if (window.WebNotesLab) window.WebNotesLab.syncLabInspectorUI();
            drawUIOverlay();
        }

        if (effectiveTool === 'image') {
            if (tryStartImageInteraction(e.pointerId, pt, true)) {
                return;
            }
            AppState.isPenDrawing = false;
            AppState.activePenPointerId = null;
            // Falls kein Bild getroffen wurde und vorher keins aktiv war, Datei-Dialog öffnen
            if (!AppState.selectedImageId) {
                document.getElementById('hidden-image-input').click();
            } else {
                AppState.selectedImageId = null;
                drawUIOverlay();
            }
            return;
        }

        // Auch im Lasso-Modus oder bei aktiv ausgewähltem Bild direkt auf Griffe/Bild reagieren
        if (AppState.selectedImageId && effectiveTool !== 'eraser' && effectiveTool !== 'laser') {
            if (tryStartImageInteraction(e.pointerId, pt, false)) {
                return;
            }
            AppState.selectedImageId = null;
            drawUIOverlay();
        }

        if (effectiveTool === 'lasso') {
            handleLassoPointerDown(pt);
            return;
        }

        if (effectiveTool === 'shapes' || (effectiveTool === 'pen' && AppState.penSubMode === 'shape_draw')) {
            saveHistorySnapshot();
            AppState.activeShapeDraft = {
                id: 'shp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                shapeType: AppState.shapeType || 'line',
                color: AppState.activeColor,
                width: getCurrentStrokeWidth(),
                x1: pt.x,
                y1: pt.y,
                x2: pt.x,
                y2: pt.y
            };
            drawUIOverlay();
            return;
        }

        // Standard: Stift (Kugelschreiber oder Multiply-Textmarker)
        // Falls gerade ein Thumbnail-Timer lief, sofort abbrechen, damit 0% CPU-Last beim Schreiben entsteht
        if (thumbRefreshTimer) clearTimeout(thumbRefreshTimer);

        saveHistorySnapshot();
        const mode = AppState.penSubMode === 'highlighter' ? 'highlighter' : 'ballpoint';
        AppState.currentStroke = {
            id: 'str_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            mode,
            color: AppState.activeColor,
            width: getCurrentStrokeWidth(),
            points: [{ x: pt.x, y: pt.y, t: performance.now() }],
            isSnappedLine: false
        };
        AppState.lastMovePoint = { x: pt.x, y: pt.y };

        renderActiveStrokeLive();
        scheduleHoldToSnapTimer();
    }

    function onViewportPointerMove(e) {
        if (e.pointerType === 'pen') {
            // Auch im Hover-Zustand über dem Wacom Cintiq 22 den Palm-Shield aktiv halten!
            activatePalmShield();
        }

        // FALL A: 1-FINGER BILD-/LABOR-TRANSFORMATION ODER 2-FINGER-TOUCH PAN & PINCH-TO-ZOOM
        if (e.pointerType === 'touch') {
            if (AppState.labDragState && e.pointerId === AppState.labDragState.pointerId) {
                e.preventDefault();
                updateLabInteraction(clientToPageCoords(e.clientX, e.clientY));
                return;
            }
            if (AppState.imageDragState && e.pointerId === AppState.imageDragState.pointerId) {
                e.preventDefault();
                updateImageInteraction(clientToPageCoords(e.clientX, e.clientY));
                return;
            }
            if (AppState.isPenDrawing) return;
            if (!AppState.touchPointers.has(e.pointerId)) return;
            e.preventDefault();
            AppState.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (AppState.touchPointers.size === 2 && AppState.pinchState) {
                updateTwoFingerPinchPan();
            }
            return;
        }

        if (AppState.labDragState && e.pointerId === AppState.labDragState.pointerId) {
            e.preventDefault();
            updateLabInteraction(clientToPageCoords(e.clientX, e.clientY));
            return;
        }

        if (AppState.imageDragState && e.pointerId === AppState.imageDragState.pointerId) {
            e.preventDefault();
            updateImageInteraction(clientToPageCoords(e.clientX, e.clientY));
            return;
        }

        // FALL B: AKTIVER STIFT / MAUS
        if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
            return;
        }

        // Aktives Maus-Panning (Rechte/Mittlere Maustaste oder Leertaste+Ziehen)
        if (AppState.mousePanState && e.pointerId === AppState.mousePanState.pointerId) {
            e.preventDefault();
            AppState.viewPanX = AppState.mousePanState.startPanX + (e.clientX - AppState.mousePanState.startClientX);
            AppState.viewPanY = AppState.mousePanState.startPanY + (e.clientY - AppState.mousePanState.startClientY);
            applyViewportTransform();
            return;
        }

        // WACOM SCHNELLSCHREIB-FALLBACK:
        // Falls der Stift ganz kurz (< 2mm) angehoben und wieder aufgesetzt wurde und Windows Ink
        // statt pointerdown direkt pointermove mit e.buttons > 0 oder e.pressure > 0 feuert,
        // starten wir sofort nahtlos den neuen Strich, damit kein einziger Buchstabe verschluckt wird!
        const isPenPressed = (e.buttons > 0) || (e.pointerType === 'pen' && e.pressure > 0.005);
        if (!AppState.isPenDrawing && isPenPressed) {
            onViewportPointerDown(e);
            return;
        }

        if (!AppState.isPenDrawing) {
            return;
        }
        // Falls sich die pointerId des Stifts beim schnellen Absetzen geändert hat, nahtlos übernehmen
        if (e.pointerId !== AppState.activePenPointerId && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
            AppState.activePenPointerId = e.pointerId;
        }
        e.preventDefault();

        const effectiveTool = AppState.tempHardwareEraser ? 'eraser' : AppState.activeTool;

        // 240Hz Coalesced Sub-Pixel Events auslesen
        const coalesced = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
        const eventsToProcess = (coalesced && coalesced.length > 0) ? coalesced : [e];

        if (effectiveTool === 'eraser') {
            let anyChanged = false;
            for (const ev of eventsToProcess) {
                const p = clientToPageCoords(ev.clientX, ev.clientY);
                if (performEraseSegment(AppState.lastMovePoint || p, p, true)) {
                    anyChanged = true;
                }
                AppState.lastMovePoint = p;
            }
            if (anyChanged) {
                scheduleEraserRedraw();
            }
            return;
        }

        if (effectiveTool === 'laser') {
            for (const ev of eventsToProcess) {
                const p = clientToPageCoords(ev.clientX, ev.clientY);
                addLaserPoint(p.x, p.y);
            }
            return;
        }

        if (effectiveTool === 'lasso') {
            const p = clientToPageCoords(e.clientX, e.clientY);
            handleLassoPointerMove(p);
            return;
        }

        if (AppState.activeShapeDraft) {
            const p = clientToPageCoords(e.clientX, e.clientY);
            const snapped = applyAngleSnapIfNear(AppState.activeShapeDraft.x1, AppState.activeShapeDraft.y1, p.x, p.y);
            AppState.activeShapeDraft.x2 = snapped.x;
            AppState.activeShapeDraft.y2 = snapped.y;
            drawUIOverlay();
            return;
        }

        if (!AppState.currentStroke) return;

        // Falls der Strich bereits durch 450ms Hold-to-Snap in eine perfekte gerade Linie eingerastet ist:
        // "Gummiband"-Modus mit sanftem Winkel-Snapping bei 0°, 45°, 90° (±3° Toleranz)
        if (AppState.currentStroke.isSnappedLine) {
            const latestEv = eventsToProcess[eventsToProcess.length - 1];
            const rawEnd = clientToPageCoords(latestEv.clientX, latestEv.clientY);
            const startPt = AppState.currentStroke.points[0];
            const snappedEnd = applyAngleSnapIfNear(startPt.x, startPt.y, rawEnd.x, rawEnd.y);
            AppState.currentStroke.points = [
                startPt,
                { x: snappedEnd.x, y: snappedEnd.y, t: performance.now() }
            ];
            renderActiveStrokeLive();
            return;
        }

        // Reguläres Freihand-Zeichnen mit Sub-Pixel-Präzision (OHNE Math.round()!)
        let movedSignificantly = false;
        const pts = AppState.currentStroke.points;
        const prevStartIdx = pts.length;

        for (const ev of eventsToProcess) {
            const pt = clientToPageCoords(ev.clientX, ev.clientY);
            const prev = pts[pts.length - 1];
            const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);

            if (dist >= 1.5) {
                pts.push({ x: pt.x, y: pt.y, t: performance.now() });
            }
            if (AppState.lastMovePoint && Math.hypot(pt.x - AppState.lastMovePoint.x, pt.y - AppState.lastMovePoint.y) >= HOLD_RADIUS_PX) {
                movedSignificantly = true;
                AppState.lastMovePoint = { x: pt.x, y: pt.y };
            }
        }

        if (movedSignificantly) {
            scheduleHoldToSnapTimer();
        }

        // ULTRA-SCHNELLES INKREMENTELLES SEGMENT-RENDERING FÜR PC & IPAD (0ms LAG!):
        // Beim Kugelschreiber löschen wir NICHT bei jedem Move das 3,5-MP-Canvas (clearRect),
        // sondern zeichnen nur das neu hinzugekommene Bézier-Teilstück!
        if (AppState.currentStroke.mode !== 'highlighter' && pts.length > prevStartIdx) {
            renderIncrementalPenSegments(prevStartIdx);
        } else {
            renderActiveStrokeLive();
        }
    }

    function finalizeCurrentPenAction() {
        clearHoldToSnapTimer();
        const effectiveTool = AppState.tempHardwareEraser ? 'eraser' : AppState.activeTool;

        if (effectiveTool === 'lasso') {
            handleLassoPointerUp();
        } else if (AppState.activeShapeDraft) {
            const pageData = getCurrentPageData();
            if (pageData) {
                pageData.shapes.push(AppState.activeShapeDraft);
                drawShapeObject(mainCtx, AppState.activeShapeDraft);
                triggerPageAutoSave();
            }
            AppState.activeShapeDraft = null;
            uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            scheduleThumbnailRefresh(AppState.currentPageIndex);
        } else if (AppState.currentStroke) {
            const pageData = getCurrentPageData();
            const finishedStroke = AppState.currentStroke;
            AppState.currentStroke = null;

            if (pageData && finishedStroke.points.length > 0) {
                // GoodNotes-artige, eckenerhaltende Kurvenglättung für sauberes Schriftbild
                if (!finishedStroke.isSnappedLine && finishedStroke.points.length >= 4) {
                    finishedStroke.points = smoothStrokePointsKeepCorners(finishedStroke.points);
                }
                pageData.strokes.push(finishedStroke);
                // ZUERST den fertigen Strich auf mainCtx zeichnen, DANN erst uiCtx/hiCtx leeren!
                // Dadurch verschwindet der Strich beim Absetzen nicht für einen Frame.
                drawSmoothStrokeOnContext(mainCtx, finishedStroke);
                triggerPageAutoSave();
            }
            hiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            scheduleThumbnailRefresh(AppState.currentPageIndex);
        } else if (effectiveTool === 'eraser') {
            if (eraserRedrawRafId !== null) {
                cancelAnimationFrame(eraserRedrawRafId);
                eraserRedrawRafId = null;
                redrawMainCanvasForEraser();
            }
            triggerPageAutoSave();
            scheduleThumbnailRefresh(AppState.currentPageIndex);
        }

        AppState.isPenDrawing = false;
        AppState.activePenPointerId = null;
        AppState.tempHardwareEraser = false;
        activatePalmShield();
    }

    /**
     * GoodNotes-artige, eckenerhaltende 3-Punkt-Glättung:
     * Entfernt Sensor-Mikrozittern an Bögen, behält aber scharfe Buchstabenecken (z. B. t, M, 1)
     * sowie exakten Start- und Endpunkt bei.
     */
    function smoothStrokePointsKeepCorners(points) {
        if (!points || points.length < 4) return points;
        let current = points.map(p => ({ x: p.x, y: p.y, t: p.t }));

        for (let pass = 0; pass < 2; pass++) {
            const next = [current[0]];
            for (let i = 1; i < current.length - 1; i++) {
                const prev = current[i - 1];
                const curr = current[i];
                const nxt = current[i + 1];

                const v1x = curr.x - prev.x;
                const v1y = curr.y - prev.y;
                const v2x = nxt.x - curr.x;
                const v2y = nxt.y - curr.y;
                const len1 = Math.hypot(v1x, v1y);
                const len2 = Math.hypot(v2x, v2y);

                let isSharpCorner = false;
                if (len1 > 0.5 && len2 > 0.5) {
                    const cosAngle = (v1x * v2x + v1y * v2y) / (len1 * len2);
                    // Winkeländerung > ~50° -> scharfe Ecke erhalten!
                    if (cosAngle < 0.64) {
                        isSharpCorner = true;
                    }
                }

                if (isSharpCorner) {
                    next.push(curr);
                } else {
                    next.push({
                        x: prev.x * 0.22 + curr.x * 0.56 + nxt.x * 0.22,
                        y: prev.y * 0.22 + curr.y * 0.56 + nxt.y * 0.22,
                        t: curr.t
                    });
                }
            }
            next.push(current[current.length - 1]);
            current = next;
        }
        return current;
    }

    function onViewportPointerUp(e) {
        if (AppState.labDragState && e.pointerId === AppState.labDragState.pointerId) {
            finishLabInteraction();
            AppState.isPenDrawing = false;
            AppState.activePenPointerId = null;
            if (e.pointerType === 'touch') {
                AppState.touchPointers.delete(e.pointerId);
            }
            return;
        }

        if (AppState.imageDragState && e.pointerId === AppState.imageDragState.pointerId) {
            finishImageInteraction();
            AppState.isPenDrawing = false;
            AppState.activePenPointerId = null;
            if (e.pointerType === 'touch') {
                AppState.touchPointers.delete(e.pointerId);
            }
            return;
        }

        if (e.pointerType === 'touch') {
            AppState.touchPointers.delete(e.pointerId);
            if (AppState.touchPointers.size < 2) {
                AppState.pinchState = null;
            }
            return;
        }

        if (AppState.mousePanState && e.pointerId === AppState.mousePanState.pointerId) {
            AppState.mousePanState = null;
            DOM.uiCanvas.style.cursor = AppState.isSpacePressed ? 'grab' : 'crosshair';
            try {
                if (DOM.canvasViewport.hasPointerCapture(e.pointerId)) {
                    DOM.canvasViewport.releasePointerCapture(e.pointerId);
                }
            } catch (_) {}
            return;
        }

        if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
            return;
        }

        if (!AppState.isPenDrawing) {
            return;
        }

        // Letzten Endpunkt beim Absetzen noch mitnehmen (wichtig für i-Punkte und kurze Striche!)
        if (AppState.currentStroke && !AppState.currentStroke.isSnappedLine && typeof e.clientX === 'number') {
            const pt = clientToPageCoords(e.clientX, e.clientY);
            const pts = AppState.currentStroke.points;
            if (pts.length === 1 || Math.hypot(pt.x - pts[pts.length - 1].x, pt.y - pts[pts.length - 1].y) >= 0.1) {
                pts.push({ x: pt.x, y: pt.y, t: performance.now() });
            }
        }

        try {
            if (DOM.canvasViewport.hasPointerCapture(e.pointerId)) {
                DOM.canvasViewport.releasePointerCapture(e.pointerId);
            }
        } catch (_) {}

        finalizeCurrentPenAction();
    }

    function onViewportPointerCancel(e) {
        if (e.pointerType === 'touch') {
            AppState.touchPointers.delete(e.pointerId);
            if (AppState.touchPointers.size < 2) {
                AppState.pinchState = null;
            }
            return;
        }
        // WICHTIG: Wenn Windows Ink durch einen gleichzeitigen Handballen-Kontakt ein pointercancel
        // feuert, obwohl der Stift noch drückt, verwerfen wir den laufenden Strich NICHT, sondern
        // sichern die bis dahin geschriebenen Punkte sofort auf der Seite!
        if (AppState.isPenDrawing) {
            finalizeCurrentPenAction();
        }
    }

    // =========================================================================
    // 8. HOLD-TO-SNAP (450 MS) & LIVE-MARKER OHNE SELBST-ABDUNKELN
    // =========================================================================
    function scheduleHoldToSnapTimer() {
        clearHoldToSnapTimer();
        if (!AppState.currentStroke || AppState.currentStroke.isSnappedLine) return;

        AppState.holdSnapTimer = setTimeout(() => {
            if (!AppState.currentStroke || !AppState.isPenDrawing) return;
            const pts = AppState.currentStroke.points;
            if (pts.length < 3) return;

            const startPt = pts[0];
            const endPt = pts[pts.length - 1];
            const totalLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);

            // Nur einrasten, wenn der Strich eine Mindestlänge hat
            if (totalLen > 18) {
                const snappedEnd = applyAngleSnapIfNear(startPt.x, startPt.y, endPt.x, endPt.y);
                AppState.currentStroke.isSnappedLine = true;
                AppState.currentStroke.points = [
                    { x: startPt.x, y: startPt.y, t: startPt.t },
                    { x: snappedEnd.x, y: snappedEnd.y, t: performance.now() }
                ];
                renderActiveStrokeLive();
                showCanvasToast('Gerade Linie eingerastet – Stift bewegen zum Ausrichten');
            }
        }, HOLD_TO_SNAP_MS);
    }

    function clearHoldToSnapTimer() {
        if (AppState.holdSnapTimer) {
            clearTimeout(AppState.holdSnapTimer);
            AppState.holdSnapTimer = null;
        }
    }

    /**
     * Sanftes Winkel-Snapping bei 0°, 45°, 90°, 135°, 180° innerhalb von ±3° Toleranz
     */
    function applyAngleSnapIfNear(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) return { x: x2, y: y2, snappedAngle: null };

        const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const snapTargets = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
        const toleranceDeg = 3.0;

        for (const target of snapTargets) {
            if (Math.abs(rawDeg - target) <= toleranceDeg) {
                const rad = (target * Math.PI) / 180;
                return {
                    x: x1 + Math.cos(rad) * dist,
                    y: y1 + Math.sin(rad) * dist,
                    snappedAngle: target
                };
            }
        }
        return { x: x2, y: y2, snappedAngle: null };
    }

    /**
     * Inkrementelles O(1) Segment-Rendering während des Schreibens:
     * Zeichnet nur die neuen Punkte seit dem letzten Event ohne clearRect(1120, 1584)!
     */
    function renderIncrementalPenSegments(prevLen) {
        const stroke = AppState.currentStroke;
        if (!stroke || stroke.points.length < 2) return;
        const pts = stroke.points;

        uiCtx.save();
        uiCtx.lineCap = 'round';
        uiCtx.lineJoin = 'round';
        uiCtx.lineWidth = stroke.width;
        uiCtx.strokeStyle = stroke.color;
        uiCtx.beginPath();

        const startIdx = Math.max(1, prevLen - 1);
        for (let i = startIdx; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            if (i >= 2) {
                const pPrev = pts[i - 2];
                const midPrevX = (pPrev.x + p0.x) * 0.5;
                const midPrevY = (pPrev.y + p0.y) * 0.5;
                const midCurrX = (p0.x + p1.x) * 0.5;
                const midCurrY = (p0.y + p1.y) * 0.5;
                uiCtx.moveTo(midPrevX, midPrevY);
                uiCtx.quadraticCurveTo(p0.x, p0.y, midCurrX, midCurrY);
            } else {
                const midX = (p0.x + p1.x) * 0.5;
                const midY = (p0.y + p1.y) * 0.5;
                uiCtx.moveTo(p0.x, p0.y);
                uiCtx.lineTo(midX, midY);
            }
        }
        uiCtx.stroke();
        uiCtx.restore();
    }

    /**
     * Live-Rendering des laufenden Striches (für Marker, ersten Punkt oder nach Hold-to-Snap):
     */
    function renderActiveStrokeLive() {
        const stroke = AppState.currentStroke;
        if (!stroke) return;

        if (stroke.mode === 'highlighter') {
            hiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            hiCtx.save();
            hiCtx.lineCap = 'round';
            hiCtx.lineJoin = 'round';
            hiCtx.lineWidth = stroke.width;
            hiCtx.strokeStyle = stroke.color;
            hiCtx.globalAlpha = 1.0; // Die 35% Deckkraft + multiply übernimmt der CSS-Layer #highlighter-stroke-canvas!
            traceSmoothBezierPath(hiCtx, stroke.points);
            hiCtx.stroke();
            hiCtx.restore();
        } else {
            uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
            uiCtx.save();
            uiCtx.lineCap = 'round';
            uiCtx.lineJoin = 'round';
            uiCtx.lineWidth = stroke.width;
            uiCtx.strokeStyle = stroke.color;
            traceSmoothBezierPath(uiCtx, stroke.points);
            uiCtx.stroke();
            uiCtx.restore();
        }
    }

    // =========================================================================
    // 9. ZWEI-FINGER-TOUCH PAN & PINCH-TO-ZOOM (1-FINGER IGNORIERT!)
    // =========================================================================
    function startTwoFingerPinchPan() {
        const pts = Array.from(AppState.touchPointers.values());
        if (pts.length !== 2) return;
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;
        AppState.pinchState = {
            startDist: Math.max(20, dist),
            startMidX: midX,
            startMidY: midY,
            startZoom: AppState.viewZoom,
            startPanX: AppState.viewPanX,
            startPanY: AppState.viewPanY
        };
    }

    function updateTwoFingerPinchPan() {
        const pts = Array.from(AppState.touchPointers.values());
        if (pts.length !== 2 || !AppState.pinchState) return;

        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;

        const scaleRatio = dist / AppState.pinchState.startDist;
        const newZoom = Math.max(0.35, Math.min(3.0, AppState.pinchState.startZoom * scaleRatio));

        AppState.viewZoom = newZoom;
        AppState.viewPanX = AppState.pinchState.startPanX + (midX - AppState.pinchState.startMidX);
        AppState.viewPanY = AppState.pinchState.startPanY + (midY - AppState.pinchState.startMidY);
        applyViewportTransform();
    }

    function fitPageToViewport() {
        const vw = DOM.canvasViewport.clientWidth || window.innerWidth - 260;
        const vh = DOM.canvasViewport.clientHeight || window.innerHeight - 110;
        const scaleW = (vw - 48) / PAGE_WIDTH;
        const scaleH = (vh - 48) / PAGE_HEIGHT;
        AppState.viewZoom = Math.max(0.4, Math.min(1.35, Math.min(scaleW, scaleH)));
        AppState.viewPanX = (PAGE_WIDTH * (1 - AppState.viewZoom)) / 2;
        AppState.viewPanY = 0;
        applyViewportTransform();
    }

    function fitPageToWidth() {
        const vw = DOM.canvasViewport.clientWidth || window.innerWidth - 260;
        const scaleW = (vw - 32) / PAGE_WIDTH;
        AppState.viewZoom = Math.max(0.35, Math.min(3.0, scaleW));
        AppState.viewPanX = (PAGE_WIDTH * (1 - AppState.viewZoom)) / 2;
        AppState.viewPanY = 0;
        applyViewportTransform();
    }

    function setZoom(newZoom) {
        AppState.viewZoom = Math.max(0.35, Math.min(3.0, newZoom));
        applyViewportTransform();
    }

    function applyViewportTransform() {
        DOM.transformStage.style.transform = `translate(${AppState.viewPanX}px, ${AppState.viewPanY}px) scale(${AppState.viewZoom})`;
        cachedCanvasRect = null;
        const readout = document.getElementById('btn-zoom-reset');
        if (readout) {
            readout.textContent = Math.round(AppState.viewZoom * 100) + '%';
        }
    }

    // =========================================================================
    // 10. RADIERER (STRICH-RADIERER & TEIL-RADIERER – AABB & rAF OPTIMIERT)
    // =========================================================================
    const strokeBBoxCache = new WeakMap();

    function getStrokeBBox(stroke) {
        let bb = strokeBBoxCache.get(stroke);
        if (bb) return bb;
        const pts = stroke.points;
        if (!pts || pts.length === 0) {
            bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
            strokeBBoxCache.set(stroke, bb);
            return bb;
        }
        let minX = pts[0].x, maxX = pts[0].x;
        let minY = pts[0].y, maxY = pts[0].y;
        for (let i = 1; i < pts.length; i++) {
            const px = pts[i].x;
            const py = pts[i].y;
            if (px < minX) minX = px;
            else if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            else if (py > maxY) maxY = py;
        }
        bb = { minX, minY, maxX, maxY };
        strokeBBoxCache.set(stroke, bb);
        return bb;
    }

    function performEraseAtPoint(x, y) {
        performEraseSegment({ x, y }, { x, y }, false);
    }

    function performEraseSegment(p1, p2, deferRedraw = false) {
        const pageData = getCurrentPageData();
        if (!pageData) return false;
        const eraseRadius = 16;
        let changed = false;

        const segMinX = p1.x < p2.x ? p1.x : p2.x;
        const segMaxX = p1.x > p2.x ? p1.x : p2.x;
        const segMinY = p1.y < p2.y ? p1.y : p2.y;
        const segMaxY = p1.y > p2.y ? p1.y : p2.y;

        if (AppState.eraserMode === 'stroke') {
            // Strich-Radierer: Löscht den gesamten Vektorpfad, sobald er berührt wird
            const beforeCount = pageData.strokes.length;
            pageData.strokes = pageData.strokes.filter(stroke => {
                const pad = eraseRadius + (stroke.width || 4) * 0.5;
                const bb = getStrokeBBox(stroke);
                if (bb.maxX < segMinX - pad || bb.minX > segMaxX + pad ||
                    bb.maxY < segMinY - pad || bb.minY > segMaxY + pad) {
                    return true;
                }
                return !doesStrokeIntersectSegment(stroke, p1, p2, eraseRadius);
            });
            if (pageData.strokes.length !== beforeCount) changed = true;

            // Auch berührte Formen prüfen
            const beforeShapes = pageData.shapes.length;
            const eraseRadiusSq = eraseRadius * eraseRadius;
            pageData.shapes = pageData.shapes.filter(sh => {
                const dSq = distToSegmentSq(p2, { x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 });
                return dSq > eraseRadiusSq;
            });
            if (pageData.shapes.length !== beforeShapes) changed = true;
        } else {
            // Teil-Radierer: Schneidet berührte Punkte aus den Vektorpfaden heraus und teilt sie ggf. in Teilpfade
            const nextStrokes = [];
            const strokes = pageData.strokes;
            const nowTs = Date.now();
            for (let s = 0; s < strokes.length; s++) {
                const stroke = strokes[s];
                const threshold = eraseRadius + (stroke.width || 4) * 0.5;
                const bb = getStrokeBBox(stroke);
                // Schneller AABB-Filter in O(1): unberührte Striche sofort übernehmen
                if (bb.maxX < segMinX - threshold || bb.minX > segMaxX + threshold ||
                    bb.maxY < segMinY - threshold || bb.minY > segMaxY + threshold) {
                    nextStrokes.push(stroke);
                    continue;
                }

                const thresholdSq = threshold * threshold;
                const pts = stroke.points;
                let currentSub = null;
                let strokeSplit = false;
                for (let i = 0; i < pts.length; i++) {
                    const pt = pts[i];
                    if (distToSegmentSq(pt, p1, p2) <= thresholdSq) {
                        if (!strokeSplit) {
                            strokeSplit = true;
                            changed = true;
                            if (i >= 2) {
                                nextStrokes.push({
                                    ...stroke,
                                    id: 'str_' + nowTs + '_' + Math.random().toString(36).slice(2, 6),
                                    points: pts.slice(0, i)
                                });
                            }
                            currentSub = [];
                        } else if (currentSub.length >= 2) {
                            nextStrokes.push({
                                ...stroke,
                                id: 'str_' + nowTs + '_' + Math.random().toString(36).slice(2, 6),
                                points: currentSub
                            });
                            currentSub = [];
                        } else {
                            currentSub.length = 0;
                        }
                    } else if (strokeSplit) {
                        currentSub.push(pt);
                    }
                }
                if (!strokeSplit) {
                    nextStrokes.push(stroke);
                } else if (currentSub && currentSub.length >= 2) {
                    nextStrokes.push({
                        ...stroke,
                        id: 'str_' + nowTs + '_' + Math.random().toString(36).slice(2, 6),
                        points: currentSub
                    });
                }
            }
            if (changed) {
                pageData.strokes = nextStrokes;
            }
        }

        if (changed && !deferRedraw) {
            scheduleEraserRedraw();
        }
        return changed;
    }

    function doesStrokeIntersectSegment(stroke, p1, p2, radius) {
        const threshold = radius + (stroke.width || 4) * 0.5;
        const thresholdSq = threshold * threshold;
        const pts = stroke.points || [];
        for (let i = 0; i < pts.length; i++) {
            if (distToSegmentSq(pts[i], p1, p2) <= thresholdSq) return true;
            if (i > 0 && distToSegmentSq(p2, pts[i - 1], pts[i]) <= thresholdSq) return true;
        }
        return false;
    }

    function distToSegmentSq(p, v, w) {
        const dx = w.x - v.x;
        const dy = w.y - v.y;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) {
            const ex = p.x - v.x;
            const ey = p.y - v.y;
            return ex * ex + ey * ey;
        }
        let t = ((p.x - v.x) * dx + (p.y - v.y) * dy) / l2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const projX = v.x + t * dx;
        const projY = v.y + t * dy;
        const ex = p.x - projX;
        const ey = p.y - projY;
        return ex * ex + ey * ey;
    }

    function distToSegment(p, v, w) {
        return Math.sqrt(distToSegmentSq(p, v, w));
    }

    // =========================================================================
    // 11. LASSO-AUSWAHL (VERSCHIEBEN, SKALIEREN, DUPLIZIEREN, UMFÄRBEN, LÖSCHEN)
    // =========================================================================
    function handleLassoPointerDown(pt) {
        if (AppState.lassoSelection && AppState.lassoSelection.bounds) {
            const b = AppState.lassoSelection.bounds;
            const handleRadius = 18;
            // Prüfe Skalierungs-Handle unten rechts
            if (Math.hypot(pt.x - (b.x + b.w), pt.y - (b.y + b.h)) <= handleRadius) {
                saveHistorySnapshot();
                AppState.lassoSelection.dragMode = 'scale';
                AppState.lassoSelection.startPt = pt;
                AppState.lassoSelection.origBounds = { ...b };
                return;
            }
            // Prüfe Klick innerhalb der Bounding-Box zum Verschieben
            if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
                saveHistorySnapshot();
                AppState.lassoSelection.dragMode = 'move';
                AppState.lassoSelection.startPt = pt;
                return;
            }
        }

        // Neue Freihand-Lasso-Schleife starten
        clearLassoSelection();
        AppState.lassoPolygon = [pt];
        drawUIOverlay();
    }

    function handleLassoPointerMove(pt) {
        if (AppState.lassoSelection && AppState.lassoSelection.dragMode) {
            const sel = AppState.lassoSelection;
            const dx = pt.x - sel.startPt.x;
            const dy = pt.y - sel.startPt.y;

            if (sel.dragMode === 'move') {
                translateLassoSelection(dx, dy);
                sel.startPt = pt;
                redrawMainCanvas();
                updateLassoFloatingBarPosition();
            } else if (sel.dragMode === 'scale') {
                const b = sel.bounds;
                const scaleX = Math.max(0.25, (pt.x - b.x) / Math.max(20, b.w));
                const scaleY = Math.max(0.25, (pt.y - b.y) / Math.max(20, b.h));
                scaleLassoSelection(b.x, b.y, scaleX, scaleY);
                sel.startPt = pt;
                redrawMainCanvas();
                updateLassoFloatingBarPosition();
            }
            return;
        }

        if (AppState.lassoPolygon.length > 0) {
            AppState.lassoPolygon.push(pt);
            drawUIOverlay();
        }
    }

    function handleLassoPointerUp() {
        if (AppState.lassoSelection && AppState.lassoSelection.dragMode) {
            AppState.lassoSelection.dragMode = null;
            triggerPageAutoSave();
            drawUIOverlay();
            return;
        }

        if (AppState.lassoPolygon.length >= 3) {
            computeLassoSelectionFromPolygon(AppState.lassoPolygon);
        }
        AppState.lassoPolygon = [];
        drawUIOverlay();
    }

    function computeLassoSelectionFromPolygon(poly) {
        const pageData = getCurrentPageData();
        if (!pageData) return;

        const sel = {
            strokeIds: [],
            shapeIds: [],
            textIds: [],
            imageIds: [],
            stickerIds: [],
            bounds: null,
            dragMode: null
        };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const expandBounds = (x, y) => {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };

        // Striche prüfen
        (pageData.strokes || []).forEach(st => {
            const inside = st.points.some(p => isPointInPolygon(p, poly));
            if (inside) {
                sel.strokeIds.push(st.id);
                st.points.forEach(p => expandBounds(p.x, p.y));
            }
        });

        // Formen prüfen
        (pageData.shapes || []).forEach(sh => {
            const mid = { x: (sh.x1 + sh.x2) * 0.5, y: (sh.y1 + sh.y2) * 0.5 };
            if (isPointInPolygon(mid, poly)) {
                sel.shapeIds.push(sh.id);
                expandBounds(sh.x1, sh.y1);
                expandBounds(sh.x2, sh.y2);
            }
        });

        // Texte prüfen
        (pageData.texts || []).forEach(t => {
            const mid = { x: t.x + (t.w || 100) * 0.5, y: t.y + (t.h || 40) * 0.5 };
            if (isPointInPolygon(mid, poly)) {
                sel.textIds.push(t.id);
                expandBounds(t.x, t.y);
                expandBounds(t.x + (t.w || 120), t.y + (t.h || 50));
            }
        });

        // Bilder prüfen
        (pageData.images || []).forEach(im => {
            const mid = { x: im.x + im.w * 0.5, y: im.y + im.h * 0.5 };
            if (isPointInPolygon(mid, poly)) {
                sel.imageIds.push(im.id);
                expandBounds(im.x, im.y);
                expandBounds(im.x + im.w, im.y + im.h);
            }
        });

        // Sticker prüfen
        (pageData.stickers || []).forEach(st => {
            const mid = { x: st.x + (st.w || 180) * 0.5, y: st.y + (st.h || 50) * 0.5 };
            if (isPointInPolygon(mid, poly)) {
                sel.stickerIds.push(st.id);
                expandBounds(st.x, st.y);
                expandBounds(st.x + (st.w || 180), st.y + (st.h || 50));
            }
        });

        const totalSelected = sel.strokeIds.length + sel.shapeIds.length + sel.textIds.length + sel.imageIds.length + sel.stickerIds.length;
        if (totalSelected > 0 && isFinite(minX)) {
            const pad = 12;
            sel.bounds = {
                x: minX - pad,
                y: minY - pad,
                w: Math.max(30, (maxX - minX) + pad * 2),
                h: Math.max(30, (maxY - minY) + pad * 2)
            };
            AppState.lassoSelection = sel;
            updateLassoFloatingBarPosition();
        } else {
            clearLassoSelection();
        }
    }

    function translateLassoSelection(dx, dy) {
        const pageData = getCurrentPageData();
        const sel = AppState.lassoSelection;
        if (!pageData || !sel) return;

        (pageData.strokes || []).forEach(st => {
            if (sel.strokeIds.includes(st.id)) {
                st.points.forEach(p => { p.x += dx; p.y += dy; });
                strokeBBoxCache.delete(st);
            }
        });
        (pageData.shapes || []).forEach(sh => {
            if (sel.shapeIds.includes(sh.id)) {
                sh.x1 += dx; sh.y1 += dy; sh.x2 += dx; sh.y2 += dy;
            }
        });
        (pageData.texts || []).forEach(t => {
            if (sel.textIds.includes(t.id)) {
                t.x += dx; t.y += dy;
            }
        });
        (pageData.images || []).forEach(im => {
            if (sel.imageIds.includes(im.id)) {
                im.x += dx; im.y += dy;
            }
        });
        (pageData.stickers || []).forEach(st => {
            if (sel.stickerIds.includes(st.id)) {
                st.x += dx; st.y += dy;
            }
        });
        sel.bounds.x += dx;
        sel.bounds.y += dy;
    }

    function scaleLassoSelection(originX, originY, sx, sy) {
        const pageData = getCurrentPageData();
        const sel = AppState.lassoSelection;
        if (!pageData || !sel) return;

        (pageData.strokes || []).forEach(st => {
            if (sel.strokeIds.includes(st.id)) {
                st.points.forEach(p => {
                    p.x = originX + (p.x - originX) * sx;
                    p.y = originY + (p.y - originY) * sy;
                });
                strokeBBoxCache.delete(st);
            }
        });
        (pageData.shapes || []).forEach(sh => {
            if (sel.shapeIds.includes(sh.id)) {
                sh.x1 = originX + (sh.x1 - originX) * sx;
                sh.y1 = originY + (sh.y1 - originY) * sy;
                sh.x2 = originX + (sh.x2 - originX) * sx;
                sh.y2 = originY + (sh.y2 - originY) * sy;
            }
        });
        (pageData.images || []).forEach(im => {
            if (sel.imageIds.includes(im.id)) {
                im.x = originX + (im.x - originX) * sx;
                im.y = originY + (im.y - originY) * sy;
                im.w *= sx;
                im.h *= sy;
            }
        });
        sel.bounds.w *= sx;
        sel.bounds.h *= sy;
    }

    function clearLassoSelection() {
        AppState.lassoSelection = null;
        AppState.lassoPolygon = [];
        if (DOM.lassoBar) DOM.lassoBar.classList.add('hidden');
        if (uiCtx) uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    }

    function updateLassoFloatingBarPosition() {
        if (!AppState.lassoSelection || !AppState.lassoSelection.bounds) {
            DOM.lassoBar.classList.add('hidden');
            return;
        }
        const b = AppState.lassoSelection.bounds;
        DOM.lassoBar.style.left = Math.max(10, Math.min(PAGE_WIDTH - 280, b.x)) + 'px';
        DOM.lassoBar.style.top = Math.max(10, b.y - 46) + 'px';
        DOM.lassoBar.classList.remove('hidden');
    }

    function isPointInPolygon(pt, vs) {
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-7) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // =========================================================================
    // 11b. INTERAKTIVE BILD-BEARBEITUNG (ANTIPPEN, VERSCHIEBEN, SKALIEREN, DREHEN)
    // =========================================================================
    function toLocalImageCoords(imgObj, px, py) {
        const cx = imgObj.x + imgObj.w * 0.5;
        const cy = imgObj.y + imgObj.h * 0.5;
        const rot = imgObj.rotation || 0;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const dx = px - cx;
        const dy = py - cy;
        return {
            lx: dx * cos - dy * sin,
            ly: dx * sin + dy * cos,
            cx,
            cy
        };
    }

    function tryStartImageInteraction(pointerId, pt, allowSelectNew) {
        const pageData = getCurrentPageData();
        if (!pageData || !Array.isArray(pageData.images)) return false;

        // 1. Prüfe zuerst, ob Griffe des bereits ausgewählten Bildes getroffen wurden
        if (AppState.selectedImageId) {
            const selImg = pageData.images.find(im => im.id === AppState.selectedImageId);
            if (selImg) {
                const { lx, ly } = toLocalImageCoords(selImg, pt.x, pt.y);
                const hw = selImg.w * 0.5;
                const hh = selImg.h * 0.5;
                const hitR = 28; // Großer Touch- & Stift-freundlicher Treffer-Radius

                // Dreh-Griff (oben mittig bei lx=0, ly=-hh-38)
                if (Math.hypot(lx - 0, ly - (-hh - 38)) <= hitR) {
                    saveHistorySnapshot();
                    AppState.imageDragState = {
                        pointerId,
                        mode: 'rotate',
                        imgId: selImg.id,
                        startPt: pt,
                        origImg: { ...selImg }
                    };
                    return true;
                }

                // 4 Eck-Griffe zum proportionalen Skalieren
                const corners = [
                    { name: 'tl', x: -hw, y: -hh },
                    { name: 'tr', x: hw, y: -hh },
                    { name: 'bl', x: -hw, y: hh },
                    { name: 'br', x: hw, y: hh }
                ];
                for (const c of corners) {
                    if (Math.hypot(lx - c.x, ly - c.y) <= hitR) {
                        saveHistorySnapshot();
                        AppState.imageDragState = {
                            pointerId,
                            mode: 'scale',
                            corner: c.name,
                            imgId: selImg.id,
                            startPt: pt,
                            origImg: { ...selImg }
                        };
                        return true;
                    }
                }

                // Innerhalb des ausgewählten Bildes -> Verschieben
                if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
                    saveHistorySnapshot();
                    AppState.imageDragState = {
                        pointerId,
                        mode: 'move',
                        imgId: selImg.id,
                        startPt: pt,
                        origImg: { ...selImg }
                    };
                    return true;
                }
            }
        }

        // 2. Falls kein Griff getroffen: Prüfe, ob ein anderes Bild angetippt wurde (von oben nach unten)
        if (allowSelectNew) {
            for (let i = pageData.images.length - 1; i >= 0; i--) {
                const im = pageData.images[i];
                const { lx, ly } = toLocalImageCoords(im, pt.x, pt.y);
                if (Math.abs(lx) <= im.w * 0.5 && Math.abs(ly) <= im.h * 0.5) {
                    AppState.selectedImageId = im.id;
                    saveHistorySnapshot();
                    AppState.imageDragState = {
                        pointerId,
                        mode: 'move',
                        imgId: im.id,
                        startPt: pt,
                        origImg: { ...im }
                    };
                    drawUIOverlay();
                    return true;
                }
            }
        }

        return false;
    }

    function updateImageInteraction(pt) {
        const drag = AppState.imageDragState;
        const pageData = getCurrentPageData();
        if (!drag || !pageData) return;
        const imgObj = (pageData.images || []).find(im => im.id === drag.imgId);
        if (!imgObj) return;

        const orig = drag.origImg;
        if (drag.mode === 'move') {
            imgObj.x = orig.x + (pt.x - drag.startPt.x);
            imgObj.y = orig.y + (pt.y - drag.startPt.y);
        } else if (drag.mode === 'rotate') {
            const cx = orig.x + orig.w * 0.5;
            const cy = orig.y + orig.h * 0.5;
            let angle = Math.atan2(pt.y - cy, pt.x - cx) + Math.PI * 0.5;
            // Sanftes Einrasten bei 0°, 90°, 180°, -90° (±3° Toleranz)
            const deg = (angle * 180) / Math.PI;
            const snapTargets = [-180, -90, 0, 90, 180, 270];
            for (const t of snapTargets) {
                if (Math.abs(deg - t) <= 3.0) {
                    angle = (t * Math.PI) / 180;
                    break;
                }
            }
            imgObj.rotation = angle;
        } else if (drag.mode === 'scale') {
            const cx = orig.x + orig.w * 0.5;
            const cy = orig.y + orig.h * 0.5;
            const rot = orig.rotation || 0;
            const cos = Math.cos(-rot);
            const sin = Math.sin(-rot);
            const dx = pt.x - cx;
            const dy = pt.y - cy;
            const lx = Math.abs(dx * cos - dy * sin);
            const ly = Math.abs(dx * sin + dy * cos);

            const origHalfDiag = Math.hypot(orig.w * 0.5, orig.h * 0.5);
            const currHalfDiag = Math.hypot(lx, ly);
            const scale = Math.max(0.15, Math.min(5.0, currHalfDiag / Math.max(20, origHalfDiag)));

            const newW = orig.w * scale;
            const newH = orig.h * scale;
            imgObj.w = newW;
            imgObj.h = newH;
            imgObj.x = cx - newW * 0.5;
            imgObj.y = cy - newH * 0.5;
        }

        redrawMainCanvas();
    }

    function updateImageFloatingBarPosition(imgObj) {
        if (!DOM.imageBar || !imgObj) return;
        const left = Math.max(10, Math.min(PAGE_WIDTH - 110, imgObj.x + imgObj.w - 86));
        const top = Math.min(PAGE_HEIGHT - 50, imgObj.y + imgObj.h + 16);
        DOM.imageBar.style.left = left + 'px';
        DOM.imageBar.style.top = top + 'px';
        DOM.imageBar.classList.remove('hidden');
    }

    // -------------------------------------------------------------------------
    // INTERAKTIVE LABOR-GERÄTE (VERSCHIEBEN, SKALIEREN, KIPPEN/DREHEN)
    // -------------------------------------------------------------------------
    function tryStartLabInteraction(pointerId, pt, allowSelectNew) {
        const pageData = getCurrentPageData();
        if (!pageData || !Array.isArray(pageData.labItems) || pageData.labItems.length === 0) return false;

        if (AppState.selectedLabId) {
            const selLab = pageData.labItems.find(it => it.id === AppState.selectedLabId);
            if (selLab) {
                const { lx, ly } = toLocalImageCoords(selLab, pt.x, pt.y);
                const hw = selLab.w * 0.5;
                const hh = selLab.h * 0.5;
                const hitR = 30;

                // Dreh-/Kipp-Griff oben mittig
                if (Math.hypot(lx - 0, ly - (-hh - 38)) <= hitR) {
                    saveHistorySnapshot();
                    AppState.labDragState = {
                        pointerId,
                        mode: 'rotate',
                        labId: selLab.id,
                        startPt: pt,
                        origLab: { ...selLab }
                    };
                    return true;
                }

                // 4 Eck-Griffe zum Skalieren
                const corners = [
                    { name: 'tl', x: -hw, y: -hh },
                    { name: 'tr', x: hw, y: -hh },
                    { name: 'bl', x: -hw, y: hh },
                    { name: 'br', x: hw, y: hh }
                ];
                for (const c of corners) {
                    if (Math.hypot(lx - c.x, ly - c.y) <= hitR) {
                        saveHistorySnapshot();
                        AppState.labDragState = {
                            pointerId,
                            mode: 'scale',
                            corner: c.name,
                            labId: selLab.id,
                            startPt: pt,
                            origLab: { ...selLab }
                        };
                        return true;
                    }
                }

                // Innerhalb des Geräts -> Verschieben
                if (Math.abs(lx) <= hw + 10 && Math.abs(ly) <= hh + 10) {
                    saveHistorySnapshot();
                    AppState.labDragState = {
                        pointerId,
                        mode: 'move',
                        labId: selLab.id,
                        startPt: pt,
                        origLab: { ...selLab }
                    };
                    return true;
                }
            }
        }

        if (allowSelectNew) {
            for (let i = pageData.labItems.length - 1; i >= 0; i--) {
                const it = pageData.labItems[i];
                const { lx, ly } = toLocalImageCoords(it, pt.x, pt.y);
                if (Math.abs(lx) <= it.w * 0.5 + 10 && Math.abs(ly) <= it.h * 0.5 + 10) {
                    AppState.selectedLabId = it.id;
                    saveHistorySnapshot();
                    AppState.labDragState = {
                        pointerId,
                        mode: 'move',
                        labId: it.id,
                        startPt: pt,
                        origLab: { ...it }
                    };
                    if (window.WebNotesLab) window.WebNotesLab.syncLabInspectorUI();
                    drawUIOverlay();
                    return true;
                }
            }
        }
        return false;
    }

    function updateLabInteraction(pt) {
        const drag = AppState.labDragState;
        const pageData = getCurrentPageData();
        if (!drag || !pageData) return;
        const labObj = (pageData.labItems || []).find(it => it.id === drag.labId);
        if (!labObj) return;

        const orig = drag.origLab;
        if (drag.mode === 'move') {
            labObj.x = orig.x + (pt.x - drag.startPt.x);
            labObj.y = orig.y + (pt.y - drag.startPt.y);
        } else if (drag.mode === 'rotate') {
            const cx = orig.x + orig.w * 0.5;
            const cy = orig.y + orig.h * 0.5;
            let angle = Math.atan2(pt.y - cy, pt.x - cx) + Math.PI * 0.5;
            // Sanftes Einrasten bei 0°, ±45°, ±90°, 180° (±2.5° Toleranz)
            const deg = (angle * 180) / Math.PI;
            const snapTargets = [-180, -90, -45, 0, 45, 90, 180, 270];
            for (const t of snapTargets) {
                if (Math.abs(deg - t) <= 2.5) {
                    angle = (t * Math.PI) / 180;
                    break;
                }
            }
            labObj.rotation = angle;
        } else if (drag.mode === 'scale') {
            const cx = orig.x + orig.w * 0.5;
            const cy = orig.y + orig.h * 0.5;
            const rot = orig.rotation || 0;
            const cos = Math.cos(-rot);
            const sin = Math.sin(-rot);
            const dx = pt.x - cx;
            const dy = pt.y - cy;
            const lx = Math.abs(dx * cos - dy * sin);
            const ly = Math.abs(dx * sin + dy * cos);

            const origHalfDiag = Math.hypot(orig.w * 0.5, orig.h * 0.5);
            const currHalfDiag = Math.hypot(lx, ly);
            const scale = Math.max(0.3, Math.min(3.5, currHalfDiag / Math.max(16, origHalfDiag)));

            const newW = orig.w * scale;
            const newH = orig.h * scale;
            labObj.w = newW;
            labObj.h = newH;
            labObj.x = cx - newW * 0.5;
            labObj.y = cy - newH * 0.5;
        }

        redrawMainCanvasForEraser();
        drawUIOverlay();
    }

    function finishLabInteraction() {
        AppState.labDragState = null;
        redrawMainCanvas();
        triggerPageAutoSave();
        scheduleThumbnailRefresh(AppState.currentPageIndex);
    }

    function finishImageInteraction() {
        AppState.imageDragState = null;
        triggerPageAutoSave();
        scheduleThumbnailRefresh(AppState.currentPageIndex);
        drawUIOverlay();
    }

    function drawImageTransformHandles(ctx, imgObj) {
        const cx = imgObj.x + imgObj.w * 0.5;
        const cy = imgObj.y + imgObj.h * 0.5;
        const hw = imgObj.w * 0.5;
        const hh = imgObj.h * 0.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(imgObj.rotation || 0);

        // Blauer Auswahlrahmen
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-hw, -hh, imgObj.w, imgObj.h);

        // Verbindungslinie zum Dreh-Griff oben
        ctx.beginPath();
        ctx.moveTo(0, -hh);
        ctx.lineTo(0, -hh - 38);
        ctx.stroke();

        // Dreh-Griff (oben mittig, grüner/blauer Kreis mit Icon)
        ctx.fillStyle = '#0066ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, -hh - 38, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Winkelanzeige beim Drehen
        const deg = Math.round(((imgObj.rotation || 0) * 180) / Math.PI);
        if (deg !== 0) {
            ctx.fillStyle = '#1e293b';
            ctx.font = '700 14px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${deg}°`, 0, -hh - 58);
        }

        // 4 Eck-Skalierungsgriffe
        const corners = [
            [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]
        ];
        for (const [x, y] of corners) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0066ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    // =========================================================================
    // 12. UI-OVERLAY (LASSO-BOX, FORMEN-VORSCHAU, LASERPOINTER)
    // =========================================================================
    function drawUIOverlay() {
        if (!uiCtx) return;
        uiCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

        // 1. Aktives Formen-Gummiband
        if (AppState.activeShapeDraft) {
            drawShapeObject(uiCtx, AppState.activeShapeDraft);
        }

        // 2. Freihand-Lasso-Schleife während des Ziehens
        if (AppState.lassoPolygon.length > 1) {
            uiCtx.save();
            uiCtx.strokeStyle = '#0066ff';
            uiCtx.lineWidth = 2;
            uiCtx.setLineDash([6, 5]);
            traceSmoothBezierPath(uiCtx, AppState.lassoPolygon);
            uiCtx.stroke();
            uiCtx.restore();
        }

        // 3. Lasso-Bounding-Box + Skalierungs-Handle
        if (AppState.lassoSelection && AppState.lassoSelection.bounds) {
            const b = AppState.lassoSelection.bounds;
            uiCtx.save();
            uiCtx.strokeStyle = '#0066ff';
            uiCtx.lineWidth = 2;
            uiCtx.setLineDash([7, 5]);
            uiCtx.strokeRect(b.x, b.y, b.w, b.h);
            uiCtx.setLineDash([]);
            uiCtx.fillStyle = '#0066ff';
            uiCtx.beginPath();
            uiCtx.arc(b.x + b.w, b.y + b.h, 8, 0, Math.PI * 2);
            uiCtx.fill();
            uiCtx.restore();
        }

        // 3b. Interaktive Transformations-Box für ausgewähltes Bild (4 Eck-Griffe + Dreh-Griff)
        if (AppState.selectedImageId) {
            const pageData = getCurrentPageData();
            const imgObj = pageData && (pageData.images || []).find(im => im.id === AppState.selectedImageId);
            if (imgObj) {
                drawImageTransformHandles(uiCtx, imgObj);
                updateImageFloatingBarPosition(imgObj);
            } else if (DOM.imageBar) {
                DOM.imageBar.classList.add('hidden');
            }
        } else if (DOM.imageBar) {
            DOM.imageBar.classList.add('hidden');
        }

        // 3c. Interaktive Transformations-Box für ausgewähltes Laborgerät
        if (AppState.selectedLabId) {
            const pageData = getCurrentPageData();
            const labObj = pageData && (pageData.labItems || []).find(it => it.id === AppState.selectedLabId);
            if (labObj) {
                drawImageTransformHandles(uiCtx, labObj);
            }
        }

        // 4. Laserpointer-Nachleuchtspur
        if (AppState.laserTrails.length > 0) {
            const now = performance.now();
            uiCtx.save();
            for (let i = 1; i < AppState.laserTrails.length; i++) {
                const p0 = AppState.laserTrails[i - 1];
                const p1 = AppState.laserTrails[i];
                const age = now - p1.t;
                if (age < 900) {
                    const alpha = Math.max(0, 1 - age / 900);
                    uiCtx.strokeStyle = `rgba(255, 20, 20, ${alpha})`;
                    uiCtx.shadowColor = '#ff0000';
                    uiCtx.shadowBlur = 12;
                    uiCtx.lineWidth = 5 * alpha + 2;
                    uiCtx.beginPath();
                    uiCtx.moveTo(p0.x, p0.y);
                    uiCtx.lineTo(p1.x, p1.y);
                    uiCtx.stroke();
                }
            }
            uiCtx.restore();
        }
    }

    function addLaserPoint(x, y) {
        AppState.laserTrails.push({ x, y, t: performance.now() });
        if (!AppState.laserAnimFrame) {
            const tick = () => {
                const now = performance.now();
                AppState.laserTrails = AppState.laserTrails.filter(p => now - p.t < 900);
                drawUIOverlay();
                if (AppState.laserTrails.length > 0) {
                    AppState.laserAnimFrame = requestAnimationFrame(tick);
                } else {
                    AppState.laserAnimFrame = null;
                }
            };
            AppState.laserAnimFrame = requestAnimationFrame(tick);
        }
    }

    // =========================================================================
    // 13. UNDO / REDO, THUMBNAILS & INTERAKTIVE ELEMENTE
    // =========================================================================
    function clonePageObjectsShallow(pageData) {
        return {
            strokes: (pageData.strokes || []).slice(),
            shapes: (pageData.shapes || []).slice(),
            texts: (pageData.texts || []).slice(),
            images: (pageData.images || []).slice(),
            stickers: (pageData.stickers || []).slice(),
            labItems: (pageData.labItems || []).map(it => ({ ...it }))
        };
    }

    function saveHistorySnapshot() {
        const meta = getCurrentPageMeta();
        const pageData = getCurrentPageData();
        if (!meta || !pageData) return;

        if (!AppState.historyByPage[meta.id]) {
            AppState.historyByPage[meta.id] = { undo: [], redo: [] };
        }
        const h = AppState.historyByPage[meta.id];
        // Leichtgewichtige Struktur-Kopie ohne blockierendes JSON.stringify bei jedem Stiftansatz!
        h.undo.push(clonePageObjectsShallow(pageData));
        if (h.undo.length > 35) h.undo.shift();
        h.redo = [];
        updateUndoRedoButtons();
    }

    function performUndo() {
        const meta = getCurrentPageMeta();
        const pageData = getCurrentPageData();
        if (!meta || !pageData) return;
        const h = AppState.historyByPage[meta.id];
        if (!h || h.undo.length === 0) return;

        h.redo.push(clonePageObjectsShallow(pageData));
        const prev = h.undo.pop();
        Object.assign(pageData, prev);
        clearLassoSelection();
        redrawMainCanvas();
        updateUndoRedoButtons();
        triggerPageAutoSave();
    }

    function performRedo() {
        const meta = getCurrentPageMeta();
        const pageData = getCurrentPageData();
        if (!meta || !pageData) return;
        const h = AppState.historyByPage[meta.id];
        if (!h || h.redo.length === 0) return;

        h.undo.push(clonePageObjectsShallow(pageData));
        const next = h.redo.pop();
        Object.assign(pageData, next);
        clearLassoSelection();
        redrawMainCanvas();
        updateUndoRedoButtons();
        triggerPageAutoSave();
    }

    let thumbRefreshTimer = null;
    function scheduleThumbnailRefresh(pageIndex) {
        if (thumbRefreshTimer) clearTimeout(thumbRefreshTimer);
        thumbRefreshTimer = setTimeout(() => {
            if (!AppState.isPenDrawing) {
                updateSingleThumbnail(pageIndex);
            }
        }, 2500);
    }

    function updateUndoRedoButtons() {
        const meta = getCurrentPageMeta();
        const h = meta ? AppState.historyByPage[meta.id] : null;
        document.getElementById('btn-undo').disabled = !(h && h.undo.length > 0);
        document.getElementById('btn-redo').disabled = !(h && h.redo.length > 0);
    }

    // Linke Thumbnail-Seitenleiste (2-spaltiges Grid mit Live-Miniaturansichten)
    async function renderSidebarThumbnails() {
        if (!AppState.currentNotebook) return;
        DOM.thumbnailsGrid.innerHTML = '';

        for (let idx = 0; idx < AppState.currentNotebook.pages.length; idx++) {
            const pMeta = AppState.currentNotebook.pages[idx];
            const item = document.createElement('div');
            item.className = 'thumb-item' + (idx === AppState.currentPageIndex ? ' active' : '');
            item.dataset.pageIndex = String(idx);

            item.innerHTML = `
                <div class="thumb-frame">
                    <canvas class="thumb-canvas" width="160" height="226"></canvas>
                </div>
                <div class="thumb-footer">
                    <span class="thumb-page-num">${idx + 1}</span>
                    <div class="thumb-actions-bar">
                        <button type="button" class="thumb-act-btn" data-act="up" title="Nach vorne schieben">‹</button>
                        <button type="button" class="thumb-act-btn" data-act="down" title="Nach hinten schieben">›</button>
                        <button type="button" class="thumb-act-btn" data-act="dup" title="Seite duplizieren">⧉</button>
                        <button type="button" class="thumb-act-btn danger" data-act="del" title="Seite löschen">✕</button>
                    </div>
                </div>
            `;

            item.addEventListener('click', (e) => {
                const actBtn = e.target.closest('.thumb-act-btn');
                if (actBtn) {
                    e.stopPropagation();
                    handleThumbnailPageAction(idx, actBtn.dataset.act);
                    return;
                }
                selectPage(idx);
            });

            DOM.thumbnailsGrid.appendChild(item);
            await updateSingleThumbnail(idx);
        }
    }

    async function updateSingleThumbnail(pageIndex) {
        if (!AppState.currentNotebook) return;
        const pMeta = AppState.currentNotebook.pages[pageIndex];
        if (!pMeta) return;
        const thumbItem = DOM.thumbnailsGrid.querySelector(`.thumb-item[data-page-index="${pageIndex}"]`);
        if (!thumbItem) return;
        const tCanvas = thumbItem.querySelector('.thumb-canvas');
        if (!tCanvas) return;

        const tCtx = tCanvas.getContext('2d');
        tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
        await renderPageBackgroundToContext(tCtx, tCanvas.width, tCanvas.height, pMeta, AppState.currentNotebook);
        const pData = AppState.pagesCache[pMeta.id];
        if (pData) {
            await renderPageObjectsToContext(tCtx, tCanvas.width, tCanvas.height, pData);
        }
    }

    function highlightActiveThumbnail() {
        const items = DOM.thumbnailsGrid.querySelectorAll('.thumb-item');
        items.forEach((el, i) => el.classList.toggle('active', i === AppState.currentPageIndex));
    }

    async function handleThumbnailPageAction(idx, action) {
        const pages = AppState.currentNotebook.pages;
        if (action === 'up' && idx > 0) {
            const tmp = pages[idx - 1];
            pages[idx - 1] = pages[idx];
            pages[idx] = tmp;
            AppState.currentPageIndex = idx - 1;
        } else if (action === 'down' && idx < pages.length - 1) {
            const tmp = pages[idx + 1];
            pages[idx + 1] = pages[idx];
            pages[idx] = tmp;
            AppState.currentPageIndex = idx + 1;
        } else if (action === 'dup') {
            const src = pages[idx];
            const newId = 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const srcData = AppState.pagesCache[src.id] ? JSON.parse(JSON.stringify(AppState.pagesCache[src.id])) : null;
            if (srcData) {
                srcData.pageId = newId;
                srcData.lastModified = Date.now();
                AppState.pagesCache[newId] = srcData;
            }
            pages.splice(idx + 1, 0, {
                ...src,
                id: newId,
                isCover: false,
                duplicateFrom: src.id,
                lastModified: Date.now()
            });
            AppState.currentPageIndex = idx + 1;
        } else if (action === 'del') {
            if (pages.length <= 1) {
                alert('Ein Heft muss mindestens eine Seite enthalten.');
                return;
            }
            if (!window.confirm(`Seite ${idx + 1} wirklich löschen?`)) return;
            pages.splice(idx, 1);
            AppState.currentPageIndex = Math.max(0, Math.min(AppState.currentPageIndex, pages.length - 1));
        }

        await saveNotebookMeta();
        await selectPage(AppState.currentPageIndex);
        renderSidebarThumbnails();
    }

    async function insertBlankPageAfterCurrent() {
        if (!AppState.currentNotebook) return;
        const currMeta = getCurrentPageMeta();
        const newId = 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const newPageMeta = {
            id: newId,
            isCover: false,
            paperColor: (currMeta && !currMeta.isCover) ? currMeta.paperColor : '#fbf8ee',
            paperTemplate: (currMeta && !currMeta.isCover && !String(currMeta.paperTemplate).startsWith('cover_')) ? currMeta.paperTemplate : 'grid_5mm',
            backgroundAsset: null,
            lastModified: Date.now()
        };
        AppState.pagesCache[newId] = {
            pageId: newId,
            lastModified: Date.now(),
            strokes: [],
            shapes: [],
            texts: [],
            images: [],
            stickers: [],
            backgroundAsset: null
        };
        AppState.currentNotebook.pages.splice(AppState.currentPageIndex + 1, 0, newPageMeta);
        await saveNotebookMeta();
        await selectPage(AppState.currentPageIndex + 1);
        renderSidebarThumbnails();
    }

    // Inline Textfeld / Sprechblasen Editor
    function openInlineTextEditorAt(x, y) {
        commitInlineTextIfActive();
        AppState.editingTextObj = {
            id: 'txt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            x: Math.max(20, Math.min(PAGE_WIDTH - 280, x)),
            y: Math.max(20, Math.min(PAGE_HEIGHT - 140, y)),
            text: '',
            color: AppState.activeColor,
            fontSize: parseInt(DOM.textFontSize.value, 10) || 24,
            hasBox: DOM.textHasBox.checked,
            hasBubble: DOM.textHasBubble.checked
        };
        DOM.inlineTextWrap.style.left = AppState.editingTextObj.x + 'px';
        DOM.inlineTextWrap.style.top = AppState.editingTextObj.y + 'px';
        DOM.inlineTextArea.value = '';
        DOM.inlineTextWrap.classList.remove('hidden');
        setTimeout(() => DOM.inlineTextArea.focus(), 20);
    }

    function commitInlineTextIfActive() {
        if (!AppState.editingTextObj) return;
        const val = DOM.inlineTextArea.value.trim();
        if (val !== '') {
            saveHistorySnapshot();
            AppState.editingTextObj.text = val;
            AppState.editingTextObj.color = AppState.activeColor;
            AppState.editingTextObj.fontSize = parseInt(DOM.textFontSize.value, 10) || 24;
            AppState.editingTextObj.hasBox = DOM.textHasBox.checked;
            AppState.editingTextObj.hasBubble = DOM.textHasBubble.checked;
            const pageData = getCurrentPageData();
            if (pageData) {
                pageData.texts.push(AppState.editingTextObj);
                triggerPageAutoSave();
            }
        }
        AppState.editingTextObj = null;
        DOM.inlineTextWrap.classList.add('hidden');
        redrawMainCanvas();
    }

    // =========================================================================
    // 14. TOOLBAR, STRICHSTÄRKEN-SLOTS, FARBEN & LINEAL BINDINGS
    // =========================================================================
    function getCurrentStrokeWidth() {
        const sub = AppState.penSubMode || 'ballpoint';
        const slots = AppState.widthSlots[sub] || AppState.widthSlots.ballpoint;
        return slots[AppState.activeWidthSlot] || 4.0;
    }

    function updateWidthSlotUI() {
        const sub = AppState.penSubMode || 'ballpoint';
        const slots = AppState.widthSlots[sub] || AppState.widthSlots.ballpoint;
        for (let i = 0; i < 3; i++) {
            const w = slots[i];
            const prev = document.getElementById('width-preview-' + i);
            const val = document.getElementById('width-val-' + i);
            if (prev) prev.style.height = Math.max(2, Math.min(14, w * 0.65)) + 'px';
            if (val) val.textContent = Number(w).toFixed(1);
        }
        document.querySelectorAll('.width-slot-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === AppState.activeWidthSlot);
        });
    }

    function setActiveTool(toolName) {
        commitInlineTextIfActive();
        if (toolName !== 'lasso') clearLassoSelection();
        if (toolName !== 'image') {
            AppState.selectedImageId = null;
        }
        if (toolName !== 'lab') {
            AppState.selectedLabId = null;
            if (window.WebNotesLab) {
                window.WebNotesLab.openLabDrawer(false);
                window.WebNotesLab.syncLabInspectorUI();
            }
        }
        drawUIOverlay();
        AppState.activeTool = toolName;

        document.querySelectorAll('.top-bar-center .tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        const extraWrap = document.getElementById('pill-extra-controls');
        const eraserGroup = document.getElementById('eraser-options');
        const shapeGroup = document.getElementById('shape-options');
        const imageGroup = document.getElementById('image-options');
        const labGroup = document.getElementById('lab-options');

        eraserGroup.classList.add('hidden');
        shapeGroup.classList.add('hidden');
        if (imageGroup) imageGroup.classList.add('hidden');
        if (labGroup) labGroup.classList.add('hidden');
        extraWrap.classList.add('hidden');

        if (toolName === 'eraser') {
            extraWrap.classList.remove('hidden');
            eraserGroup.classList.remove('hidden');
        } else if (toolName === 'shapes' || (toolName === 'pen' && AppState.penSubMode === 'shape_draw')) {
            extraWrap.classList.remove('hidden');
            shapeGroup.classList.remove('hidden');
        } else if (toolName === 'image' && imageGroup) {
            extraWrap.classList.remove('hidden');
            imageGroup.classList.remove('hidden');
        } else if (toolName === 'lab' && labGroup) {
            extraWrap.classList.remove('hidden');
            labGroup.classList.remove('hidden');
            if (window.WebNotesLab) {
                window.WebNotesLab.openLabDrawer(true);
            }
        }
    }

    function initRulerInteractions() {
        const rulerEl = DOM.rulerEl;
        const rotHandle = document.getElementById('ruler-rotate-handle');

        rulerEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#btn-ruler-snap-0')) return;
            e.stopPropagation();
            e.preventDefault();
            rulerEl.setPointerCapture(e.pointerId);
            if (e.target === rotHandle || e.target.closest('#ruler-rotate-handle')) {
                AppState.ruler.rotating = true;
                AppState.ruler.dragStartY = e.clientY;
                AppState.ruler.startAngle = AppState.ruler.angleDeg;
            } else {
                AppState.ruler.dragging = true;
                AppState.ruler.dragStartX = e.clientX;
                AppState.ruler.dragStartY = e.clientY;
                AppState.ruler.startRulerX = AppState.ruler.x;
                AppState.ruler.startRulerY = AppState.ruler.y;
            }
        });

        rulerEl.addEventListener('pointermove', (e) => {
            if (!AppState.ruler.dragging && !AppState.ruler.rotating) return;
            e.stopPropagation();
            e.preventDefault();
            if (AppState.ruler.dragging) {
                const dx = (e.clientX - AppState.ruler.dragStartX) / AppState.viewZoom;
                const dy = (e.clientY - AppState.ruler.dragStartY) / AppState.viewZoom;
                AppState.ruler.x = AppState.ruler.startRulerX + dx;
                AppState.ruler.y = AppState.ruler.startRulerY + dy;
            } else if (AppState.ruler.rotating) {
                const dy = e.clientY - AppState.ruler.dragStartY;
                AppState.ruler.angleDeg = Math.round((AppState.ruler.startAngle + dy * 0.45) % 360);
            }
            updateRulerTransform();
        });

        rulerEl.addEventListener('pointerup', (e) => {
            AppState.ruler.dragging = false;
            AppState.ruler.rotating = false;
            try { rulerEl.releasePointerCapture(e.pointerId); } catch (_) {}
        });

        document.getElementById('btn-ruler-snap-0').addEventListener('click', (e) => {
            e.stopPropagation();
            AppState.ruler.angleDeg = (Math.abs(AppState.ruler.angleDeg) < 45) ? 90 : 0;
            updateRulerTransform();
        });
    }

    function updateRulerTransform() {
        DOM.rulerEl.style.transform = `translate(${AppState.ruler.x}px, ${AppState.ruler.y}px) rotate(${AppState.ruler.angleDeg}deg)`;
        DOM.rulerAngleBadge.textContent = `${AppState.ruler.angleDeg}°`;
    }

    // =========================================================================
    // 15. SPEICHER-HOOKS (2-MINUTEN INTERVALL + SOFORT BEI SEITENWECHSEL / SCHLIESSEN)
    //     Verhindert jegliche CPU-/Netzwerk-Unterbrechung während des Schreibens!
    // =========================================================================
    const AUTO_SAVE_INTERVAL_MS = 120000; // 2 Minuten (120.000 ms)
    let dirtyPagesSet = new Set();

    function triggerPageAutoSave() {
        if (!AppState.currentNotebook) return;
        const pageMeta = getCurrentPageMeta();
        const pageData = getCurrentPageData();
        if (!pageMeta || !pageData) return;

        const key = pageMeta.id;
        dirtyPagesSet.add(key);

        if (typeof window.WebNotesApp.scheduleGranularPageSave === 'function') {
            window.WebNotesApp.scheduleGranularPageSave();
            return;
        }

        // Timer NICHT bei jedem Strich neu starten, sondern einmalig für 2 Minuten laufen lassen
        if (!AppState.saveTimers[key]) {
            AppState.saveTimers[key] = setTimeout(() => {
                delete AppState.saveTimers[key];
                executeBackgroundPageSave(AppState.currentNotebook.id, key);
            }, AUTO_SAVE_INTERVAL_MS);
        }
    }

    async function executeBackgroundPageSave(notebookId, pageId) {
        // Niemals mitten in einem laufenden Stiftzug speichern – warte bis Stift abgesetzt ist!
        if (AppState.isPenDrawing) {
            AppState.saveTimers[pageId] = setTimeout(() => {
                delete AppState.saveTimers[pageId];
                executeBackgroundPageSave(notebookId, pageId);
            }, 3000);
            return;
        }

        const pageData = AppState.pagesCache[pageId];
        if (!pageData || !dirtyPagesSet.has(pageId)) return;

        dirtyPagesSet.delete(pageId);
        setSyncStatus('saving', 'Speichert...');

        try {
            const res = await apiCall('save_page', {
                notebookId,
                pageId,
                baseTimestamp: pageData.lastModified || 0,
                pageData
            });
            if (res.ok) {
                pageData.lastModified = res.lastModified;
                if (AppState.currentNotebook && AppState.currentNotebook.pages) {
                    const pMeta = AppState.currentNotebook.pages.find(p => p.id === pageId);
                    if (pMeta) pMeta.lastModified = res.lastModified;
                }
                setSyncStatus('saved', 'Gespeichert ✓');
            } else {
                dirtyPagesSet.add(pageId);
                setSyncStatus('offline', 'Offline-Puffer!');
            }
        } catch (_) {
            dirtyPagesSet.add(pageId);
            setSyncStatus('offline', 'Offline-Puffer!');
        }
    }

    function flushPendingPageSave() {
        if (typeof window.WebNotesApp.flushOfflineQueue === 'function') {
            window.WebNotesApp.flushOfflineQueue(true);
            return;
        }
        if (!AppState.currentNotebook) return;
        const nbId = AppState.currentNotebook.id;
        Array.from(dirtyPagesSet).forEach(pageId => {
            if (AppState.saveTimers[pageId]) {
                clearTimeout(AppState.saveTimers[pageId]);
                delete AppState.saveTimers[pageId];
            }
            executeBackgroundPageSave(nbId, pageId);
        });
    }

    async function saveNotebookMeta() {
        if (!AppState.currentNotebook) return;
        setSyncStatus('saving', 'Speichert...');
        try {
            const res = await apiCall('save_meta', {
                notebookId: AppState.currentNotebook.id,
                title: AppState.currentNotebook.title,
                folderId: AppState.currentNotebook.folderId,
                coverStyle: AppState.currentNotebook.coverStyle,
                pages: AppState.currentNotebook.pages
            });
            if (res.ok && res.meta) {
                AppState.currentNotebook = res.meta;
                setSyncStatus('saved', 'Gespeichert ✓');
            }
        } catch (_) {
            setSyncStatus('offline', 'Offline-Puffer!');
        }
    }

    // =========================================================================
    // 16. UI-EVENT-LISTENER INITIALISIEREN
    // =========================================================================
    function bindUIEvents() {
        // Dashboard-Buttons (Neuer Ordner, Neues Heft, Suche, Sortierung)
        document.getElementById('btn-new-folder').addEventListener('click', () => openFolderModal(null));
        document.getElementById('btn-new-notebook').addEventListener('click', () => openNewNotebookModal());
        document.getElementById('btn-open-settings').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('hidden');
        });

        DOM.dashSearchInput.addEventListener('input', () => {
            AppState.searchQuery = DOM.dashSearchInput.value;
            renderNotebooksGrid();
        });

        DOM.sortNotebooksSelect.addEventListener('change', () => {
            AppState.sortOrder = DOM.sortNotebooksSelect.value;
            renderNotebooksGrid();
        });

        // Modal-Schließen-Buttons
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.dataset.closeModal);
                if (target) target.classList.add('hidden');
            });
        });

        // Heft-Aktionen Modal (Symbole statt Zahlen-Prompt)
        document.getElementById('btn-nb-act-rename').addEventListener('click', async () => {
            if (!activeMenuNotebook) return;
            const newTitle = document.getElementById('nb-actions-rename-input').value.trim();
            if (!newTitle) return;
            await apiCall('save_meta', { notebookId: activeMenuNotebook.id, title: newTitle });
            document.getElementById('notebook-actions-modal').classList.add('hidden');
            await loadDashboard();
        });
        document.getElementById('btn-nb-act-move').addEventListener('click', async () => {
            if (!activeMenuNotebook) return;
            const folderId = document.getElementById('nb-actions-folder-select').value;
            if (!folderId) return;
            await apiCall('save_meta', { notebookId: activeMenuNotebook.id, folderId });
            document.getElementById('notebook-actions-modal').classList.add('hidden');
            await loadDashboard();
        });
        document.getElementById('btn-nb-act-duplicate').addEventListener('click', async () => {
            if (!activeMenuNotebook) return;
            await apiCall('duplicate_notebook', { notebookId: activeMenuNotebook.id });
            document.getElementById('notebook-actions-modal').classList.add('hidden');
            await loadDashboard();
        });
        document.getElementById('btn-nb-act-delete').addEventListener('click', async () => {
            if (!activeMenuNotebook) return;
            if (!window.confirm(`Heft „${activeMenuNotebook.title}“ wirklich unwiderruflich löschen?`)) return;
            await apiCall('delete_notebook', { notebookId: activeMenuNotebook.id });
            document.getElementById('notebook-actions-modal').classList.add('hidden');
            await loadDashboard();
        });

        // Ordner-Modal Formular
        document.querySelectorAll('#folder-color-picker .color-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#folder-color-picker .color-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.getElementById('folder-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('folder-edit-id').value;
            const name = document.getElementById('folder-input-name').value.trim();
            const activeSwatch = document.querySelector('#folder-color-picker .color-swatch.active');
            const color = activeSwatch ? activeSwatch.dataset.folderColor : '#6ea864';
            if (!name) return;

            if (editId) {
                const f = AppState.folders.find(x => x.id === editId);
                if (f) { f.name = name; f.color = color; }
            } else {
                AppState.folders.push({
                    id: 'fld_' + Date.now(),
                    name,
                    color,
                    createdAt: Date.now(),
                    order: AppState.folders.length + 1
                });
            }

            await apiCall('save_folders', { folders: AppState.folders });
            document.getElementById('folder-modal').classList.add('hidden');
            renderDashboard();
        });

        document.getElementById('btn-delete-folder').addEventListener('click', async () => {
            const editId = document.getElementById('folder-edit-id').value;
            if (!editId) return;
            if (!window.confirm('Diesen Ordner wirklich löschen?')) return;
            AppState.folders = AppState.folders.filter(f => f.id !== editId);
            if (AppState.selectedFolderId === editId) AppState.selectedFolderId = 'all';
            await apiCall('save_folders', { folders: AppState.folders });
            document.getElementById('folder-modal').classList.add('hidden');
            renderDashboard();
        });

        // Neues-Heft-Modal Auswahl-Karten
        document.querySelectorAll('#cover-presets-grid .cover-preset-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#cover-presets-grid .cover-preset-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            });
        });
        document.querySelectorAll('#nb-paper-color-choices .paper-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#nb-paper-color-choices .paper-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        document.querySelectorAll('#nb-template-grid .template-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#nb-template-grid .template-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            });
        });

        document.getElementById('notebook-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('nb-input-title').value.trim() || 'Neues Heft';
            const folderId = document.getElementById('nb-input-folder').value || 'fld_mint';
            const activeCov = document.querySelector('#cover-presets-grid .cover-preset-card.active');
            const preset = activeCov ? activeCov.dataset.coverPreset : 'sage';
            const bgColor = activeCov ? activeCov.dataset.bg : '#88b378';
            const spineColor = activeCov ? activeCov.dataset.spine : '#a3c995';
            const pattern = document.getElementById('nb-cover-pattern').value || 'school_label';
            const activePaperCol = document.querySelector('#nb-paper-color-choices .paper-color-btn.active');
            const paperColor = activePaperCol ? activePaperCol.dataset.paperColor : '#fbf8ee';
            const activeTpl = document.querySelector('#nb-template-grid .template-card.active');
            const paperTemplate = activeTpl ? activeTpl.dataset.template : 'grid_5mm';

            const res = await apiCall('create_notebook', {
                title,
                folderId,
                hasCover: preset !== 'none',
                paperColor,
                paperTemplate,
                coverStyle: {
                    preset,
                    bgColor,
                    spineColor,
                    pattern,
                    labelTitle: title
                }
            });

            document.getElementById('notebook-modal').classList.add('hidden');
            if (res.ok && res.notebook) {
                await loadDashboard();
                await openNotebook(res.notebook.id, 0);
            }
        });

        // Editor Top-Bar Navigation & Werkzeuge
        document.getElementById('btn-back-dashboard').addEventListener('click', async () => {
            commitInlineTextIfActive();
            flushPendingPageSave();
            DOM.editorView.classList.add('hidden');
            DOM.dashboardView.classList.remove('hidden');
            await loadDashboard();
        });

        // Beim Tab-Wechsel oder Schließen des Fensters ungespeicherte Seiten sofort sichern
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushPendingPageSave();
            }
        });
        window.addEventListener('beforeunload', () => {
            flushPendingPageSave();
        });

        document.getElementById('btn-toggle-sidebar').addEventListener('click', (e) => {
            DOM.pagesSidebar.classList.toggle('collapsed');
            e.currentTarget.classList.toggle('active', !DOM.pagesSidebar.classList.contains('collapsed'));
        });

        DOM.notebookTitleInput.addEventListener('change', async () => {
            if (!AppState.currentNotebook) return;
            AppState.currentNotebook.title = DOM.notebookTitleInput.value.trim() || 'Heft';
            await saveNotebookMeta();
        });

        document.getElementById('btn-undo').addEventListener('click', performUndo);
        document.getElementById('btn-redo').addEventListener('click', performRedo);

        document.querySelectorAll('.top-bar-center .tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
        });

        // Papier-Vorlage der aktuellen Seite ändern
        document.getElementById('btn-paper-template').addEventListener('click', () => {
            document.getElementById('page-template-modal').classList.remove('hidden');
        });
        document.querySelectorAll('#page-paper-color-choices .paper-color-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pMeta = getCurrentPageMeta();
                if (!pMeta) return;
                pMeta.paperColor = btn.dataset.pageColor;
                await renderCurrentPageFull();
                await updateSingleThumbnail(AppState.currentPageIndex);
                await saveNotebookMeta();
            });
        });
        document.querySelectorAll('#page-template-grid .template-card').forEach(card => {
            card.addEventListener('click', async () => {
                const pMeta = getCurrentPageMeta();
                if (!pMeta) return;
                const tpl = card.dataset.pageTpl;
                pMeta.paperTemplate = tpl;
                pMeta.isCover = tpl.startsWith('cover_');
                await renderCurrentPageFull();
                await updateSingleThumbnail(AppState.currentPageIndex);
                await saveNotebookMeta();
            });
        });

        // Interaktives Lineal ein-/ausblenden
        document.getElementById('btn-toggle-ruler').addEventListener('click', (e) => {
            AppState.ruler.visible = !AppState.ruler.visible;
            DOM.rulerEl.classList.toggle('hidden', !AppState.ruler.visible);
            e.currentTarget.classList.toggle('active', AppState.ruler.visible);
            updateRulerTransform();
        });

        // Sub-Bar: Kugelschreiber / Textmarker / Formen-Modus / Labor-Baukasten
        document.querySelectorAll('#pill-pen-modes .submode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sub = btn.dataset.submode;
                document.querySelectorAll('#pill-pen-modes .submode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (sub === 'lab') {
                    setActiveTool('lab');
                } else {
                    AppState.penSubMode = sub;
                    setActiveTool('pen');
                    updateWidthSlotUI();
                }
            });
        });

        // 3 Strichstärken-Slots + Feinjustierungs-Popover
        const widthPopover = document.getElementById('width-popover');
        const widthSlider = document.getElementById('width-slider-input');
        const widthLabel = document.getElementById('width-slider-label');

        document.querySelectorAll('.width-slot-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotIdx = parseInt(btn.dataset.slot, 10);
                if (AppState.activeWidthSlot === slotIdx && !widthPopover.classList.contains('hidden')) {
                    widthPopover.classList.add('hidden');
                    return;
                }
                AppState.activeWidthSlot = slotIdx;
                updateWidthSlotUI();

                const sub = AppState.penSubMode || 'ballpoint';
                const currVal = AppState.widthSlots[sub][slotIdx];
                document.getElementById('width-popover-slot-num').textContent = String(slotIdx + 1);
                widthSlider.value = String(currVal);
                widthLabel.textContent = Number(currVal).toFixed(1) + ' px';
                widthPopover.classList.remove('hidden');
            });
        });

        widthSlider.addEventListener('input', () => {
            const val = parseFloat(widthSlider.value);
            const sub = AppState.penSubMode || 'ballpoint';
            AppState.widthSlots[sub][AppState.activeWidthSlot] = val;
            widthLabel.textContent = val.toFixed(1) + ' px';
            updateWidthSlotUI();
        });

        document.querySelectorAll('.preset-chip[data-preset-w]').forEach(chip => {
            chip.addEventListener('click', () => {
                const val = parseFloat(chip.dataset.presetW);
                const sub = AppState.penSubMode || 'ballpoint';
                AppState.widthSlots[sub][AppState.activeWidthSlot] = val;
                widthSlider.value = String(val);
                widthLabel.textContent = val.toFixed(1) + ' px';
                updateWidthSlotUI();
            });
        });

        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('#width-popover') && !e.target.closest('.width-slot-btn')) {
                widthPopover.classList.add('hidden');
            }
        });

        // Farb-Slots
        document.querySelectorAll('#pill-colors .color-swatch[data-color]').forEach(sw => {
            sw.addEventListener('click', () => {
                AppState.activeColor = sw.dataset.color;
                document.querySelectorAll('#pill-colors .color-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
            });
        });

        const customColorInput = document.getElementById('custom-color-input');
        const customColorLabel = document.getElementById('custom-color-label');
        customColorInput.addEventListener('input', () => {
            AppState.activeColor = customColorInput.value;
            customColorLabel.style.setProperty('--swatch-color', customColorInput.value);
            document.querySelectorAll('#pill-colors .color-swatch').forEach(s => s.classList.remove('active'));
            customColorLabel.classList.add('active');
        });

        // Radierer- & Formen-Suboptionen
        document.querySelectorAll('[data-eraser-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                AppState.eraserMode = btn.dataset.eraserMode;
                document.querySelectorAll('[data-eraser-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.getElementById('btn-clear-page').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            if (!pageData) return;
            if (!window.confirm('Alle Striche und Formen auf dieser Seite löschen?')) return;
            saveHistorySnapshot();
            pageData.strokes = [];
            pageData.shapes = [];
            pageData.texts = [];
            pageData.stickers = [];
            redrawMainCanvas();
            triggerPageAutoSave();
        });

        document.querySelectorAll('[data-shape-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                AppState.shapeType = btn.dataset.shapeType;
                document.querySelectorAll('[data-shape-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Lasso-Kontextmenü Aktionen
        document.getElementById('lasso-btn-delete').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            const sel = AppState.lassoSelection;
            if (!pageData || !sel) return;
            saveHistorySnapshot();
            pageData.strokes = pageData.strokes.filter(s => !sel.strokeIds.includes(s.id));
            pageData.shapes = pageData.shapes.filter(s => !sel.shapeIds.includes(s.id));
            pageData.texts = pageData.texts.filter(t => !sel.textIds.includes(t.id));
            pageData.images = pageData.images.filter(im => !sel.imageIds.includes(im.id));
            pageData.stickers = pageData.stickers.filter(st => !sel.stickerIds.includes(st.id));
            clearLassoSelection();
            redrawMainCanvas();
            triggerPageAutoSave();
        });

        document.getElementById('lasso-btn-recolor').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            const sel = AppState.lassoSelection;
            if (!pageData || !sel) return;
            saveHistorySnapshot();
            pageData.strokes.forEach(s => { if (sel.strokeIds.includes(s.id)) s.color = AppState.activeColor; });
            pageData.shapes.forEach(s => { if (sel.shapeIds.includes(s.id)) s.color = AppState.activeColor; });
            pageData.texts.forEach(t => { if (sel.textIds.includes(t.id)) t.color = AppState.activeColor; });
            redrawMainCanvas();
            triggerPageAutoSave();
        });

        document.getElementById('lasso-btn-duplicate').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            const sel = AppState.lassoSelection;
            if (!pageData || !sel) return;
            saveHistorySnapshot();
            const offset = 28;
            pageData.strokes.slice().forEach(s => {
                if (sel.strokeIds.includes(s.id)) {
                    const copy = JSON.parse(JSON.stringify(s));
                    copy.id = 'str_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    copy.points.forEach(p => { p.x += offset; p.y += offset; });
                    pageData.strokes.push(copy);
                }
            });
            redrawMainCanvas();
            triggerPageAutoSave();
        });

        // Bild-Werkzeug Optionen (+ Bild wählen, 90° drehen, Bild löschen)
        document.getElementById('btn-img-upload').addEventListener('click', () => {
            document.getElementById('hidden-image-input').click();
        });
        document.getElementById('btn-img-rotate90').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            if (!pageData || !AppState.selectedImageId) return;
            const im = (pageData.images || []).find(x => x.id === AppState.selectedImageId);
            if (!im) return;
            saveHistorySnapshot();
            im.rotation = (im.rotation || 0) + Math.PI * 0.5;
            redrawMainCanvas();
            triggerPageAutoSave();
        });
        document.getElementById('btn-img-delete').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            if (!pageData || !AppState.selectedImageId) return;
            saveHistorySnapshot();
            pageData.images = (pageData.images || []).filter(x => x.id !== AppState.selectedImageId);
            AppState.selectedImageId = null;
            redrawMainCanvas();
            triggerPageAutoSave();
        });

        // Schwebende Bild-Aktionsleiste (Duplizieren & Mülleimer direkt am Bild)
        document.getElementById('img-btn-duplicate').addEventListener('click', () => {
            const pageData = getCurrentPageData();
            if (!pageData || !AppState.selectedImageId) return;
            const src = (pageData.images || []).find(x => x.id === AppState.selectedImageId);
            if (!src) return;
            saveHistorySnapshot();
            const copy = {
                ...src,
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                x: Math.min(PAGE_WIDTH - src.w - 10, src.x + 28),
                y: Math.min(PAGE_HEIGHT - src.h - 10, src.y + 28)
            };
            pageData.images.push(copy);
            AppState.selectedImageId = copy.id;
            redrawMainCanvas();
            triggerPageAutoSave();
        });
        document.getElementById('img-btn-delete').addEventListener('click', () => {
            document.getElementById('btn-img-delete').click();
        });

        // Inline Text Übernehmen
        document.getElementById('btn-text-commit').addEventListener('click', commitInlineTextIfActive);

        // Seiten hinzufügen & Blättern
        document.getElementById('btn-add-page-top').addEventListener('click', insertBlankPageAfterCurrent);
        document.getElementById('btn-sidebar-add-page').addEventListener('click', insertBlankPageAfterCurrent);
        document.getElementById('btn-prev-page').addEventListener('click', () => {
            if (AppState.currentPageIndex > 0) selectPage(AppState.currentPageIndex - 1);
        });
        document.getElementById('btn-next-page').addEventListener('click', () => {
            if (!AppState.currentNotebook) return;
            if (AppState.currentPageIndex < AppState.currentNotebook.pages.length - 1) {
                selectPage(AppState.currentPageIndex + 1);
            } else {
                insertBlankPageAfterCurrent();
            }
        });

        // Zoom-Buttons
        document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(AppState.viewZoom * 1.15));
        document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(AppState.viewZoom * 0.87));
        document.getElementById('btn-zoom-reset').addEventListener('click', fitPageToViewport);
        const btnFitWidth = document.getElementById('btn-zoom-fit-width');
        if (btnFitWidth) btnFitWidth.addEventListener('click', fitPageToWidth);

        // Tastatur-Shortcuts (Strg+Z / Strg+Y / Entf / Leertaste für Maus-Panning)
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                AppState.isSpacePressed = true;
                if (DOM.uiCanvas && !AppState.mousePanState) DOM.uiCanvas.style.cursor = 'grab';
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) performRedo(); else performUndo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                performRedo();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (AppState.lassoSelection) {
                    e.preventDefault();
                    document.getElementById('lasso-btn-delete').click();
                } else if (AppState.selectedLabId) {
                    e.preventDefault();
                    const delBtn = document.getElementById('lab-insp-delete');
                    if (delBtn) delBtn.click();
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                AppState.isSpacePressed = false;
                if (DOM.uiCanvas && !AppState.mousePanState) DOM.uiCanvas.style.cursor = 'crosshair';
            }
        });
    }

    function showCanvasToast(msg) {
        if (!DOM.canvasToast) return;
        DOM.canvasToast.textContent = msg;
        DOM.canvasToast.classList.remove('hidden');
        clearTimeout(showCanvasToast._t);
        showCanvasToast._t = setTimeout(() => {
            DOM.canvasToast.classList.add('hidden');
        }, 2100);
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Exportiere zentrale Funktionen für Meilenstein 4 (app.js – Teil 2)
    Object.assign(window.WebNotesApp, {
        apiCall,
        setSyncStatus,
        getCurrentPageMeta,
        getCurrentPageData,
        renderPageBackgroundToContext,
        renderPageObjectsToContext,
        renderCurrentPageFull,
        redrawMainCanvas,
        renderSidebarThumbnails,
        updateSingleThumbnail,
        saveHistorySnapshot,
        saveNotebookMeta,
        triggerPageAutoSave,
        flushPendingPageSave,
        selectPage,
        setActiveTool,
        showCanvasToast,
        loadImageAsset,
        getSelectedLabId: () => AppState.selectedLabId,
        setSelectedLabId: (id) => {
            AppState.selectedLabId = id;
            drawUIOverlay();
        },
        PAGE_WIDTH,
        PAGE_HEIGHT
    });

    // Boot-Sequenz beim Laden des DOMs
    document.addEventListener('DOMContentLoaded', () => {
        initDOMReferences();
        initCanvasPointerEngine();
        initRulerInteractions();
        bindUIEvents();
        updateWidthSlotUI();
        checkAuthAndBoot();
    });

})();

// =============================================================================
// MEILENSTEIN 4 (app.js – Teil 2):
// - Granulare Sync-Engine & localStorage Offline-Queue (iPad-Resilienz)
// - Stale-Tab Konfliktschutz (409 Conflict + Merge) & Auto-Poll beim Tab-Wechsel
// - Server-Asset Medien-Pipeline (Datei-Dialog, Drag & Drop, Ctrl+V Snipping Tool)
// - PDF-Import (pdf.js @ Scale 2.5) & 300-DPI PDF-Export (jsPDF @ 2480 x 3508 px)
// =============================================================================
(function () {
    'use strict';

    const OFFLINE_QUEUE_KEY = 'webnotes_offline_save_queue_v1';
    const AUTO_SAVE_INTERVAL_MS = 120000; // 2 Minuten während aktivem Unterricht

    let queueTimers = {};
    let isFlushingQueue = false;
    let activeConflictContext = null;

    function getApp() {
        return window.WebNotesApp;
    }

    // -------------------------------------------------------------------------
    // 1. OFFLINE-QUEUE IM LOCALSTORAGE & GRANULARES SPEICHERN
    // -------------------------------------------------------------------------
    function readOfflineQueue() {
        try {
            const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function writeOfflineQueue(queue) {
        try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        } catch (err) {
            console.warn('localStorage Quota erreicht:', err);
        }
    }

    function enqueuePageLocally(notebookId, pageId, pageData) {
        const queue = readOfflineQueue();
        const key = `${notebookId}::${pageId}`;
        queue[key] = {
            notebookId,
            pageId,
            baseTimestamp: pageData.lastModified || 0,
            pageData: JSON.parse(JSON.stringify(pageData)),
            queuedAt: Date.now()
        };
        writeOfflineQueue(queue);

        // Zusätzlich lokalen Heft-Cache aktualisieren
        try {
            const app = getApp();
            if (app.state.currentNotebook && app.state.currentNotebook.id === notebookId) {
                localStorage.setItem('webnotes_nb_' + notebookId, JSON.stringify({
                    meta: app.state.currentNotebook,
                    pages: app.state.pagesCache
                }));
            }
        } catch (_) {}
    }

    function removePageFromOfflineQueue(notebookId, pageId) {
        const queue = readOfflineQueue();
        const key = `${notebookId}::${pageId}`;
        if (queue[key]) {
            delete queue[key];
            writeOfflineQueue(queue);
        }
    }

    function scheduleGranularPageSave() {
        const app = getApp();
        const nb = app.state.currentNotebook;
        const pageMeta = app.getCurrentPageMeta();
        const pageData = app.getCurrentPageData();
        if (!nb || !pageMeta || !pageData) return;

        // Sofort lokal im Offline-Puffer sichern (0ms Netzwerk-Last)
        enqueuePageLocally(nb.id, pageMeta.id, pageData);

        if (!navigator.onLine) {
            app.setSyncStatus('offline', 'Offline gespeichert (Puffer)');
            return;
        }

        const key = `${nb.id}::${pageMeta.id}`;
        if (!queueTimers[key]) {
            queueTimers[key] = setTimeout(() => {
                delete queueTimers[key];
                flushOfflineQueue();
            }, AUTO_SAVE_INTERVAL_MS);
        }
    }

    async function flushOfflineQueue(force = false) {
        const app = getApp();
        if (isFlushingQueue) return;
        if (!force && app.state.isPenDrawing) {
            // Niemals während einer aktiven Stift-Bewegung synchronisieren!
            setTimeout(() => flushOfflineQueue(false), 3000);
            return;
        }

        const queue = readOfflineQueue();
        const keys = Object.keys(queue);
        if (keys.length === 0) return;

        if (!navigator.onLine) {
            app.setSyncStatus('offline', 'Offline gespeichert (Puffer)');
            return;
        }

        isFlushingQueue = true;
        app.setSyncStatus('saving', 'Speichert...');

        try {
            for (const key of keys) {
                const entry = queue[key];
                const res = await app.apiCall('save_page', {
                    notebookId: entry.notebookId,
                    pageId: entry.pageId,
                    baseTimestamp: entry.baseTimestamp,
                    pageData: entry.pageData
                });

                if (res.ok) {
                    removePageFromOfflineQueue(entry.notebookId, entry.pageId);
                    if (app.state.pagesCache[entry.pageId]) {
                        app.state.pagesCache[entry.pageId].lastModified = res.lastModified;
                    }
                    if (app.state.currentNotebook && app.state.currentNotebook.id === entry.notebookId) {
                        const pm = app.state.currentNotebook.pages.find(p => p.id === entry.pageId);
                        if (pm) pm.lastModified = res.lastModified;
                    }
                } else if (res._httpStatus === 409 && res.conflict) {
                    // Stale-Tab Konflikt (anderes Gerät hat neuere Version gespeichert)
                    activeConflictContext = {
                        entry,
                        serverPage: res.serverPage,
                        serverTimestamp: res.serverTimestamp
                    };
                    document.getElementById('conflict-modal').classList.remove('hidden');
                    app.setSyncStatus('error', 'Sync-Konflikt (409)');
                    isFlushingQueue = false;
                    return;
                } else if (res._httpStatus === 404) {
                    // Heft oder Seite existiert auf dem Server nicht mehr (z. B. auf anderem Gerät gelöscht):
                    // Verwaisten Eintrag aus dem Puffer entfernen, damit nachfolgende Änderungen nicht blockiert werden.
                    console.warn('Verwaisten Offline-Queue-Eintrag entfernt (404):', key);
                    removePageFromOfflineQueue(entry.notebookId, entry.pageId);
                    continue;
                } else {
                    throw new Error(res.error || 'Server-Fehler beim Speichern');
                }
            }

            app.setSyncStatus('saved', 'Gespeichert ✓');
        } catch (err) {
            console.warn('Offline-Queue Sync fehlgeschlagen:', err);
            app.setSyncStatus('offline', 'Offline gespeichert (Puffer)');
        } finally {
            isFlushingQueue = false;
        }
    }

    // -------------------------------------------------------------------------
    // 2. KONFLIKT-AUFLÖSUNG (409) & MULTI-DEVICE SYNC-POLLING (IPAD <-> PC)
    // -------------------------------------------------------------------------
    function bindConflictResolutionModal() {
        const modal = document.getElementById('conflict-modal');
        const app = getApp();

        document.getElementById('btn-conflict-load-server').addEventListener('click', async () => {
            if (!activeConflictContext) return;
            const { entry, serverPage } = activeConflictContext;
            removePageFromOfflineQueue(entry.notebookId, entry.pageId);
            app.state.pagesCache[entry.pageId] = serverPage;
            modal.classList.add('hidden');
            activeConflictContext = null;
            await app.renderCurrentPageFull();
            await app.updateSingleThumbnail(app.state.currentPageIndex);
            app.setSyncStatus('saved', 'Server-Stand geladen ✓');
        });

        document.getElementById('btn-conflict-merge').addEventListener('click', async () => {
            if (!activeConflictContext) return;
            const { entry, serverPage, serverTimestamp } = activeConflictContext;
            const merged = mergePageDataById(serverPage, entry.pageData);
            merged.lastModified = serverTimestamp;
            app.state.pagesCache[entry.pageId] = merged;

            const res = await app.apiCall('save_page', {
                notebookId: entry.notebookId,
                pageId: entry.pageId,
                baseTimestamp: serverTimestamp,
                force: true,
                pageData: merged
            });
            if (res.ok) {
                merged.lastModified = res.lastModified;
                removePageFromOfflineQueue(entry.notebookId, entry.pageId);
                app.setSyncStatus('saved', 'Zusammengeführt ✓');
            }
            modal.classList.add('hidden');
            activeConflictContext = null;
            await app.renderCurrentPageFull();
            await app.updateSingleThumbnail(app.state.currentPageIndex);
        });

        document.getElementById('btn-conflict-force-local').addEventListener('click', async () => {
            if (!activeConflictContext) return;
            const { entry } = activeConflictContext;
            const res = await app.apiCall('save_page', {
                notebookId: entry.notebookId,
                pageId: entry.pageId,
                force: true,
                pageData: entry.pageData
            });
            if (res.ok) {
                if (app.state.pagesCache[entry.pageId]) {
                    app.state.pagesCache[entry.pageId].lastModified = res.lastModified;
                }
                removePageFromOfflineQueue(entry.notebookId, entry.pageId);
                app.setSyncStatus('saved', 'Gespeichert ✓');
            }
            modal.classList.add('hidden');
            activeConflictContext = null;
        });
    }

    function mergePageDataById(serverData, localData) {
        const mergeArr = (arrA = [], arrB = []) => {
            const map = new Map();
            arrA.forEach(item => { if (item && item.id) map.set(item.id, item); });
            arrB.forEach(item => { if (item && item.id) map.set(item.id, item); });
            return Array.from(map.values());
        };
        return {
            pageId: localData.pageId || serverData.pageId,
            lastModified: Math.max(serverData.lastModified || 0, localData.lastModified || 0),
            strokes: mergeArr(serverData.strokes, localData.strokes),
            shapes: mergeArr(serverData.shapes, localData.shapes),
            texts: mergeArr(serverData.texts, localData.texts),
            images: mergeArr(serverData.images, localData.images),
            stickers: mergeArr(serverData.stickers, localData.stickers),
            backgroundAsset: localData.backgroundAsset || serverData.backgroundAsset || null
        };
    }

    async function pollServerForChanges(showFeedback = false) {
        const app = getApp();
        const nb = app.state.currentNotebook;
        if (!nb || !navigator.onLine) return;

        // Zuerst eventuelle lokale Änderungen hochladen
        await flushOfflineQueue(false);

        try {
            const res = await app.apiCall('poll_meta', { notebookId: nb.id }, 'GET');
            if (!res.ok || !res.meta) return;

            const serverMeta = res.meta;
            let reloadedAny = false;

            for (const sPage of (serverMeta.pages || [])) {
                const localCached = app.state.pagesCache[sPage.id];
                if (localCached && (sPage.lastModified || 0) > (localCached.lastModified || 0)) {
                    const pRes = await app.apiCall('get_page', {
                        notebookId: nb.id,
                        pageId: sPage.id
                    }, 'GET');
                    if (pRes.ok && pRes.page) {
                        app.state.pagesCache[sPage.id] = pRes.page;
                        reloadedAny = true;
                    }
                }
            }

            if (reloadedAny || (serverMeta.lastModified || 0) > (nb.lastModified || 0)) {
                app.state.currentNotebook = serverMeta;
                await app.renderCurrentPageFull();
                await app.renderSidebarThumbnails();
                app.showCanvasToast('Änderungen vom anderen Gerät synchronisiert ✓');
            } else if (showFeedback) {
                app.showCanvasToast('Aktuellster Stand bereits geladen ✓');
            }
        } catch (_) {}
    }

    // -------------------------------------------------------------------------
    // 3. MEDIEN-PIPELINE: BILD-UPLOAD (DATEI, DRAG & DROP, CTRL+V SNIPPING TOOL)
    // -------------------------------------------------------------------------
    async function uploadAndInsertImageFile(fileOrBlob, dropClientX = null, dropClientY = null) {
        const app = getApp();
        const nb = app.state.currentNotebook;
        const pageData = app.getCurrentPageData();
        if (!nb || !pageData || !fileOrBlob) return;

        app.setSyncStatus('saving', 'Lädt Bild hoch...');
        const formData = new FormData();
        formData.append('notebookId', nb.id);
        formData.append('assetType', 'img');
        formData.append('file', fileOrBlob, fileOrBlob.name || 'paste.png');

        try {
            const res = await app.apiCall('upload_asset', formData, 'POST');
            if (!res.ok || !res.url) {
                throw new Error(res.error || 'Bild-Upload fehlgeschlagen');
            }

            const imgEl = await app.loadImageAsset(res.url);
            const natW = (imgEl && imgEl.naturalWidth) ? imgEl.naturalWidth : (res.width || 480);
            const natH = (imgEl && imgEl.naturalHeight) ? imgEl.naturalHeight : (res.height || 360);

            // Auf sinnvolle Breite skalieren (max. 620px auf der A4-Seite)
            const targetW = Math.min(620, Math.max(180, natW));
            const targetH = targetW * (natH / Math.max(1, natW));

            let x = (app.PAGE_WIDTH - targetW) * 0.5;
            let y = 180;
            if (dropClientX !== null && dropClientY !== null) {
                const rect = document.getElementById('ui-canvas').getBoundingClientRect();
                x = Math.max(20, Math.min(app.PAGE_WIDTH - targetW - 20, ((dropClientX - rect.left) / rect.width) * app.PAGE_WIDTH - targetW * 0.5));
                y = Math.max(20, Math.min(app.PAGE_HEIGHT - targetH - 20, ((dropClientY - rect.top) / rect.height) * app.PAGE_HEIGHT - targetH * 0.5));
            }

            app.saveHistorySnapshot();
            const newImg = {
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                url: res.url,
                fileName: res.fileName,
                x,
                y,
                w: targetW,
                h: targetH,
                rotation: 0
            };
            pageData.images.push(newImg);

            app.state.selectedImageId = newImg.id;
            app.setActiveTool('image');
            await app.redrawMainCanvas();
            app.triggerPageAutoSave();
            app.setSyncStatus('saved', 'Bild gespeichert ✓');
            app.showCanvasToast('Bild eingefügt – zum Verschieben, Skalieren & Drehen antippen ✓');
        } catch (err) {
            alert('Bild konnte nicht hochgeladen werden: ' + err.message);
            app.setSyncStatus('error', 'Upload-Fehler');
        }
    }

    function bindMediaImportEvents() {
        const imgInput = document.getElementById('hidden-image-input');
        imgInput.addEventListener('change', async () => {
            if (imgInput.files && imgInput.files[0]) {
                await uploadAndInsertImageFile(imgInput.files[0]);
                imgInput.value = '';
            }
        });

        // Drag & Drop auf das Wacom Cintiq / Canvas-Viewport
        const viewport = document.getElementById('canvas-viewport');
        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        viewport.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = e.dataTransfer && e.dataTransfer.files;
            if (!files || files.length === 0) return;
            for (const f of files) {
                if (f.type.startsWith('image/')) {
                    await uploadAndInsertImageFile(f, e.clientX, e.clientY);
                } else if (f.type === 'application/pdf') {
                    await importPdfFileIntoNotebook(f);
                }
            }
        });

        // Ctrl+V aus Windows Zwischenablage / Snipping Tool!
        window.addEventListener('paste', async (e) => {
            const app = getApp();
            if (!app.state.currentNotebook) return;
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }
            const items = (e.clipboardData && e.clipboardData.items) ? Array.from(e.clipboardData.items) : [];
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) {
                        await uploadAndInsertImageFile(blob);
                    }
                    break;
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // 4. PDF-IMPORT (PDF.JS IN HOHER AUFLÖSUNG SCALE 2.5 -> SERVER-ASSETS)
    // -------------------------------------------------------------------------
    async function importPdfFileIntoNotebook(file) {
        const app = getApp();
        const nb = app.state.currentNotebook;
        if (!nb || !file) return;
        if (!window.pdfjsLib) {
            alert('PDF.js ist nicht geladen. Bitte setup_libs.php aufrufen.');
            return;
        }

        const progModal = document.getElementById('progress-modal');
        const progTitle = document.getElementById('progress-modal-title');
        const progSub = document.getElementById('progress-modal-sub');
        const progFill = document.getElementById('progress-bar-fill');

        progTitle.textContent = 'PDF-Arbeitsblatt importieren...';
        progSub.textContent = 'Lese PDF-Dokument...';
        progFill.style.width = '5%';
        progModal.classList.remove('hidden');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdfDoc.numPages;

            const offCanvas = document.createElement('canvas');
            const offCtx = offCanvas.getContext('2d');
            let insertAt = app.state.currentPageIndex + 1;

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                progSub.textContent = `Rendere & lade PDF-Seite ${pageNum} von ${totalPages} hoch...`;
                progFill.style.width = Math.round((pageNum / totalPages) * 90) + '%';

                const pdfPage = await pdfDoc.getPage(pageNum);
                const viewport = pdfPage.getViewport({ scale: 2.5 });
                offCanvas.width = viewport.width;
                offCanvas.height = viewport.height;

                offCtx.fillStyle = '#ffffff';
                offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                await pdfPage.render({ canvasContext: offCtx, viewport }).promise;

                const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
                const fd = new FormData();
                fd.append('notebookId', nb.id);
                fd.append('assetType', 'pdf_bg');
                fd.append('file', blob, `pdf_p${pageNum}.png`);

                const upRes = await app.apiCall('upload_asset', fd, 'POST');
                if (!upRes.ok || !upRes.url) {
                    throw new Error(`Fehler bei PDF-Seite ${pageNum}`);
                }

                const newPageId = 'page_pdf_' + Date.now() + '_' + pageNum;
                const pageMeta = {
                    id: newPageId,
                    isCover: false,
                    paperColor: '#ffffff',
                    paperTemplate: 'blank',
                    backgroundAsset: upRes.url,
                    lastModified: Date.now()
                };
                const pageData = {
                    pageId: newPageId,
                    lastModified: Date.now(),
                    strokes: [],
                    shapes: [],
                    texts: [],
                    images: [],
                    stickers: [],
                    backgroundAsset: upRes.url
                };

                nb.pages.splice(insertAt, 0, pageMeta);
                app.state.pagesCache[newPageId] = pageData;

                // Seite direkt auf Server speichern
                await app.apiCall('save_page', {
                    notebookId: nb.id,
                    pageId: newPageId,
                    force: true,
                    pageData
                });
                insertAt++;
            }

            await app.saveNotebookMeta();
            await app.selectPage(app.state.currentPageIndex + 1);
            await app.renderSidebarThumbnails();
            progFill.style.width = '100%';
            app.showCanvasToast(`${totalPages} PDF-Seiten importiert ✓`);
        } catch (err) {
            alert('PDF-Import fehlgeschlagen: ' + err.message);
        } finally {
            progModal.classList.add('hidden');
        }
    }

    // -------------------------------------------------------------------------
    // 5. VERLUSTFREIER 300-DPI PDF-EXPORT (2480 x 3508 PX / DIN A4) MIT JSPDF
    // -------------------------------------------------------------------------
    async function exportNotebookTo300DpiPdf() {
        const app = getApp();
        const nb = app.state.currentNotebook;
        if (!nb) return;
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('jsPDF ist nicht geladen. Bitte setup_libs.php aufrufen.');
            return;
        }

        // Ungespeicherte Änderungen vorher flushen
        await flushOfflineQueue(true);

        const progModal = document.getElementById('progress-modal');
        const progTitle = document.getElementById('progress-modal-title');
        const progSub = document.getElementById('progress-modal-sub');
        const progFill = document.getElementById('progress-bar-fill');

        progTitle.textContent = 'Verlustfreier 300-DPI PDF-Export...';
        progSub.textContent = 'Lade alle Seiten des Heftes...';
        progFill.style.width = '5%';
        progModal.classList.remove('hidden');

        try {
            // Alle Seiten vom Server sicherstellen, damit keine Seite fehlt
            try {
                const allRes = await app.apiCall('get_all_pages', { notebookId: nb.id }, 'GET');
                if (allRes.ok && allRes.pages) {
                    Object.entries(allRes.pages).forEach(([pid, pData]) => {
                        if (!app.state.pagesCache[pid]) {
                            app.state.pagesCache[pid] = pData;
                        }
                    });
                }
            } catch (_) {}

            const EXPORT_W = 2480; // 300 DPI DIN A4 Breite
            const EXPORT_H = 3508; // 300 DPI DIN A4 Höhe
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = EXPORT_W;
            exportCanvas.height = EXPORT_H;
            const exportCtx = exportCanvas.getContext('2d');

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            const total = nb.pages.length;
            for (let i = 0; i < total; i++) {
                const pMeta = nb.pages[i];
                const pData = app.state.pagesCache[pMeta.id] || {
                    strokes: [], shapes: [], texts: [], images: [], stickers: [], backgroundAsset: pMeta.backgroundAsset || null
                };

                progSub.textContent = `Rendere Seite ${i + 1} von ${total} in 300 DPI (2480 × 3508 px)...`;
                progFill.style.width = Math.round(((i + 1) / total) * 95) + '%';

                exportCtx.clearRect(0, 0, EXPORT_W, EXPORT_H);
                await app.renderPageBackgroundToContext(exportCtx, EXPORT_W, EXPORT_H, pMeta, nb);
                await app.renderPageObjectsToContext(exportCtx, EXPORT_W, EXPORT_H, pData);

                const imgDataUrl = exportCanvas.toDataURL('image/jpeg', 0.95);
                if (i > 0) {
                    pdf.addPage('a4', 'portrait');
                }
                pdf.addImage(imgDataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

                // Kurzes Event-Loop-Yield damit UI flüssig bleibt
                await new Promise(r => setTimeout(r, 10));
            }

            const safeFileName = (nb.title || 'WebNotes_Heft').replace(/[^a-zA-Z0-9äöüÄÖÜß_\- ]/g, '_') + '.pdf';
            pdf.save(safeFileName);
            progFill.style.width = '100%';
            app.showCanvasToast(`PDF-Export (${safeFileName}) abgeschlossen ✓`);
        } catch (err) {
            alert('Fehler beim PDF-Export: ' + err.message);
        } finally {
            progModal.classList.add('hidden');
        }
    }

    // -------------------------------------------------------------------------
    // 6. INITIALISIERUNG TEIL 2
    // -------------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        const app = getApp();
        app.scheduleGranularPageSave = scheduleGranularPageSave;
        app.flushOfflineQueue = flushOfflineQueue;

        bindConflictResolutionModal();
        bindMediaImportEvents();

        // PDF-Import & Export Buttons
        const pdfInput = document.getElementById('hidden-pdf-input');
        document.getElementById('btn-import-pdf').addEventListener('click', () => pdfInput.click());
        pdfInput.addEventListener('change', async () => {
            if (pdfInput.files && pdfInput.files[0]) {
                await importPdfFileIntoNotebook(pdfInput.files[0]);
                pdfInput.value = '';
            }
        });
        document.getElementById('btn-export-pdf').addEventListener('click', exportNotebookTo300DpiPdf);

        // Sync-Prüfen-Button & automatischer Tab-Wechsel-Sync
        document.getElementById('btn-poll-sync').addEventListener('click', () => pollServerForChanges(true));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                pollServerForChanges(false);
            } else {
                flushOfflineQueue(true);
            }
        });
        window.addEventListener('online', () => {
            flushOfflineQueue(true);
        });
        window.addEventListener('focus', () => {
            pollServerForChanges(false);
        });

        // Falls beim Start noch gepufferte Offline-Daten im localStorage liegen, sofort synchronisieren
        setTimeout(() => {
            if (navigator.onLine) flushOfflineQueue(false);
        }, 1500);
    });
})();

/**
 * WebNotes – Schwebende Unterrichts-Widgets (widgets.js)
 * Bleiben fest im Viewport (scrollen NICHT mit der Seite mit) und werden NICHT ins PDF exportiert.
 * 100% DSGVO-konform & offline-fähig (inkl. optionalem Web-Audio-Gong beim Countdown-Ende).
 */
(() => {
    'use strict';

    let widgetZCounter = 60;
    let widgetIdCounter = 1;

    // Sanfter Unterrichts-Gong per Web Audio API (keine externen Dateien)
    function playGentleGong() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const freqs = [523.25, 659.25, 783.99]; // C5 - E5 - G5 Dreiklang
            freqs.forEach((f, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now + idx * 0.14);
                gain.gain.setValueAtTime(0.001, now + idx * 0.14);
                gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.14 + 1.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.14);
                osc.stop(now + idx * 0.14 + 1.2);
            });
            setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1800);
        } catch (_) {}
    }

    function pad2(n) {
        return String(Math.max(0, Math.floor(n))).padStart(2, '0');
    }

    function getViewportEl() {
        return document.getElementById('canvas-viewport');
    }

    /**
     * Erzeugt den gemeinsamen schwebenden Widget-Rahmen mit:
     * - Verschieben an der Kopfzeile (Maus, Stift & Touch)
     * - Stufenloser Größenänderung an der Ecke unten rechts (inkl. dynamischer Schriftgröße)
     * - Einfachem Schließen-Button (✕)
     */
    function createWidgetShell({ title, width, height, minW = 210, minH = 140, onDestroy, onResize }) {
        const viewport = getViewportEl();
        if (!viewport) return null;

        const id = 'cw_' + (widgetIdCounter++);
        const existingCount = viewport.querySelectorAll('.classroom-widget').length;
        const vw = viewport.clientWidth || 800;
        const vh = viewport.clientHeight || 600;
        const initW = Math.min(width, vw - 32);
        const initH = Math.min(height, vh - 60);
        const initLeft = Math.max(16, Math.min(vw - initW - 16, vw - initW - 24 - (existingCount % 4) * 24));
        const initTop = Math.max(16, Math.min(vh - initH - 60, 20 + (existingCount % 4) * 28));

        const el = document.createElement('div');
        el.id = id;
        el.className = 'classroom-widget palm-shield-zone';
        el.style.width = initW + 'px';
        el.style.height = initH + 'px';
        el.style.left = initLeft + 'px';
        el.style.top = initTop + 'px';
        el.style.zIndex = String(++widgetZCounter);

        el.innerHTML = `
            <div class="cw-header" title="Zum Verschieben ziehen">
                <span class="cw-drag-grip" aria-hidden="true">⋮⋮</span>
                <span class="cw-title">${title}</span>
                <button type="button" class="cw-close-btn" title="Widget entfernen">✕</button>
            </div>
            <div class="cw-body"></div>
            <div class="cw-resize-handle" title="Ziehen zum Ändern der Größe" aria-label="Größe ändern"></div>
        `;

        // Verhindert, dass Interaktionen im Widget an den Canvas-Viewport weitergeleitet werden
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            el.style.zIndex = String(++widgetZCounter);
        });

        // Schließen / Löschen
        const closeBtn = el.querySelector('.cw-close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onDestroy === 'function') onDestroy();
            el.remove();
        });

        // Verschieben über Header
        const header = el.querySelector('.cw-header');
        header.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.cw-close-btn')) return;
            e.preventDefault();
            e.stopPropagation();
            el.style.zIndex = String(++widgetZCounter);
            const startX = e.clientX;
            const startY = e.clientY;
            const origLeft = parseFloat(el.style.left) || 0;
            const origTop = parseFloat(el.style.top) || 0;
            try { header.setPointerCapture(e.pointerId); } catch (_) {}

            const onMove = (ev) => {
                const maxL = Math.max(8, (viewport.clientWidth || 800) - el.offsetWidth - 8);
                const maxT = Math.max(8, (viewport.clientHeight || 600) - el.offsetHeight - 8);
                const nl = Math.max(8, Math.min(maxL, origLeft + (ev.clientX - startX)));
                const nt = Math.max(8, Math.min(maxT, origTop + (ev.clientY - startY)));
                el.style.left = nl + 'px';
                el.style.top = nt + 'px';
            };
            const onUp = () => {
                header.removeEventListener('pointermove', onMove);
                header.removeEventListener('pointerup', onUp);
                header.removeEventListener('pointercancel', onUp);
            };
            header.addEventListener('pointermove', onMove);
            header.addEventListener('pointerup', onUp);
            header.addEventListener('pointercancel', onUp);
        });

        const bodyEl = el.querySelector('.cw-body');
        // Größe ändern über Resize-Handle unten rechts
        const resizeHandle = el.querySelector('.cw-resize-handle');
        resizeHandle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.style.zIndex = String(++widgetZCounter);
            const startX = e.clientX;
            const startY = e.clientY;
            const origW = el.offsetWidth;
            const origH = el.offsetHeight;
            try { resizeHandle.setPointerCapture(e.pointerId); } catch (_) {}

            const onMove = (ev) => {
                const maxW = Math.max(minW, (viewport.clientWidth || 900) - (parseFloat(el.style.left) || 0) - 10);
                const maxH = Math.max(minH, (viewport.clientHeight || 650) - (parseFloat(el.style.top) || 0) - 10);
                const nw = Math.max(minW, Math.min(maxW, origW + (ev.clientX - startX)));
                const nh = Math.max(minH, Math.min(maxH, origH + (ev.clientY - startY)));
                el.style.width = nw + 'px';
                el.style.height = nh + 'px';
                if (typeof onResize === 'function') onResize(nw, nh, bodyEl);
            };
            const onUp = () => {
                resizeHandle.removeEventListener('pointermove', onMove);
                resizeHandle.removeEventListener('pointerup', onUp);
                resizeHandle.removeEventListener('pointercancel', onUp);
            };
            resizeHandle.addEventListener('pointermove', onMove);
            resizeHandle.addEventListener('pointerup', onUp);
            resizeHandle.addEventListener('pointercancel', onUp);
        });

        viewport.appendChild(el);
        return { el, body: bodyEl };
    }

    // =========================================================================
    // WIDGET 1: UHR / STOPPUHR / COUNTDOWN-TIMER
    // =========================================================================
    function spawnClockTimerWidget(initialMode = 'timer') {
        let mode = initialMode; // 'clock' | 'stopwatch' | 'timer'
        let soundEnabled = true;

        // Stoppuhr-Status
        let swRunning = false;
        let swElapsedMs = 0;
        let swStartTs = 0;

        // Countdown-Status
        let cdTotalSec = 300; // Standard: 5 Minuten
        let cdRemainMs = cdTotalSec * 1000;
        let cdRunning = false;
        let cdEndTs = 0;
        let cdFinished = false;

        let tickId = null;

        const shell = createWidgetShell({
            title: '⏱️ Zeit & Timer',
            width: 300,
            height: 225,
            minW: 235,
            minH: 175,
            onDestroy: () => {
                if (tickId) clearInterval(tickId);
            },
            onResize: (w, h, body) => {
                if (!body) return;
                const display = body.querySelector('.cw-time-display');
                if (display) {
                    const size = Math.max(26, Math.min(110, Math.min(w * 0.21, h * 0.34)));
                    display.style.fontSize = Math.round(size) + 'px';
                }
            }
        });
        if (!shell) return;

        shell.body.innerHTML = `
            <div class="cw-tabs">
                <button type="button" class="cw-tab" data-mode="clock">Uhr</button>
                <button type="button" class="cw-tab" data-mode="stopwatch">Stoppuhr</button>
                <button type="button" class="cw-tab" data-mode="timer">Countdown</button>
            </div>
            <div class="cw-clock-main">
                <div class="cw-time-display">05:00</div>
                <div class="cw-sub-info"></div>
                <div class="cw-progress-track hidden">
                    <div class="cw-progress-fill" style="width:100%;"></div>
                </div>
            </div>
            <div class="cw-presets-row hidden">
                <button type="button" class="cw-preset-btn" data-set-sec="60">1m</button>
                <button type="button" class="cw-preset-btn" data-set-sec="180">3m</button>
                <button type="button" class="cw-preset-btn" data-set-sec="300">5m</button>
                <button type="button" class="cw-preset-btn" data-set-sec="600">10m</button>
                <button type="button" class="cw-preset-btn" data-add-sec="60">+1m</button>
                <button type="button" class="cw-preset-btn" data-add-sec="-60">−1m</button>
            </div>
            <div class="cw-controls-row hidden">
                <button type="button" class="cw-ctrl-btn cw-btn-primary" data-act="toggle">Start</button>
                <button type="button" class="cw-ctrl-btn" data-act="reset">Reset</button>
                <button type="button" class="cw-ctrl-btn cw-sound-btn active" data-act="sound" title="Gong bei Ablauf ein/aus">🔔</button>
            </div>
        `;

        const displayEl = shell.body.querySelector('.cw-time-display');
        const subInfoEl = shell.body.querySelector('.cw-sub-info');
        const progTrack = shell.body.querySelector('.cw-progress-track');
        const progFill = shell.body.querySelector('.cw-progress-fill');
        const presetsRow = shell.body.querySelector('.cw-presets-row');
        const controlsRow = shell.body.querySelector('.cw-controls-row');
        const toggleBtn = shell.body.querySelector('[data-act="toggle"]');
        const soundBtn = shell.body.querySelector('[data-act="sound"]');

        function setDisplayScale() {
            const w = shell.el.offsetWidth || 300;
            const h = shell.el.offsetHeight || 225;
            const size = Math.max(26, Math.min(110, Math.min(w * 0.21, h * 0.34)));
            displayEl.style.fontSize = Math.round(size) + 'px';
        }
        setDisplayScale();

        function updateModeUI() {
            shell.body.querySelectorAll('.cw-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.mode === mode);
            });
            presetsRow.classList.toggle('hidden', mode !== 'timer');
            progTrack.classList.toggle('hidden', mode !== 'timer');
            controlsRow.classList.toggle('hidden', mode === 'clock');
            soundBtn.classList.toggle('hidden', mode !== 'timer');
            subInfoEl.classList.toggle('hidden', mode !== 'clock');
            shell.el.classList.remove('cw-alarm-flash');
            renderTime();
        }

        function renderTime() {
            if (mode === 'clock') {
                const now = new Date();
                displayEl.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
                subInfoEl.textContent = now.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
                return;
            }

            if (mode === 'stopwatch') {
                const totalMs = swRunning ? (swElapsedMs + (Date.now() - swStartTs)) : swElapsedMs;
                const mins = Math.floor(totalMs / 60000);
                const secs = Math.floor((totalMs % 60000) / 1000);
                const tenths = Math.floor((totalMs % 1000) / 100);
                displayEl.textContent = `${pad2(mins)}:${pad2(secs)},${tenths}`;
                toggleBtn.textContent = swRunning ? 'Pause' : 'Start';
                return;
            }

            // Countdown-Modus
            let remMs = cdRemainMs;
            if (cdRunning) {
                remMs = Math.max(0, cdEndTs - Date.now());
                cdRemainMs = remMs;
                if (remMs <= 0) {
                    cdRunning = false;
                    cdFinished = true;
                    shell.el.classList.add('cw-alarm-flash');
                    if (soundEnabled) playGentleGong();
                }
            }
            const totalCeilSec = Math.ceil(remMs / 1000);
            const mins = Math.floor(totalCeilSec / 60);
            const secs = totalCeilSec % 60;
            displayEl.textContent = `${pad2(mins)}:${pad2(secs)}`;
            toggleBtn.textContent = cdRunning ? 'Pause' : (cdFinished ? 'Neu starten' : 'Start');

            const pct = cdTotalSec > 0 ? Math.max(0, Math.min(100, (remMs / (cdTotalSec * 1000)) * 100)) : 0;
            progFill.style.width = pct.toFixed(1) + '%';
            progFill.classList.toggle('is-warn', pct <= 25 && pct > 10);
            progFill.classList.toggle('is-danger', pct <= 10);
        }

        // Tab-Wechsel
        shell.body.querySelectorAll('.cw-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                mode = tab.dataset.mode;
                updateModeUI();
            });
        });

        // Countdown-Presets
        shell.body.querySelectorAll('.cw-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                cdRunning = false;
                cdFinished = false;
                shell.el.classList.remove('cw-alarm-flash');
                if (btn.dataset.setSec) {
                    cdTotalSec = parseInt(btn.dataset.setSec, 10);
                    cdRemainMs = cdTotalSec * 1000;
                } else if (btn.dataset.addSec) {
                    const delta = parseInt(btn.dataset.addSec, 10);
                    const currSec = Math.round(cdRemainMs / 1000);
                    const nextSec = Math.max(10, Math.min(3600, currSec + delta));
                    cdTotalSec = Math.max(cdTotalSec, nextSec);
                    cdRemainMs = nextSec * 1000;
                }
                renderTime();
            });
        });

        // Start / Pause / Reset / Sound
        toggleBtn.addEventListener('click', () => {
            if (mode === 'stopwatch') {
                if (swRunning) {
                    swElapsedMs += (Date.now() - swStartTs);
                    swRunning = false;
                } else {
                    swStartTs = Date.now();
                    swRunning = true;
                }
            } else if (mode === 'timer') {
                shell.el.classList.remove('cw-alarm-flash');
                if (cdRunning) {
                    cdRemainMs = Math.max(0, cdEndTs - Date.now());
                    cdRunning = false;
                } else {
                    if (cdRemainMs <= 0) {
                        cdRemainMs = cdTotalSec * 1000;
                    }
                    cdFinished = false;
                    cdEndTs = Date.now() + cdRemainMs;
                    cdRunning = true;
                }
            }
            renderTime();
        });

        shell.body.querySelector('[data-act="reset"]').addEventListener('click', () => {
            shell.el.classList.remove('cw-alarm-flash');
            if (mode === 'stopwatch') {
                swRunning = false;
                swElapsedMs = 0;
            } else if (mode === 'timer') {
                cdRunning = false;
                cdFinished = false;
                cdRemainMs = cdTotalSec * 1000;
            }
            renderTime();
        });

        soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundBtn.classList.toggle('active', soundEnabled);
            soundBtn.textContent = soundEnabled ? '🔔' : '🔕';
        });

        updateModeUI();
        tickId = setInterval(renderTime, 100);
    }

    // =========================================================================
    // WIDGET 2: ARBEITSPHASEN-AMPEL (STILLARBEIT / PARTNER / GRUPPE)
    // =========================================================================
    function spawnTrafficLightWidget() {
        let state = 'green'; // 'red' | 'yellow' | 'green'
        const labels = {
            red: 'Stillarbeit',
            yellow: 'Partnerarbeit',
            green: 'Gespräch / Gruppe'
        };

        const shell = createWidgetShell({
            title: '🚦 Phasen-Ampel',
            width: 150,
            height: 240,
            minW: 120,
            minH: 195
        });
        if (!shell) return;

        shell.body.innerHTML = `
            <div class="cw-ampel-wrap">
                <button type="button" class="cw-lamp cw-lamp-red" data-lamp="red" title="Stillarbeit"></button>
                <button type="button" class="cw-lamp cw-lamp-yellow" data-lamp="yellow" title="Partnerarbeit"></button>
                <button type="button" class="cw-lamp cw-lamp-green active" data-lamp="green" title="Gespräch / Gruppe"></button>
                <div class="cw-ampel-label">Gespräch / Gruppe</div>
            </div>
        `;

        const lbl = shell.body.querySelector('.cw-ampel-label');
        shell.body.querySelectorAll('.cw-lamp').forEach(btn => {
            btn.addEventListener('click', () => {
                state = btn.dataset.lamp;
                shell.body.querySelectorAll('.cw-lamp').forEach(b => b.classList.toggle('active', b.dataset.lamp === state));
                lbl.textContent = labels[state];
            });
        });
    }

    // =========================================================================
    // WIDGET 3: ZUFALLSZAHL / WÜRFEL
    // =========================================================================
    function spawnRandomNumberWidget() {
        const shell = createWidgetShell({
            title: '🎲 Zufallszahl',
            width: 220,
            height: 185,
            minW: 185,
            minH: 155,
            onResize: (w, h, body) => {
                if (!body) return;
                const numEl = body.querySelector('.cw-rand-num');
                if (numEl) {
                    const size = Math.max(30, Math.min(96, Math.min(w * 0.28, h * 0.36)));
                    numEl.style.fontSize = Math.round(size) + 'px';
                }
            }
        });
        if (!shell) return;

        shell.body.innerHTML = `
            <div class="cw-rand-wrap">
                <div class="cw-rand-num">–</div>
                <div class="cw-rand-row">
                    <label>1 bis <input type="number" class="cw-rand-max" min="2" max="999" value="28"></label>
                    <button type="button" class="cw-ctrl-btn cw-btn-primary cw-rand-go">Ziehen</button>
                </div>
            </div>
        `;

        const numEl = shell.body.querySelector('.cw-rand-num');
        const maxInp = shell.body.querySelector('.cw-rand-max');
        const goBtn = shell.body.querySelector('.cw-rand-go');

        goBtn.addEventListener('click', () => {
            const maxVal = Math.max(2, Math.min(999, parseInt(maxInp.value, 10) || 28));
            let rolls = 0;
            const anim = setInterval(() => {
                numEl.textContent = String(Math.floor(Math.random() * maxVal) + 1);
                rolls++;
                if (rolls >= 8) clearInterval(anim);
            }, 40);
        });
    }

    // =========================================================================
    // WIDGET 4: WISSENSCHAFTLICHER TASCHENRECHNER (WINDOWS-RECHNER-STIL)
    // =========================================================================
    function spawnCalculatorWidget() {
        let tokens = [];
        let currentStr = '0';
        let currentVal = 0;
        let isEntering = false;
        let justEvaluated = false;
        let unaryApplied = false;
        let unaryLabel = '';
        let errorState = null;
        let openParens = 0;

        let angleUnit = 'DEG'; // 'DEG' | 'RAD' | 'GRAD'
        let feMode = false;
        let secondMode = false;
        let trigSecond = false;
        let trigHyp = false;
        let memory = null;
        let history = [];
        let lastBinaryOp = null; // { op, sym, rightVal }

        const shell = createWidgetShell({
            title: '🧮 Taschenrechner',
            width: 344,
            height: 505,
            minW: 286,
            minH: 410,
            onResize: () => {
                updateDisplayScale();
            }
        });
        if (!shell) return;

        shell.el.classList.add('cw-calc-widget');
        shell.el.setAttribute('tabindex', '0');

        shell.body.innerHTML = `
            <div class="cw-calc-display-box">
                <div class="cw-calc-top-strip">
                    <span class="cw-calc-mem-badge hidden" title="Speicher aktiv">M</span>
                    <div class="cw-calc-expr" aria-live="polite"></div>
                    <button type="button" class="cw-calc-hist-btn" data-calc-ui="history" title="Verlauf ein-/ausblenden">🕒</button>
                </div>
                <div class="cw-calc-readout" aria-live="polite">0</div>
            </div>

            <div class="cw-calc-mode-bar">
                <button type="button" class="cw-calc-mode-btn" data-calc-ui="angle" title="Winkelmaß wechseln (DEG / RAD / GRAD)">DEG</button>
                <button type="button" class="cw-calc-mode-btn" data-calc-ui="fe" title="Wissenschaftliche Schreibweise (F-E)">F-E</button>
                <div class="cw-calc-drop-wrap">
                    <button type="button" class="cw-calc-mode-btn cw-calc-drop-btn" data-calc-ui="trig-menu" title="Trigonometrie-Funktionen">Trig ▾</button>
                    <div class="cw-calc-popover hidden" data-calc-pop="trig">
                        <div class="cw-calc-pop-grid">
                            <button type="button" class="cw-calc-pop-btn cw-calc-pop-toggle" data-trig-mod="2nd">2nd</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="sin">sin</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="cos">cos</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="tan">tan</button>
                            <button type="button" class="cw-calc-pop-btn cw-calc-pop-toggle" data-trig-mod="hyp">hyp</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="sec">sec</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="csc">csc</button>
                            <button type="button" class="cw-calc-pop-btn" data-trig-fn="cot">cot</button>
                        </div>
                    </div>
                </div>
                <div class="cw-calc-drop-wrap">
                    <button type="button" class="cw-calc-mode-btn cw-calc-drop-btn" data-calc-ui="func-menu" title="Weitere mathematische Funktionen">Fkt ▾</button>
                    <div class="cw-calc-popover hidden" data-calc-pop="func">
                        <div class="cw-calc-pop-grid cw-calc-pop-grid-3">
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="unary" data-fn="abs">|x|</button>
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="unary" data-fn="floor">⌊x⌋</button>
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="unary" data-fn="ceil">⌈x⌉</button>
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="const" data-val="rand">rand</button>
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="unary" data-fn="dms">→dms</button>
                            <button type="button" class="cw-calc-pop-btn" data-calc-act="unary" data-fn="deg">→deg</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="cw-calc-mem-bar">
                <button type="button" class="cw-calc-mem-btn" data-mem="MC" disabled title="Speicher löschen">MC</button>
                <button type="button" class="cw-calc-mem-btn" data-mem="MR" disabled title="Speicher abrufen">MR</button>
                <button type="button" class="cw-calc-mem-btn" data-mem="M+" title="Zum Speicher addieren">M+</button>
                <button type="button" class="cw-calc-mem-btn" data-mem="M-" title="Vom Speicher subtrahieren">M−</button>
                <button type="button" class="cw-calc-mem-btn" data-mem="MS" title="Wert speichern">MS</button>
            </div>

            <div class="cw-calc-grid">
                <!-- Zeile 1 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-ui="2nd" title="Zweitbelegung umschalten">2<sup>nd</sup></button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="const" data-val="pi" title="Pi (π)">π</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="const" data-val="e" title="Eulersche Zahl (e)">e</button>
                <button type="button" class="cw-calc-btn cw-calc-fn cw-calc-clear-btn" data-calc-act="clear" title="Löschen (Esc)">C</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="backspace" title="Letzte Ziffer löschen (Backspace)">⌫</button>

                <!-- Zeile 2 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="sqr" data-fn2="cube" data-lbl1="x<sup>2</sup>" data-lbl2="x<sup>3</sup>">x<sup>2</sup></button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="inv">1/x</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="abs">|x|</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="exp" title="Wissenschaftliche Eingabe (×10^)">exp</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="op" data-op="mod" data-sym="mod">mod</button>

                <!-- Zeile 3 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="sqrt" data-fn2="cbrt" data-lbl1="<sup>2</sup>√x" data-lbl2="<sup>3</sup>√x"><sup>2</sup>√x</button>
                <button type="button" class="cw-calc-btn cw-calc-fn cw-calc-lparen-btn" data-calc-act="lparen">( <span class="cw-calc-paren-count"></span></button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="rparen">)</button>
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="fact">n!</button>
                <button type="button" class="cw-calc-btn cw-calc-op" data-calc-act="op" data-op="/" data-sym="÷">÷</button>

                <!-- Zeile 4 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="op" data-op="^" data-sym="^" data-op2="yroot" data-sym2="yroot" data-lbl1="x<sup>y</sup>" data-lbl2="<sup>y</sup>√x">x<sup>y</sup></button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="7">7</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="8">8</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="9">9</button>
                <button type="button" class="cw-calc-btn cw-calc-op" data-calc-act="op" data-op="*" data-sym="×">×</button>

                <!-- Zeile 5 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="pow10" data-fn2="pow2" data-lbl1="10<sup>x</sup>" data-lbl2="2<sup>x</sup>">10<sup>x</sup></button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="4">4</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="5">5</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="6">6</button>
                <button type="button" class="cw-calc-btn cw-calc-op" data-calc-act="op" data-op="-" data-sym="−">−</button>

                <!-- Zeile 6 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="log10" data-op2="logbase" data-sym2="log base" data-lbl1="log" data-lbl2="log<sub>y</sub>x">log</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="1">1</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="2">2</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="3">3</button>
                <button type="button" class="cw-calc-btn cw-calc-op" data-calc-act="op" data-op="+" data-sym="+">+</button>

                <!-- Zeile 7 -->
                <button type="button" class="cw-calc-btn cw-calc-fn" data-calc-act="unary" data-fn="ln" data-fn2="expE" data-lbl1="ln" data-lbl2="e<sup>x</sup>">ln</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="negate">+/−</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="digit" data-val="0">0</button>
                <button type="button" class="cw-calc-btn cw-calc-num" data-calc-act="decimal">,</button>
                <button type="button" class="cw-calc-btn cw-calc-eq" data-calc-act="equals">=</button>
            </div>

            <div class="cw-calc-history-overlay hidden">
                <div class="cw-calc-hist-head">
                    <span>Verlauf</span>
                    <div class="cw-calc-hist-actions">
                        <button type="button" class="cw-calc-hist-clear" title="Verlauf leeren">Leeren</button>
                        <button type="button" class="cw-calc-hist-close" title="Schließen">✕</button>
                    </div>
                </div>
                <div class="cw-calc-hist-list">
                    <div class="cw-calc-hist-empty">Noch keine Berechnungen</div>
                </div>
            </div>
        `;

        const exprEl = shell.body.querySelector('.cw-calc-expr');
        const readoutEl = shell.body.querySelector('.cw-calc-readout');
        const memBadgeEl = shell.body.querySelector('.cw-calc-mem-badge');
        const angleBtn = shell.body.querySelector('[data-calc-ui="angle"]');
        const feBtn = shell.body.querySelector('[data-calc-ui="fe"]');
        const secondBtn = shell.body.querySelector('[data-calc-ui="2nd"]');
        const clearBtn = shell.body.querySelector('.cw-calc-clear-btn');
        const parenCountEl = shell.body.querySelector('.cw-calc-paren-count');
        const trigPop = shell.body.querySelector('[data-calc-pop="trig"]');
        const funcPop = shell.body.querySelector('[data-calc-pop="func"]');
        const histOverlay = shell.body.querySelector('.cw-calc-history-overlay');
        const histListEl = shell.body.querySelector('.cw-calc-hist-list');
        const memClearBtn = shell.body.querySelector('[data-mem="MC"]');
        const memRecallBtn = shell.body.querySelector('[data-mem="MR"]');

        function toRad(x) {
            if (angleUnit === 'DEG') return x * (Math.PI / 180);
            if (angleUnit === 'GRAD') return x * (Math.PI / 200);
            return x;
        }

        function fromRad(r) {
            if (angleUnit === 'DEG') return r * (180 / Math.PI);
            if (angleUnit === 'GRAD') return r * (200 / Math.PI);
            return r;
        }

        function cleanFloat(n) {
            if (!Number.isFinite(n)) return n;
            if (Object.is(n, -0) || Math.abs(n) === 0) return 0;
            // Rundungsartefakte wie 0.1 + 0.2 = 0.30000000000000004 bereinigen
            const rounded = parseFloat(n.toPrecision(14));
            return Object.is(rounded, -0) ? 0 : rounded;
        }

        // Lanczos-Approximation der Gamma-Funktion für nicht-ganzzahlige Fakultäten (wie Windows-Rechner)
        function gamma(z) {
            const g = 7;
            const p = [
                0.99999999999980993,
                676.5203681218851,
                -1259.1392167224028,
                771.32342877765313,
                -176.61502916214059,
                12.507343278686905,
                -0.13857109526572012,
                9.9843695780195716e-6,
                1.5056327351493116e-7
            ];
            if (z < 0.5) {
                return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
            }
            z -= 1;
            let x = p[0];
            for (let i = 1; i < g + 2; i++) {
                x += p[i] / (z + i);
            }
            const t = z + g + 0.5;
            return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
        }

        function factorial(n) {
            if (!Number.isFinite(n)) return NaN;
            if (n < 0 && Number.isInteger(n)) return NaN;
            if (n > 170) return Infinity;
            if (Number.isInteger(n)) {
                let res = 1;
                for (let i = 2; i <= n; i++) res *= i;
                return res;
            }
            return gamma(n + 1);
        }

        function formatNumber(n, forceExp = false) {
            if (!Number.isFinite(n)) return 'Überlauf';
            const val = cleanFloat(n);
            const abs = Math.abs(val);
            if (forceExp || feMode || (abs !== 0 && (abs >= 1e12 || abs < 1e-8))) {
                const expStr = val.toExponential(8).replace(/\.?0+e/, 'e').replace('.', ',');
                return expStr;
            }
            let s = String(val);
            if (s.includes('e') || s.includes('E')) {
                return s.replace('.', ',');
            }
            const parts = s.split('.');
            const intPart = parts[0];
            const decPart = parts[1];
            const neg = intPart.startsWith('-');
            const digits = neg ? intPart.slice(1) : intPart;
            const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return (neg ? '-' : '') + grouped + (decPart !== undefined ? ',' + decPart : '');
        }

        function formatEnteringStr(str) {
            if (str.includes('e')) {
                const [mant, exp] = str.split('e');
                const mFormatted = formatEnteringStr(mant);
                return mFormatted + 'e' + exp;
            }
            const neg = str.startsWith('-');
            const body = neg ? str.slice(1) : str;
            const parts = body.split('.');
            const intGrouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            if (parts.length === 2) {
                return (neg ? '-' : '') + intGrouped + ',' + parts[1];
            }
            return (neg ? '-' : '') + intGrouped;
        }

        function updateDisplayScale() {
            const w = shell.el.offsetWidth || 344;
            const textLen = (readoutEl.textContent || '0').length;
            let base = Math.max(22, Math.min(38, w * 0.095));
            if (textLen > 12) base = Math.max(16, base * (12 / textLen) * 1.08);
            if (errorState) base = Math.min(base, 18);
            readoutEl.style.fontSize = Math.round(base) + 'px';
        }

        function buildExprString(tokList, suffix = '') {
            let out = '';
            for (let i = 0; i < tokList.length; i++) {
                const t = tokList[i];
                if (t.type === 'num') {
                    out += t.label;
                } else if (t.type === 'op') {
                    out += ' ' + t.sym + ' ';
                } else if (t.type === 'lparen') {
                    out += '(';
                } else if (t.type === 'rparen') {
                    out += ')';
                }
            }
            return (out + suffix).trim();
        }

        function render(customExpr = null) {
            if (errorState) {
                readoutEl.textContent = errorState;
                readoutEl.classList.add('is-error');
            } else {
                readoutEl.classList.remove('is-error');
                if (isEntering) {
                    readoutEl.textContent = formatEnteringStr(currentStr);
                } else {
                    readoutEl.textContent = formatNumber(currentVal);
                }
            }

            if (customExpr !== null) {
                exprEl.textContent = customExpr;
            } else if (unaryApplied) {
                exprEl.textContent = buildExprString(tokens, (tokens.length && tokens[tokens.length - 1].type === 'op' ? ' ' : '') + unaryLabel);
            } else {
                exprEl.textContent = buildExprString(tokens);
            }

            clearBtn.textContent = (isEntering && currentStr !== '0') ? 'CE' : 'C';
            parenCountEl.textContent = openParens > 0 ? String(openParens) : '';
            angleBtn.textContent = angleUnit;
            feBtn.classList.toggle('active', feMode);
            secondBtn.classList.toggle('active', secondMode);
            memBadgeEl.classList.toggle('hidden', memory === null);
            memClearBtn.disabled = memory === null;
            memRecallBtn.disabled = memory === null;

            updateDisplayScale();
        }

        function clearErrorIfNeeded() {
            if (errorState) {
                errorState = null;
                tokens = [];
                currentStr = '0';
                currentVal = 0;
                isEntering = false;
                justEvaluated = false;
                unaryApplied = false;
                unaryLabel = '';
                openParens = 0;
            }
        }

        function applyBinary(a, b, op) {
            switch (op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/':
                    if (b === 0) return { err: 'Division durch Null nicht möglich' };
                    return a / b;
                case 'mod':
                    if (b === 0) return { err: 'Ungültige Eingabe' };
                    return a % b;
                case '^':
                    if (a === 0 && b < 0) return { err: 'Division durch Null nicht möglich' };
                    return Math.pow(a, b);
                case 'yroot':
                    if (b === 0) return { err: 'Ungültige Eingabe' };
                    if (a < 0) {
                        if (Number.isInteger(b) && Math.abs(b % 2) === 1) {
                            return -Math.pow(-a, 1 / b);
                        }
                        return { err: 'Ungültige Eingabe' };
                    }
                    return Math.pow(a, 1 / b);
                case 'logbase':
                    if (a <= 0 || b <= 0 || b === 1) return { err: 'Ungültige Eingabe' };
                    return Math.log(a) / Math.log(b);
                default:
                    return b;
            }
        }

        function precedence(op) {
            if (op === '+' || op === '-') return 1;
            if (op === '*' || op === '/' || op === 'mod') return 2;
            if (op === '^' || op === 'yroot' || op === 'logbase') return 3;
            return 0;
        }

        function isRightAssoc(op) {
            return op === '^';
        }

        function evaluateTokens(tokList) {
            const output = [];
            const ops = [];

            for (let i = 0; i < tokList.length; i++) {
                const t = tokList[i];
                if (t.type === 'num') {
                    output.push(t.val);
                } else if (t.type === 'op') {
                    while (ops.length > 0) {
                        const top = ops[ops.length - 1];
                        if (top.type === 'op' && (
                            precedence(top.op) > precedence(t.op) ||
                            (precedence(top.op) === precedence(t.op) && !isRightAssoc(t.op))
                        )) {
                            output.push(ops.pop());
                        } else {
                            break;
                        }
                    }
                    ops.push(t);
                } else if (t.type === 'lparen') {
                    ops.push(t);
                } else if (t.type === 'rparen') {
                    while (ops.length > 0 && ops[ops.length - 1].type !== 'lparen') {
                        output.push(ops.pop());
                    }
                    if (ops.length > 0 && ops[ops.length - 1].type === 'lparen') {
                        ops.pop();
                    }
                }
            }
            while (ops.length > 0) {
                const top = ops.pop();
                if (top.type !== 'lparen') output.push(top);
            }

            const stack = [];
            for (let i = 0; i < output.length; i++) {
                const item = output[i];
                if (typeof item === 'number') {
                    stack.push(item);
                } else if (item.type === 'op') {
                    const b = stack.pop();
                    const a = stack.pop();
                    if (a === undefined || b === undefined) return { err: 'Ungültige Eingabe' };
                    const res = applyBinary(a, b, item.op);
                    if (typeof res === 'object' && res.err) return res;
                    if (!Number.isFinite(res)) return { err: Number.isNaN(res) ? 'Ungültige Eingabe' : 'Überlauf' };
                    stack.push(cleanFloat(res));
                }
            }
            const finalVal = stack.length ? stack[stack.length - 1] : 0;
            if (!Number.isFinite(finalVal)) {
                return { err: Number.isNaN(finalVal) ? 'Ungültige Eingabe' : 'Überlauf' };
            }
            return { val: cleanFloat(finalVal) };
        }

        function currentToken() {
            if (unaryApplied) {
                return { type: 'num', val: currentVal, label: unaryLabel };
            }
            const val = isEntering ? parseFloat(currentStr) : currentVal;
            const safeVal = Number.isFinite(val) ? val : 0;
            return { type: 'num', val: safeVal, label: formatNumber(safeVal) };
        }

        function closePopovers() {
            trigPop.classList.add('hidden');
            funcPop.classList.add('hidden');
        }

        function updateSecondLabels() {
            shell.body.querySelectorAll('[data-lbl1][data-lbl2]').forEach(btn => {
                btn.innerHTML = secondMode ? btn.dataset.lbl2 : btn.dataset.lbl1;
            });
        }

        function updateTrigLabels() {
            shell.body.querySelectorAll('[data-trig-mod="2nd"]').forEach(b => b.classList.toggle('active', trigSecond));
            shell.body.querySelectorAll('[data-trig-mod="hyp"]').forEach(b => b.classList.toggle('active', trigHyp));
            const map = {
                sin: trigHyp ? (trigSecond ? 'sinh<sup>−1</sup>' : 'sinh') : (trigSecond ? 'sin<sup>−1</sup>' : 'sin'),
                cos: trigHyp ? (trigSecond ? 'cosh<sup>−1</sup>' : 'cosh') : (trigSecond ? 'cos<sup>−1</sup>' : 'cos'),
                tan: trigHyp ? (trigSecond ? 'tanh<sup>−1</sup>' : 'tanh') : (trigSecond ? 'tan<sup>−1</sup>' : 'tan'),
                sec: trigHyp ? (trigSecond ? 'sech<sup>−1</sup>' : 'sech') : (trigSecond ? 'sec<sup>−1</sup>' : 'sec'),
                csc: trigHyp ? (trigSecond ? 'csch<sup>−1</sup>' : 'csch') : (trigSecond ? 'csc<sup>−1</sup>' : 'csc'),
                cot: trigHyp ? (trigSecond ? 'coth<sup>−1</sup>' : 'coth') : (trigSecond ? 'cot<sup>−1</sup>' : 'cot')
            };
            shell.body.querySelectorAll('[data-trig-fn]').forEach(b => {
                b.innerHTML = map[b.dataset.trigFn] || b.dataset.trigFn;
            });
        }

        function renderHistory() {
            if (!history.length) {
                histListEl.innerHTML = '<div class="cw-calc-hist-empty">Noch keine Berechnungen</div>';
                return;
            }
            histListEl.innerHTML = '';
            history.forEach((item) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'cw-calc-hist-item';
                row.innerHTML = `
                    <span class="cw-calc-hist-expr">${item.expr}</span>
                    <strong class="cw-calc-hist-res">${item.resultText}</strong>
                `;
                row.addEventListener('click', () => {
                    clearErrorIfNeeded();
                    currentVal = item.result;
                    currentStr = String(item.result);
                    isEntering = false;
                    unaryApplied = false;
                    unaryLabel = '';
                    justEvaluated = false;
                    histOverlay.classList.add('hidden');
                    render();
                });
                histListEl.appendChild(row);
            });
        }

        // --- Eingabe-Handler ---
        function inputDigit(d) {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            if (tokens.length > 0 && tokens[tokens.length - 1].type === 'rparen') {
                tokens.push({ type: 'op', op: '*', sym: '×' });
            }
            if (!isEntering || unaryApplied) {
                currentStr = d;
                isEntering = true;
                unaryApplied = false;
                unaryLabel = '';
            } else if (currentStr.includes('e')) {
                const [mant, expPart] = currentStr.split('e');
                const sign = expPart[0];
                let digits = expPart.slice(1);
                if (digits === '0') digits = d;
                else if (digits.length < 3) digits += d;
                currentStr = `${mant}e${sign}${digits}`;
            } else {
                const rawDigits = currentStr.replace(/[^0-9]/g, '');
                if (rawDigits.length >= 16) return;
                if (currentStr === '0') currentStr = d;
                else if (currentStr === '-0') currentStr = '-' + d;
                else currentStr += d;
            }
            currentVal = parseFloat(currentStr);
            render();
        }

        function inputDecimal() {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            if (!isEntering || unaryApplied) {
                currentStr = '0.';
                isEntering = true;
                unaryApplied = false;
                unaryLabel = '';
            } else if (!currentStr.includes('.') && !currentStr.includes('e')) {
                currentStr += '.';
            }
            currentVal = parseFloat(currentStr);
            render();
        }

        function inputExp() {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            if (!isEntering || unaryApplied) {
                currentStr = String(cleanFloat(currentVal));
                if (currentStr.includes('e')) return;
                isEntering = true;
                unaryApplied = false;
                unaryLabel = '';
            }
            if (!currentStr.includes('e')) {
                if (!currentStr.includes('.')) currentStr += '.';
                currentStr += 'e+0';
            }
            currentVal = parseFloat(currentStr);
            render();
        }

        function inputNegate() {
            clearErrorIfNeeded();
            if (isEntering && currentStr.includes('e')) {
                const [mant, expPart] = currentStr.split('e');
                const newSign = expPart[0] === '+' ? '-' : '+';
                currentStr = `${mant}e${newSign}${expPart.slice(1)}`;
                currentVal = parseFloat(currentStr);
                render();
                return;
            }
            if (isEntering) {
                if (currentStr === '0') return;
                currentStr = currentStr.startsWith('-') ? currentStr.slice(1) : '-' + currentStr;
                currentVal = parseFloat(currentStr);
            } else {
                currentVal = cleanFloat(-currentVal);
                currentStr = String(currentVal);
                if (unaryApplied) {
                    unaryLabel = `negate(${unaryLabel})`;
                }
            }
            render();
        }

        function inputBackspace() {
            if (errorState) {
                clearErrorIfNeeded();
                render();
                return;
            }
            if (!isEntering) return;
            if (currentStr.includes('e')) {
                const [mant, expPart] = currentStr.split('e');
                const sign = expPart[0];
                const digits = expPart.slice(1);
                if (digits.length > 1) {
                    currentStr = `${mant}e${sign}${digits.slice(0, -1)}`;
                } else if (digits !== '0') {
                    currentStr = `${mant}e${sign}0`;
                } else {
                    currentStr = mant.endsWith('.') ? mant.slice(0, -1) : mant;
                }
            } else {
                currentStr = currentStr.slice(0, -1);
                if (currentStr === '' || currentStr === '-') currentStr = '0';
            }
            currentVal = parseFloat(currentStr);
            render();
        }

        function inputClear(forceAll = false) {
            if (!forceAll && isEntering && currentStr !== '0' && !errorState) {
                // CE: nur aktuelle Eingabe löschen
                currentStr = '0';
                currentVal = 0;
                isEntering = false;
                unaryApplied = false;
                unaryLabel = '';
                render();
                return;
            }
            tokens = [];
            currentStr = '0';
            currentVal = 0;
            isEntering = false;
            justEvaluated = false;
            unaryApplied = false;
            unaryLabel = '';
            errorState = null;
            openParens = 0;
            lastBinaryOp = null;
            render();
        }

        function inputConstant(kind) {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            if (tokens.length > 0 && tokens[tokens.length - 1].type === 'rparen') {
                tokens.push({ type: 'op', op: '*', sym: '×' });
            }
            if (kind === 'pi') {
                currentVal = Math.PI;
                unaryLabel = 'π';
            } else if (kind === 'e') {
                currentVal = Math.E;
                unaryLabel = 'e';
            } else if (kind === 'rand') {
                currentVal = cleanFloat(Math.random());
                unaryLabel = formatNumber(currentVal);
            }
            currentStr = String(currentVal);
            isEntering = false;
            unaryApplied = true;
            render();
        }

        function inputOperator(op, sym) {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            const last = tokens[tokens.length - 1];
            if (last && last.type === 'op' && !isEntering && !unaryApplied) {
                // Vorherigen Operator ersetzen
                tokens[tokens.length - 1] = { type: 'op', op, sym };
                render();
                return;
            }
            if (!last || last.type !== 'rparen') {
                tokens.push(currentToken());
            }
            tokens.push({ type: 'op', op, sym });
            isEntering = false;
            unaryApplied = false;
            unaryLabel = '';
            render();
        }

        function inputLParen() {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            const last = tokens[tokens.length - 1];
            if (isEntering || unaryApplied) {
                tokens.push(currentToken());
                tokens.push({ type: 'op', op: '*', sym: '×' });
                isEntering = false;
                unaryApplied = false;
                unaryLabel = '';
            } else if (last && last.type === 'rparen') {
                tokens.push({ type: 'op', op: '*', sym: '×' });
            }
            tokens.push({ type: 'lparen' });
            openParens++;
            currentStr = '0';
            currentVal = 0;
            render();
        }

        function inputRParen() {
            clearErrorIfNeeded();
            if (openParens <= 0) return;
            const last = tokens[tokens.length - 1];
            if (!last || last.type === 'op' || last.type === 'lparen' || isEntering || unaryApplied) {
                tokens.push(currentToken());
            }
            tokens.push({ type: 'rparen' });
            openParens--;
            isEntering = false;
            unaryApplied = false;
            unaryLabel = '';

            // Teilausdruck der gerade geschlossenen Klammer auswerten
            let depth = 0;
            let startIdx = tokens.length - 1;
            for (let i = tokens.length - 1; i >= 0; i--) {
                if (tokens[i].type === 'rparen') depth++;
                else if (tokens[i].type === 'lparen') {
                    depth--;
                    if (depth === 0) {
                        startIdx = i;
                        break;
                    }
                }
            }
            const subRes = evaluateTokens(tokens.slice(startIdx));
            if (subRes.err) {
                errorState = subRes.err;
            } else {
                currentVal = subRes.val;
                currentStr = String(subRes.val);
            }
            render();
        }

        function computeUnary(fn, x) {
            const snapZero = (v) => (Math.abs(v) < 1e-15 ? 0 : v);
            switch (fn) {
                case 'sqr': return { val: x * x, lbl: (s) => `sqr(${s})` };
                case 'cube': return { val: x * x * x, lbl: (s) => `cube(${s})` };
                case 'inv':
                    if (x === 0) return { err: 'Division durch Null nicht möglich' };
                    return { val: 1 / x, lbl: (s) => `1/(${s})` };
                case 'abs': return { val: Math.abs(x), lbl: (s) => `abs(${s})` };
                case 'sqrt':
                    if (x < 0) return { err: 'Ungültige Eingabe' };
                    return { val: Math.sqrt(x), lbl: (s) => `√(${s})` };
                case 'cbrt': return { val: Math.cbrt(x), lbl: (s) => `cuberoot(${s})` };
                case 'fact': {
                    const r = factorial(x);
                    if (Number.isNaN(r)) return { err: 'Ungültige Eingabe' };
                    if (!Number.isFinite(r)) return { err: 'Überlauf' };
                    return { val: r, lbl: (s) => `fact(${s})` };
                }
                case 'pow10': return { val: Math.pow(10, x), lbl: (s) => `10^(${s})` };
                case 'pow2': return { val: Math.pow(2, x), lbl: (s) => `2^(${s})` };
                case 'expE': return { val: Math.exp(x), lbl: (s) => `e^(${s})` };
                case 'log10':
                    if (x <= 0) return { err: 'Ungültige Eingabe' };
                    return { val: Math.log10(x), lbl: (s) => `log(${s})` };
                case 'ln':
                    if (x <= 0) return { err: 'Ungültige Eingabe' };
                    return { val: Math.log(x), lbl: (s) => `ln(${s})` };
                case 'floor': return { val: Math.floor(x), lbl: (s) => `floor(${s})` };
                case 'ceil': return { val: Math.ceil(x), lbl: (s) => `ceil(${s})` };
                case 'dms': {
                    const sign = x < 0 ? -1 : 1;
                    const ax = Math.abs(x);
                    const d = Math.floor(ax);
                    const mFull = (ax - d) * 60;
                    const m = Math.floor(mFull);
                    const sec = (mFull - m) * 60;
                    return { val: sign * (d + m / 100 + sec / 10000), lbl: (s) => `dms(${s})` };
                }
                case 'deg': {
                    const sign = x < 0 ? -1 : 1;
                    const ax = Math.abs(x);
                    const d = Math.floor(ax);
                    const m = Math.floor((ax - d) * 100 + 1e-12);
                    const sec = ((ax - d) * 100 - m) * 100;
                    return { val: sign * (d + m / 60 + sec / 3600), lbl: (s) => `deg(${s})` };
                }
                // Trigonometrie
                case 'sin': return { val: snapZero(Math.sin(toRad(x))), lbl: (s) => `sin(${s})` };
                case 'cos': return { val: snapZero(Math.cos(toRad(x))), lbl: (s) => `cos(${s})` };
                case 'tan': {
                    const c = Math.cos(toRad(x));
                    if (Math.abs(c) < 1e-15) return { err: 'Ungültige Eingabe' };
                    return { val: snapZero(Math.sin(toRad(x)) / c), lbl: (s) => `tan(${s})` };
                }
                case 'sec': {
                    const c = Math.cos(toRad(x));
                    if (Math.abs(c) < 1e-15) return { err: 'Ungültige Eingabe' };
                    return { val: 1 / c, lbl: (s) => `sec(${s})` };
                }
                case 'csc': {
                    const sn = Math.sin(toRad(x));
                    if (Math.abs(sn) < 1e-15) return { err: 'Ungültige Eingabe' };
                    return { val: 1 / sn, lbl: (s) => `csc(${s})` };
                }
                case 'cot': {
                    const sn = Math.sin(toRad(x));
                    if (Math.abs(sn) < 1e-15) return { err: 'Ungültige Eingabe' };
                    return { val: snapZero(Math.cos(toRad(x)) / sn), lbl: (s) => `cot(${s})` };
                }
                case 'asin':
                    if (x < -1 || x > 1) return { err: 'Ungültige Eingabe' };
                    return { val: fromRad(Math.asin(x)), lbl: (s) => `sin⁻¹(${s})` };
                case 'acos':
                    if (x < -1 || x > 1) return { err: 'Ungültige Eingabe' };
                    return { val: fromRad(Math.acos(x)), lbl: (s) => `cos⁻¹(${s})` };
                case 'atan':
                    return { val: fromRad(Math.atan(x)), lbl: (s) => `tan⁻¹(${s})` };
                case 'asec':
                    if (Math.abs(x) < 1) return { err: 'Ungültige Eingabe' };
                    return { val: fromRad(Math.acos(1 / x)), lbl: (s) => `sec⁻¹(${s})` };
                case 'acsc':
                    if (Math.abs(x) < 1) return { err: 'Ungültige Eingabe' };
                    return { val: fromRad(Math.asin(1 / x)), lbl: (s) => `csc⁻¹(${s})` };
                case 'acot':
                    return { val: fromRad(x === 0 ? Math.PI / 2 : Math.atan(1 / x)), lbl: (s) => `cot⁻¹(${s})` };
                // Hyperbolisch
                case 'sinh': return { val: Math.sinh(x), lbl: (s) => `sinh(${s})` };
                case 'cosh': return { val: Math.cosh(x), lbl: (s) => `cosh(${s})` };
                case 'tanh': return { val: Math.tanh(x), lbl: (s) => `tanh(${s})` };
                case 'sech': return { val: 1 / Math.cosh(x), lbl: (s) => `sech(${s})` };
                case 'csch':
                    if (x === 0) return { err: 'Division durch Null nicht möglich' };
                    return { val: 1 / Math.sinh(x), lbl: (s) => `csch(${s})` };
                case 'coth':
                    if (x === 0) return { err: 'Division durch Null nicht möglich' };
                    return { val: Math.cosh(x) / Math.sinh(x), lbl: (s) => `coth(${s})` };
                case 'asinh': return { val: Math.asinh(x), lbl: (s) => `sinh⁻¹(${s})` };
                case 'acosh':
                    if (x < 1) return { err: 'Ungültige Eingabe' };
                    return { val: Math.acosh(x), lbl: (s) => `cosh⁻¹(${s})` };
                case 'atanh':
                    if (x <= -1 || x >= 1) return { err: 'Ungültige Eingabe' };
                    return { val: Math.atanh(x), lbl: (s) => `tanh⁻¹(${s})` };
                case 'asech':
                    if (x <= 0 || x > 1) return { err: 'Ungültige Eingabe' };
                    return { val: Math.acosh(1 / x), lbl: (s) => `sech⁻¹(${s})` };
                case 'acsch':
                    if (x === 0) return { err: 'Ungültige Eingabe' };
                    return { val: Math.asinh(1 / x), lbl: (s) => `csch⁻¹(${s})` };
                case 'acoth':
                    if (x >= -1 && x <= 1) return { err: 'Ungültige Eingabe' };
                    return { val: 0.5 * Math.log((x + 1) / (x - 1)), lbl: (s) => `coth⁻¹(${s})` };
                default:
                    return { val: x, lbl: (s) => s };
            }
        }

        function inputUnary(fn) {
            clearErrorIfNeeded();
            if (justEvaluated) {
                tokens = [];
                openParens = 0;
                justEvaluated = false;
            }
            let baseVal = isEntering ? parseFloat(currentStr) : currentVal;
            let baseLabel = unaryApplied ? unaryLabel : formatNumber(baseVal);

            // Falls gerade eine Klammer geschlossen wurde, diese als Basis einpacken
            if (tokens.length > 0 && tokens[tokens.length - 1].type === 'rparen' && !isEntering && !unaryApplied) {
                let depth = 0;
                let startIdx = tokens.length - 1;
                for (let i = tokens.length - 1; i >= 0; i--) {
                    if (tokens[i].type === 'rparen') depth++;
                    else if (tokens[i].type === 'lparen') {
                        depth--;
                        if (depth === 0) {
                            startIdx = i;
                            break;
                        }
                    }
                }
                const group = tokens.splice(startIdx);
                baseLabel = buildExprString(group);
            }

            const res = computeUnary(fn, baseVal);
            if (res.err) {
                errorState = res.err;
                render();
                return;
            }
            if (!Number.isFinite(res.val)) {
                errorState = Number.isNaN(res.val) ? 'Ungültige Eingabe' : 'Überlauf';
                render();
                return;
            }
            currentVal = cleanFloat(res.val);
            currentStr = String(currentVal);
            isEntering = false;
            unaryApplied = true;
            unaryLabel = res.lbl(baseLabel);
            render();
        }

        function inputEquals() {
            if (errorState) {
                clearErrorIfNeeded();
                render();
                return;
            }

            // Wiederholtes '=' (wie im Windows-Rechner)
            if (justEvaluated && lastBinaryOp && tokens.length === 0) {
                const exprToks = [
                    { type: 'num', val: currentVal, label: formatNumber(currentVal) },
                    { type: 'op', op: lastBinaryOp.op, sym: lastBinaryOp.sym },
                    { type: 'num', val: lastBinaryOp.rightVal, label: formatNumber(lastBinaryOp.rightVal) }
                ];
                const fullExpr = buildExprString(exprToks, ' =');
                const evalRes = evaluateTokens(exprToks);
                if (evalRes.err) {
                    errorState = evalRes.err;
                    render(fullExpr);
                    return;
                }
                currentVal = evalRes.val;
                currentStr = String(evalRes.val);
                history.unshift({ expr: fullExpr, result: currentVal, resultText: formatNumber(currentVal) });
                if (history.length > 25) history.pop();
                renderHistory();
                render(fullExpr);
                return;
            }

            const evalTokens = tokens.slice();
            const last = evalTokens[evalTokens.length - 1];
            if (!last || last.type === 'op' || last.type === 'lparen' || isEntering || unaryApplied) {
                evalTokens.push(currentToken());
            }
            for (let i = 0; i < openParens; i++) {
                evalTokens.push({ type: 'rparen' });
            }

            // Letzten binären Operator für wiederholtes '=' merken
            lastBinaryOp = null;
            for (let i = evalTokens.length - 1; i >= 1; i--) {
                if (evalTokens[i].type === 'num' && evalTokens[i - 1].type === 'op') {
                    lastBinaryOp = {
                        op: evalTokens[i - 1].op,
                        sym: evalTokens[i - 1].sym,
                        rightVal: evalTokens[i].val
                    };
                    break;
                }
            }

            const fullExpr = buildExprString(evalTokens, ' =');
            const evalRes = evaluateTokens(evalTokens);
            tokens = [];
            openParens = 0;
            isEntering = false;
            unaryApplied = false;
            unaryLabel = '';

            if (evalRes.err) {
                errorState = evalRes.err;
                justEvaluated = false;
                render(fullExpr);
                return;
            }

            currentVal = evalRes.val;
            currentStr = String(evalRes.val);
            justEvaluated = true;

            history.unshift({ expr: fullExpr, result: currentVal, resultText: formatNumber(currentVal) });
            if (history.length > 25) history.pop();
            renderHistory();
            render(fullExpr);
        }

        // --- Button-Events ---
        shell.body.addEventListener('click', (e) => {
            const uiBtn = e.target.closest('[data-calc-ui]');
            if (uiBtn) {
                const ui = uiBtn.dataset.calcUi;
                if (ui === 'angle') {
                    angleUnit = angleUnit === 'DEG' ? 'RAD' : (angleUnit === 'RAD' ? 'GRAD' : 'DEG');
                    render();
                } else if (ui === 'fe') {
                    feMode = !feMode;
                    render();
                } else if (ui === '2nd') {
                    secondMode = !secondMode;
                    updateSecondLabels();
                    render();
                } else if (ui === 'trig-menu') {
                    const wasHidden = trigPop.classList.contains('hidden');
                    closePopovers();
                    if (wasHidden) trigPop.classList.remove('hidden');
                } else if (ui === 'func-menu') {
                    const wasHidden = funcPop.classList.contains('hidden');
                    closePopovers();
                    if (wasHidden) funcPop.classList.remove('hidden');
                } else if (ui === 'history') {
                    closePopovers();
                    renderHistory();
                    histOverlay.classList.toggle('hidden');
                }
                return;
            }

            const trigMod = e.target.closest('[data-trig-mod]');
            if (trigMod) {
                if (trigMod.dataset.trigMod === '2nd') trigSecond = !trigSecond;
                else if (trigMod.dataset.trigMod === 'hyp') trigHyp = !trigHyp;
                updateTrigLabels();
                return;
            }

            const trigFnBtn = e.target.closest('[data-trig-fn]');
            if (trigFnBtn) {
                const base = trigFnBtn.dataset.trigFn;
                const fnName = (trigSecond ? 'a' : '') + base + (trigHyp ? 'h' : '');
                closePopovers();
                inputUnary(fnName);
                return;
            }

            const memBtn = e.target.closest('[data-mem]');
            if (memBtn) {
                closePopovers();
                const mAct = memBtn.dataset.mem;
                const val = isEntering ? parseFloat(currentStr) : currentVal;
                if (mAct === 'MC') {
                    memory = null;
                } else if (mAct === 'MR' && memory !== null) {
                    clearErrorIfNeeded();
                    currentVal = memory;
                    currentStr = String(memory);
                    isEntering = false;
                    unaryApplied = false;
                    unaryLabel = '';
                } else if (mAct === 'MS' && Number.isFinite(val)) {
                    memory = cleanFloat(val);
                    isEntering = false;
                } else if (mAct === 'M+' && Number.isFinite(val)) {
                    memory = cleanFloat((memory || 0) + val);
                    isEntering = false;
                } else if (mAct === 'M-' && Number.isFinite(val)) {
                    memory = cleanFloat((memory || 0) - val);
                    isEntering = false;
                }
                render();
                return;
            }

            const actBtn = e.target.closest('[data-calc-act]');
            if (actBtn) {
                closePopovers();
                const act = actBtn.dataset.calcAct;
                if (act === 'digit') inputDigit(actBtn.dataset.val);
                else if (act === 'decimal') inputDecimal();
                else if (act === 'exp') inputExp();
                else if (act === 'negate') inputNegate();
                else if (act === 'backspace') inputBackspace();
                else if (act === 'clear') inputClear(false);
                else if (act === 'const') inputConstant(actBtn.dataset.val);
                else if (act === 'lparen') inputLParen();
                else if (act === 'rparen') inputRParen();
                else if (act === 'equals') inputEquals();
                else if (act === 'op') {
                    const useOp = (secondMode && actBtn.dataset.op2) ? actBtn.dataset.op2 : actBtn.dataset.op;
                    const useSym = (secondMode && actBtn.dataset.sym2) ? actBtn.dataset.sym2 : actBtn.dataset.sym;
                    inputOperator(useOp, useSym);
                } else if (act === 'unary') {
                    if (secondMode && actBtn.dataset.op2) {
                        inputOperator(actBtn.dataset.op2, actBtn.dataset.sym2);
                    } else {
                        const useFn = (secondMode && actBtn.dataset.fn2) ? actBtn.dataset.fn2 : actBtn.dataset.fn;
                        inputUnary(useFn);
                    }
                }
                return;
            }

            if (e.target.closest('.cw-calc-hist-close')) {
                histOverlay.classList.add('hidden');
                return;
            }
            if (e.target.closest('.cw-calc-hist-clear')) {
                history = [];
                renderHistory();
                return;
            }

            // Klick außerhalb eines Popovers schließt offene Popovers
            if (!e.target.closest('.cw-calc-drop-wrap')) {
                closePopovers();
            }
        });

        // Tastatur-Bedienung, wenn das Taschenrechner-Widget fokussiert ist
        shell.el.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            if (k >= '0' && k <= '9') {
                e.preventDefault(); e.stopPropagation();
                inputDigit(k);
            } else if (k === ',' || k === '.') {
                e.preventDefault(); e.stopPropagation();
                inputDecimal();
            } else if (k === '+') {
                e.preventDefault(); e.stopPropagation();
                inputOperator('+', '+');
            } else if (k === '-') {
                e.preventDefault(); e.stopPropagation();
                inputOperator('-', '−');
            } else if (k === '*') {
                e.preventDefault(); e.stopPropagation();
                inputOperator('*', '×');
            } else if (k === '/') {
                e.preventDefault(); e.stopPropagation();
                inputOperator('/', '÷');
            } else if (k === '^') {
                e.preventDefault(); e.stopPropagation();
                inputOperator('^', '^');
            } else if (k === '(') {
                e.preventDefault(); e.stopPropagation();
                inputLParen();
            } else if (k === ')') {
                e.preventDefault(); e.stopPropagation();
                inputRParen();
            } else if (k === 'Enter' || k === '=') {
                e.preventDefault(); e.stopPropagation();
                inputEquals();
            } else if (k === 'Backspace') {
                e.preventDefault(); e.stopPropagation();
                inputBackspace();
            } else if (k === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                inputClear(true);
            } else if (k === 'Delete') {
                e.preventDefault(); e.stopPropagation();
                inputClear(false);
            }
        });

        updateTrigLabels();
        render();
    }

    // =========================================================================
    // WIDGET-MENÜ IN DER OBEREN LEISTE INITIALISIEREN
    // =========================================================================
    function initWidgetsUI() {
        const toggleBtn = document.getElementById('btn-toggle-widgets');
        const popover = document.getElementById('widget-menu-popover');
        if (!toggleBtn || !popover) return;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popover.classList.toggle('hidden');
            toggleBtn.classList.toggle('active', !popover.classList.contains('hidden'));
        });

        popover.addEventListener('pointerdown', (e) => e.stopPropagation());

        popover.querySelectorAll('[data-spawn-widget]').forEach(btn => {
            btn.addEventListener('click', () => {
                const kind = btn.dataset.spawnWidget;
                popover.classList.add('hidden');
                toggleBtn.classList.remove('active');
                if (kind === 'clock') spawnClockTimerWidget('clock');
                else if (kind === 'stopwatch') spawnClockTimerWidget('stopwatch');
                else if (kind === 'timer') spawnClockTimerWidget('timer');
                else if (kind === 'ampel') spawnTrafficLightWidget();
                else if (kind === 'random') spawnRandomNumberWidget();
                else if (kind === 'calculator') spawnCalculatorWidget();
            });
        });

        document.addEventListener('click', (e) => {
            if (!popover.classList.contains('hidden') &&
                !popover.contains(e.target) &&
                !toggleBtn.contains(e.target)) {
                popover.classList.add('hidden');
                toggleBtn.classList.remove('active');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initWidgetsUI);

    window.WebNotesWidgets = {
        spawnClockTimerWidget,
        spawnTrafficLightWidget,
        spawnRandomNumberWidget,
        spawnCalculatorWidget
    };
})();

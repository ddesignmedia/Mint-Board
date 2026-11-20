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
        spawnRandomNumberWidget
    };
})();

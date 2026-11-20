/**
 * WebNotes – Chemix-Stil Labor-Baukasten (lab.js)
 * 100% DSGVO-konform & offline-fähig: Alle Laborgeräte werden als gestochen scharfe
 * Canvas-2D-Vektorgrafiken gezeichnet (inkl. waagerechter Schwerkraft-Flüssigkeit beim Kippen,
 * automatischem Flüssigkeits-Ausguss, Dampf/Rauch, Gasblasen, Stopfen & Bunsenbrenner-Flamme).
 */
(() => {
    'use strict';

    // =========================================================================
    // 1. GERÄTE-KATALOG (KATEGORIEN, STANDARDGRÖSSEN & FÄHIGKEITEN)
    // =========================================================================
    const LAB_CATEGORIES = [
        { id: 'vessels',   label: 'Gefäße' },
        { id: 'heating',   label: 'Heizen & Stativ' },
        { id: 'tools',     label: 'Zubehör & Messen' }
    ];

    const LAB_LIQUID_PRESETS = [
        { color: '#38bdf8', name: 'Wasser / Hellblau' },
        { color: '#2563eb', name: 'Kupfersulfat (Blau)' },
        { color: '#ef4444', name: 'Säure / Indikator (Rot)' },
        { color: '#a855f7', name: 'Lauge / Phenolphthalein' },
        { color: '#22c55e', name: 'Nickelsalz / Neutral (Grün)' },
        { color: '#eab308', name: 'Chromat / Schwefel (Gelb)' },
        { color: '#f97316', name: 'Dichromat / Orange' },
        { color: '#92400e', name: 'Iod / Braun' },
        { color: '#e2e8f0', name: 'Farblos / Milchig' },
        { color: '#334155', name: 'Dunkel / Kohle' }
    ];

    const LAB_CATALOG = [
        // --- GEFÄSSE ---
        {
            type: 'beaker', name: 'Becherglas', category: 'vessels',
            w: 148, h: 175, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: false, hasLabel: true,
            defaultFill: 0.45, defaultColor: '#38bdf8'
        },
        {
            type: 'erlenmeyer', name: 'Erlenmeyerkolben', category: 'vessels',
            w: 155, h: 200, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: true, hasLabel: true,
            defaultFill: 0.42, defaultColor: '#22c55e'
        },
        {
            type: 'test_tube', name: 'Reagenzglas', category: 'vessels',
            w: 56, h: 210, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: true, hasLabel: true,
            defaultFill: 0.40, defaultColor: '#ef4444'
        },
        {
            type: 'round_flask', name: 'Rundkolben', category: 'vessels',
            w: 155, h: 205, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: true, hasLabel: true,
            defaultFill: 0.40, defaultColor: '#a855f7'
        },
        {
            type: 'graduated_cylinder', name: 'Messzylinder', category: 'vessels',
            w: 76, h: 220, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: false, hasLabel: true,
            defaultFill: 0.55, defaultColor: '#38bdf8'
        },
        {
            type: 'funnel', name: 'Trichter', category: 'vessels',
            w: 118, h: 160, hasLiquid: true, canPour: false, hasEffects: false, hasStopper: false, hasLabel: false,
            defaultFill: 0.35, defaultColor: '#38bdf8'
        },
        {
            type: 'pipette', name: 'Tropfpipette', category: 'vessels',
            w: 44, h: 185, hasLiquid: true, canPour: false, hasEffects: false, hasStopper: false, hasLabel: false,
            defaultFill: 0.45, defaultColor: '#ef4444'
        },
        {
            type: 'burette', name: 'Bürette', category: 'vessels',
            w: 58, h: 260, hasLiquid: true, canPour: false, hasEffects: false, hasStopper: false, hasLabel: false,
            defaultFill: 0.65, defaultColor: '#38bdf8'
        },
        {
            type: 'evaporating_dish', name: 'Abdampfschale', category: 'vessels',
            w: 150, h: 76, hasLiquid: true, canPour: true, hasEffects: true, hasStopper: false, hasLabel: true,
            defaultFill: 0.50, defaultColor: '#38bdf8'
        },
        {
            type: 'watch_glass', name: 'Uhrglas', category: 'vessels',
            w: 140, h: 48, hasLiquid: true, canPour: false, hasEffects: true, hasStopper: false, hasLabel: true,
            defaultFill: 0.45, defaultColor: '#eab308'
        },
        {
            type: 'wash_bottle', name: 'Spritzflasche', category: 'vessels',
            w: 120, h: 205, hasLiquid: true, canPour: false, hasEffects: false, hasStopper: false, hasLabel: true,
            defaultFill: 0.60, defaultColor: '#38bdf8', defaultLabel: 'H₂O'
        },

        // --- HEIZEN & STATIV ---
        {
            type: 'bunsen_burner', name: 'Bunsenbrenner', category: 'heating',
            w: 110, h: 215, hasLiquid: false, canPour: false, hasEffects: false, hasFlame: true, hasLabel: false,
            defaultFlame: 'blue'
        },
        {
            type: 'tripod', name: 'Dreifuß + Netz', category: 'heating',
            w: 175, h: 170, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: false
        },
        {
            type: 'retort_stand', name: 'Stativ', category: 'heating',
            w: 185, h: 360, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: false
        },
        {
            type: 'clamp', name: 'Stativklammer', category: 'heating',
            w: 145, h: 48, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: false
        },
        {
            type: 'test_tube_rack', name: 'RG-Ständer', category: 'heating',
            w: 220, h: 120, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: false
        },

        // --- ZUBEHÖR & MESSEN ---
        {
            type: 'thermometer', name: 'Thermometer', category: 'tools',
            w: 38, h: 225, hasLiquid: true, canPour: false, hasEffects: false, hasLabel: false,
            defaultFill: 0.55, defaultColor: '#ef4444'
        },
        {
            type: 'glass_tube_90', name: 'Glasrohr 90°', category: 'tools',
            w: 145, h: 135, hasLiquid: false, canPour: false, hasEffects: true, hasLabel: false
        },
        {
            type: 'stirring_rod', name: 'Glasstab', category: 'tools',
            w: 22, h: 210, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: false
        },
        {
            type: 'solid_powder', name: 'Feststoff / Salz', category: 'tools',
            w: 115, h: 64, hasLiquid: true, canPour: false, hasEffects: true, hasLabel: true,
            defaultFill: 0.70, defaultColor: '#eab308'
        },
        {
            type: 'scale', name: 'Digitalwaage', category: 'tools',
            w: 195, h: 105, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: true,
            defaultLabel: '12.5 g'
        },
        {
            type: 'power_supply', name: 'Netzgerät', category: 'tools',
            w: 175, h: 125, hasLiquid: false, canPour: false, hasEffects: false, hasLabel: true,
            defaultLabel: '6.0 V'
        },
        {
            type: 'hotplate', name: 'Herdplatte', category: 'tools',
            w: 195, h: 108, hasLiquid: false, canPour: false, hasEffects: false, hasFlame: true, hasLabel: true,
            defaultFlame: 'yellow', defaultLabel: ''
        }
    ];

    const CATALOG_BY_TYPE = {};
    LAB_CATALOG.forEach(item => { CATALOG_BY_TYPE[item.type] = item; });

    // =========================================================================
    // 2. GEOMETRIE- & HILFSFUNKTIONEN FÜR FLÜSSIGKEIT, AUSGUSS & EFFEKTE
    // =========================================================================
    function hexToRgba(hex, alpha) {
        if (!hex || typeof hex !== 'string') return `rgba(56,189,248,${alpha})`;
        let c = hex.replace('#', '').trim();
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        const num = parseInt(c, 16);
        if (Number.isNaN(num)) return `rgba(56,189,248,${alpha})`;
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function normalizeAngle(rad) {
        let a = rad % (Math.PI * 2);
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    function localToWorld(item, lx, ly) {
        const cx = item.x + item.w * 0.5;
        const cy = item.y + item.h * 0.5;
        const sx = item.flipX ? -lx : lx;
        const rot = item.rotation || 0;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        return {
            x: cx + sx * cos - ly * sin,
            y: cy + sx * sin + ly * cos
        };
    }

    /**
     * Zeichnet waagerechte Flüssigkeit in Schwerkraftrichtung innerhalb eines Gefäß-Clip-Pfades.
     * Funktioniert bei jedem Kippwinkel (0°..360°) und jeder Spiegelung!
     * Gibt die berechnete relative Welt-Y-Position der Flüssigkeitsoberfläche zurück (für exakte Ausguss-Physik).
     */
    function drawGravityLiquidInClip(ctx, item, clipPathFn, samplePts, spoutLeft = null, spoutRight = null) {
        const fill = Math.max(0, Math.min(1, item.fillLevel ?? 0));
        if (fill <= 0.01) return null;

        const rot = item.rotation || 0;
        const flipSign = item.flipX ? -1 : 1;
        const color = item.liquidColor || '#38bdf8';

        // Bestimme min/max Welt-Y der Innenraum-Stützpunkte (relative Projektion auf Schwerkraft)
        const sinR = Math.sin(rot);
        const cosR = Math.cos(rot);
        let minWY = Infinity;
        let maxWY = -Infinity;
        for (let i = 0; i < samplePts.length; i++) {
            const lx = samplePts[i][0] * flipSign;
            const ly = samplePts[i][1];
            const wy = lx * sinR + ly * cosR;
            if (wy < minWY) minWY = wy;
            if (wy > maxWY) maxWY = wy;
        }
        let surfaceWY = maxWY - fill * (maxWY - minWY);

        // Physikalisches Clamping beim Ausgießen: Bei offenem, gekipptem Gefäß steigt der Pegel
        // nicht über die tiefere Ausgusskante hinaus, sondern liegt bündig am Ausgießer an.
        if (spoutLeft && spoutRight && !item.stopper && item.pourOverride !== 'off') {
            const deg = (normalizeAngle(rot) * 180) / Math.PI;
            if (Math.abs(deg) >= 12) {
                const wyL = (spoutLeft[0] * flipSign) * sinR + spoutLeft[1] * cosR;
                const wyR = (spoutRight[0] * flipSign) * sinR + spoutRight[1] * cosR;
                const lowerSpoutWY = Math.max(wyL, wyR);
                if (surfaceWY < lowerSpoutWY - 1) {
                    surfaceWY = lowerSpoutWY - 1;
                }
            }
        }

        const extent = Math.hypot(item.w, item.h) + 60;

        ctx.save();
        clipPathFn(ctx);
        ctx.clip();

        // Zurückdrehen in Welt-Ausrichtung (Y zeigt strikt nach unten = Schwerkraft!)
        if (item.flipX) ctx.scale(-1, 1);
        ctx.rotate(-rot);

        // Hauptflüssigkeit (halbtransparent wie Glasflüssigkeit)
        const grad = ctx.createLinearGradient(0, surfaceWY, 0, maxWY + 10);
        grad.addColorStop(0, hexToRgba(color, 0.72));
        grad.addColorStop(1, hexToRgba(color, 0.88));
        ctx.fillStyle = grad;
        ctx.fillRect(-extent, surfaceWY, extent * 2, extent * 2);

        // Meniskus / Oberflächenglanz
        ctx.strokeStyle = hexToRgba(color, 0.96);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-extent, surfaceWY);
        ctx.lineTo(extent, surfaceWY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-extent, surfaceWY + 2.5);
        ctx.lineTo(extent, surfaceWY + 2.5);
        ctx.stroke();

        // Gasblasen / Sprudeln in der Flüssigkeit
        if (item.effect === 'bubbles' || item.effect === 'steam_bubbles') {
            const liquidH = Math.max(12, maxWY - surfaceWY);
            const spread = Math.min(item.w, item.h) * 0.34;
            const bubbleSeeds = [
                [-0.45, 0.18, 3.5], [0.22, 0.30, 4.5], [-0.12, 0.48, 3.0],
                [0.40, 0.58, 3.8], [-0.30, 0.72, 4.2], [0.08, 0.82, 2.8],
                [-0.05, 0.25, 2.5], [0.30, 0.15, 3.2]
            ];
            ctx.fillStyle = 'rgba(255,255,255,0.68)';
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.lineWidth = 1.1;
            for (const [bx, by, br] of bubbleSeeds) {
                const px = bx * spread;
                const py = surfaceWY + by * liquidH;
                ctx.beginPath();
                ctx.arc(px, py, br, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        ctx.restore();
        return surfaceWY;
    }

    /**
     * Zeichnet den Flüssigkeits-Ausguss in Weltkoordinaten (immer der Schwerkraft folgend!),
     * erst dann, wenn die Flüssigkeitsoberfläche tatsächlich die tiefere Ausgusskante erreicht!
     */
    function drawPourStreamWorld(ctx, item, spoutLeft, spoutRight, liquidSurfaceWY) {
        const meta = CATALOG_BY_TYPE[item.type];
        if (!meta || !meta.canPour) return;
        const fill = item.fillLevel ?? 0;
        if (fill <= 0.03) return;
        if (item.pourOverride === 'off') return;
        if (item.stopper && item.pourOverride !== 'on') return;

        const wL = localToWorld(item, spoutLeft[0], spoutLeft[1]);
        const wR = localToWorld(item, spoutRight[0], spoutRight[1]);
        // Der tiefer liegende Ausgießer gießt aus
        const spout = wL.y >= wR.y ? wL : wR;
        const other = wL.y >= wR.y ? wR : wL;

        const deg = (normalizeAngle(item.rotation || 0) * 180) / Math.PI;
        const cy = item.y + item.h * 0.5;
        const spoutRelY = spout.y - cy;

        // Echte Physik-Prüfung: Ausguss beginnt erst, wenn der Flüssigkeitsspiegel den Rand berührt!
        const liquidReachedRim = (liquidSurfaceWY !== null && liquidSurfaceWY !== undefined) && (liquidSurfaceWY <= spoutRelY + 6);
        const autoShouldPour = Math.abs(deg) >= 12 && liquidReachedRim;
        if (item.pourOverride !== 'on' && !autoShouldPour) return;

        const pourDirX = spout.x >= other.x ? 1 : -1;

        const color = item.liquidColor || '#38bdf8';
        const streamLen = Math.max(95, Math.min(220, item.h * 0.95));
        const streamW = Math.max(5.5, Math.min(11, item.w * 0.065));
        const curveX = pourDirX * Math.min(34, 14 + Math.abs(deg) * 0.2);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Äußerer Flüssigkeitsstrahl (Parabel nach unten)
        ctx.strokeStyle = hexToRgba(color, 0.84);
        ctx.lineWidth = streamW;
        ctx.beginPath();
        ctx.moveTo(spout.x, spout.y);
        ctx.quadraticCurveTo(spout.x + curveX, spout.y + streamLen * 0.28, spout.x + curveX * 1.15, spout.y + streamLen);
        ctx.stroke();

        // Heller Lichtreflex entlang des Strahls
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = Math.max(1.5, streamW * 0.28);
        ctx.beginPath();
        ctx.moveTo(spout.x - pourDirX * 1.2, spout.y + 4);
        ctx.quadraticCurveTo(spout.x + curveX - pourDirX * 1.2, spout.y + streamLen * 0.28, spout.x + curveX * 1.15 - pourDirX * 1.2, spout.y + streamLen - 6);
        ctx.stroke();

        // Kleine fallende Tropfen am unteren Ende
        const endX = spout.x + curveX * 1.15;
        const endY = spout.y + streamLen;
        ctx.fillStyle = hexToRgba(color, 0.85);
        const drops = [
            [0, 12, streamW * 0.42],
            [pourDirX * 5, 24, streamW * 0.30],
            [-pourDirX * 4, 32, streamW * 0.24]
        ];
        for (const [dx, dy, r] of drops) {
            ctx.beginPath();
            ctx.arc(endX + dx, endY + dy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * Zeichnet Dampf oder Rauch in Weltkoordinaten (steigt immer senkrecht nach oben!).
     */
    function drawGasEffectWorld(ctx, item, openingLocal) {
        const eff = item.effect || 'none';
        if (eff !== 'steam' && eff !== 'smoke' && eff !== 'steam_bubbles') return;

        const origin = localToWorld(item, openingLocal[0], openingLocal[1]);
        const isSmoke = (eff === 'smoke');
        const scale = Math.max(0.7, Math.min(1.45, Math.max(item.w, item.h) / 170));

        ctx.save();
        ctx.translate(origin.x, origin.y);
        ctx.scale(scale, scale);

        if (isSmoke) {
            // Dichter grauer Rauch (geschichtete Wolken)
            const puffs = [
                { x: 0,   y: -14, r: 12, a: 0.48 },
                { x: -10, y: -32, r: 16, a: 0.44 },
                { x: 10,  y: -46, r: 19, a: 0.40 },
                { x: -7,  y: -66, r: 22, a: 0.34 },
                { x: 12,  y: -86, r: 25, a: 0.26 },
                { x: -4,  y: -108, r: 27, a: 0.18 }
            ];
            for (const p of puffs) {
                const g = ctx.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.2, 2, p.x, p.y, p.r);
                g.addColorStop(0, `rgba(100,116,139,${p.a})`);
                g.addColorStop(0.65, `rgba(71,85,105,${p.a * 0.75})`);
                g.addColorStop(1, 'rgba(71,85,105,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // Feiner weiß-bläulicher Dampf (3 geschwungene Schwaden + weiche Wolken)
            const wisps = [-14, 0, 14];
            ctx.lineCap = 'round';
            for (let i = 0; i < wisps.length; i++) {
                const ox = wisps[i];
                const h = 72 + (i === 1 ? 18 : 0);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
                ctx.lineWidth = 4.5;
                ctx.beginPath();
                ctx.moveTo(ox, -8);
                ctx.bezierCurveTo(ox - 12, -h * 0.33, ox + 14, -h * 0.66, ox - 4, -h);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(ox, -8);
                ctx.bezierCurveTo(ox - 12, -h * 0.33, ox + 14, -h * 0.66, ox - 4, -h);
                ctx.stroke();
            }
            // Leichte Dampfwölkchen oben
            const clouds = [
                { x: -8, y: -56, r: 15 },
                { x: 10, y: -74, r: 18 },
                { x: -2, y: -92, r: 20 }
            ];
            for (const c of clouds) {
                const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, c.r);
                g.addColorStop(0, 'rgba(241,245,249,0.72)');
                g.addColorStop(1, 'rgba(226,232,240,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    function drawRubberStopper(ctx, x, y, topW, botW, h) {
        ctx.save();
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - topW * 0.5, y);
        ctx.lineTo(x + topW * 0.5, y);
        ctx.lineTo(x + botW * 0.5, y + h);
        ctx.lineTo(x - botW * 0.5, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Glanzstreifen auf dem Stopfen
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - topW * 0.25, y + 3);
        ctx.lineTo(x - botW * 0.25, y + h - 3);
        ctx.stroke();
        ctx.restore();
    }

    function drawVesselLabel(ctx, label, yPos, maxW) {
        if (!label || !label.trim()) return;
        ctx.save();
        const txt = label.trim();
        ctx.font = '700 16px system-ui, -apple-system, sans-serif';
        const tw = Math.min(maxW, ctx.measureText(txt).width + 16);
        const th = 24;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-tw * 0.5, yPos - th * 0.5, tw, th, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, 0, yPos + 0.5, tw - 8);
        ctx.restore();
    }

    // =========================================================================
    // 3. HAUPT-RENDERER FÜR ALLE 22 LABORGERÄTE
    // =========================================================================
    function drawLabObject(ctx, item) {
        if (!item || !item.type) return;
        const w = item.w || 140;
        const h = item.h || 160;
        const hw = w * 0.5;
        const hh = h * 0.5;
        const cx = item.x + hw;
        const cy = item.y + hh;
        const rot = item.rotation || 0;

        // Zuerst Effekte im Hintergrund/Weltkoordinaten vorbereiten (Ausguss + Dampf zeichnen wir NACH dem Glas)
        let spoutLeft = null;
        let spoutRight = null;
        let liquidSurfaceWY = null;
        let effectOrigin = [0, -hh * 0.85];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        if (item.flipX) ctx.scale(-1, 1);

        const glassFill = 'rgba(224, 242, 254, 0.22)';
        const glassStroke = '#1e293b';

        switch (item.type) {
            // -----------------------------------------------------------------
            // 1. BECHERGLAS
            // -----------------------------------------------------------------
            case 'beaker': {
                const topY = -hh * 0.82;
                const botY = hh * 0.88;
                const leftX = -hw * 0.72;
                const rightX = hw * 0.72;
                const rad = Math.min(w, h) * 0.1;
                spoutLeft = [leftX - hw * 0.12, topY + 2];
                spoutRight = [rightX + hw * 0.04, topY + 2];
                effectOrigin = [0, topY];

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(leftX + 3, topY + 4);
                    c.lineTo(rightX - 3, topY + 4);
                    c.lineTo(rightX - 3, botY - rad);
                    c.quadraticCurveTo(rightX - 3, botY - 3, rightX - rad, botY - 3);
                    c.lineTo(leftX + rad, botY - 3);
                    c.quadraticCurveTo(leftX + 3, botY - 3, leftX + 3, botY - rad);
                    c.closePath();
                };

                // Glaskörper-Hintergrund
                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                // Flüssigkeit
                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [leftX + 4, topY + 12], [rightX - 4, topY + 12],
                    [leftX + 4, botY - 4], [rightX - 4, botY - 4]
                ], spoutLeft, spoutRight);

                // Glas-Kontur mit Ausgießer links oben
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.8;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(leftX - hw * 0.14, topY);
                ctx.quadraticCurveTo(leftX, topY + 2, leftX, topY + 12);
                ctx.lineTo(leftX, botY - rad);
                ctx.quadraticCurveTo(leftX, botY, leftX + rad, botY);
                ctx.lineTo(rightX - rad, botY);
                ctx.quadraticCurveTo(rightX, botY, rightX, botY - rad);
                ctx.lineTo(rightX, topY + 6);
                ctx.quadraticCurveTo(rightX + hw * 0.08, topY, rightX + hw * 0.05, topY);
                ctx.stroke();

                // Mess-Skala
                ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
                ctx.lineWidth = 1.6;
                for (let i = 1; i <= 5; i++) {
                    const y = botY - 16 - (i / 6) * (botY - topY - 26);
                    const tickW = (i % 2 === 0) ? w * 0.18 : w * 0.10;
                    ctx.beginPath();
                    ctx.moveTo(rightX - 10, y);
                    ctx.lineTo(rightX - 10 - tickW, y);
                    ctx.stroke();
                }

                // Glasreflex
                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 3.2;
                ctx.beginPath();
                ctx.moveTo(leftX + 10, topY + 20);
                ctx.lineTo(leftX + 10, botY - 18);
                ctx.stroke();

                drawVesselLabel(ctx, item.label, 8, w * 0.62);
                break;
            }

            // -----------------------------------------------------------------
            // 2. ERLENMEYERKOLBEN
            // -----------------------------------------------------------------
            case 'erlenmeyer': {
                const topY = -hh * 0.80;
                const neckBotY = -hh * 0.32;
                const botY = hh * 0.88;
                const neckW = hw * 0.26;
                const baseW = hw * 0.82;
                const rad = 14;
                spoutLeft = [-neckW - 4, topY + 2];
                spoutRight = [neckW + 4, topY + 2];
                effectOrigin = [0, topY];

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-neckW + 3, topY + 4);
                    c.lineTo(neckW - 3, topY + 4);
                    c.lineTo(neckW - 3, neckBotY);
                    c.lineTo(baseW - 4, botY - rad);
                    c.quadraticCurveTo(baseW - 3, botY - 3, baseW - rad, botY - 3);
                    c.lineTo(-baseW + rad, botY - 3);
                    c.quadraticCurveTo(-baseW + 3, botY - 3, -baseW + 4, botY - rad);
                    c.lineTo(-neckW + 3, neckBotY);
                    c.closePath();
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-neckW, neckBotY - 10], [neckW, neckBotY - 10],
                    [-baseW + 4, botY - 4], [baseW - 4, botY - 4]
                ], spoutLeft, spoutRight);

                // Kontur
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.8;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(-neckW - 5, topY);
                ctx.lineTo(-neckW, topY + 6);
                ctx.lineTo(-neckW, neckBotY);
                ctx.lineTo(-baseW, botY - rad);
                ctx.quadraticCurveTo(-baseW - 2, botY, -baseW + rad, botY);
                ctx.lineTo(baseW - rad, botY);
                ctx.quadraticCurveTo(baseW + 2, botY, baseW, botY - rad);
                ctx.lineTo(neckW, neckBotY);
                ctx.lineTo(neckW, topY + 6);
                ctx.lineTo(neckW + 5, topY);
                ctx.stroke();

                // Graduierung
                ctx.strokeStyle = 'rgba(30,41,59,0.5)';
                ctx.lineWidth = 1.5;
                for (let i = 1; i <= 4; i++) {
                    const t = i / 5;
                    const y = botY - 16 - t * (botY - neckBotY - 22);
                    const halfAtY = neckW + (baseW - neckW) * (1 - t);
                    ctx.beginPath();
                    ctx.moveTo(halfAtY - 14, y);
                    ctx.lineTo(halfAtY - 28, y);
                    ctx.stroke();
                }

                // Glasreflex
                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-neckW + 7, neckBotY + 10);
                ctx.lineTo(-baseW + 18, botY - 20);
                ctx.stroke();

                if (item.stopper) {
                    drawRubberStopper(ctx, 0, topY - 16, neckW * 2.15, neckW * 1.75, 24);
                    effectOrigin = [0, topY - 18];
                }
                drawVesselLabel(ctx, item.label, hh * 0.34, w * 0.56);
                break;
            }

            // -----------------------------------------------------------------
            // 3. REAGENZGLAS
            // -----------------------------------------------------------------
            case 'test_tube': {
                const topY = -hh * 0.84;
                const botY = hh * 0.88;
                const r = hw * 0.64;
                spoutLeft = [-r - 4, topY + 2];
                spoutRight = [r + 4, topY + 2];
                effectOrigin = [0, topY];

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-r + 2.5, topY + 4);
                    c.lineTo(r - 2.5, topY + 4);
                    c.lineTo(r - 2.5, botY - r);
                    c.arc(0, botY - r, r - 2.5, 0, Math.PI);
                    c.closePath();
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-r + 3, topY + 12], [r - 3, topY + 12],
                    [-r + 3, botY - 2], [r - 3, botY - 2]
                ], spoutLeft, spoutRight);

                // Kontur mit Bördelrand
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-r - 5, topY);
                ctx.lineTo(-r, topY + 5);
                ctx.lineTo(-r, botY - r);
                ctx.arc(0, botY - r, r, Math.PI, 0, true);
                ctx.lineTo(r, topY + 5);
                ctx.lineTo(r + 5, topY);
                ctx.stroke();

                // Glasreflex
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(-r + 6, topY + 16);
                ctx.lineTo(-r + 6, botY - r - 4);
                ctx.stroke();

                if (item.stopper) {
                    drawRubberStopper(ctx, 0, topY - 15, r * 2.15, r * 1.75, 22);
                    effectOrigin = [0, topY - 16];
                }
                drawVesselLabel(ctx, item.label, 0, w * 1.5);
                break;
            }

            // -----------------------------------------------------------------
            // 4. RUNDKOLBEN
            // -----------------------------------------------------------------
            case 'round_flask': {
                const topY = -hh * 0.84;
                const neckW = hw * 0.24;
                const bulbR = Math.min(hw * 0.78, hh * 0.56);
                const bulbCY = hh * 0.88 - bulbR;
                const neckJoinY = bulbCY - Math.sqrt(Math.max(1, bulbR * bulbR - neckW * neckW));
                spoutLeft = [-neckW - 4, topY + 2];
                spoutRight = [neckW + 4, topY + 2];
                effectOrigin = [0, topY];

                const startAngle = -Math.acos(neckW / bulbR);
                const endAngle = Math.PI + Math.acos(neckW / bulbR);

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-neckW + 3, topY + 4);
                    c.lineTo(neckW - 3, topY + 4);
                    c.lineTo(neckW - 3, neckJoinY + 2);
                    c.arc(0, bulbCY, bulbR - 3, startAngle, endAngle, false);
                    c.lineTo(-neckW + 3, neckJoinY + 2);
                    c.closePath();
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-bulbR, bulbCY - bulbR], [bulbR, bulbCY - bulbR],
                    [-bulbR, bulbCY + bulbR], [bulbR, bulbCY + bulbR]
                ], spoutLeft, spoutRight);

                // Kontur
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-neckW - 5, topY);
                ctx.lineTo(-neckW, topY + 5);
                ctx.lineTo(-neckW, neckJoinY);
                ctx.arc(0, bulbCY, bulbR, endAngle, startAngle, true);
                ctx.lineTo(neckW, topY + 5);
                ctx.lineTo(neckW + 5, topY);
                ctx.stroke();

                // Gebogener Glasreflex
                ctx.strokeStyle = 'rgba(255,255,255,0.68)';
                ctx.lineWidth = 3.2;
                ctx.beginPath();
                ctx.arc(0, bulbCY, bulbR - 10, Math.PI * 0.78, Math.PI * 1.18);
                ctx.stroke();

                if (item.stopper) {
                    drawRubberStopper(ctx, 0, topY - 15, neckW * 2.15, neckW * 1.75, 22);
                    effectOrigin = [0, topY - 16];
                }
                drawVesselLabel(ctx, item.label, bulbCY, bulbR * 1.4);
                break;
            }

            // -----------------------------------------------------------------
            // 5. MESSZYLINDER
            // -----------------------------------------------------------------
            case 'graduated_cylinder': {
                const topY = -hh * 0.86;
                const botY = hh * 0.78;
                const cylW = hw * 0.48;
                spoutLeft = [-cylW - 6, topY + 2];
                spoutRight = [cylW + 2, topY + 2];
                effectOrigin = [0, topY];

                const innerClip = (c) => {
                    c.beginPath();
                    c.rect(-cylW + 2.5, topY + 4, (cylW - 2.5) * 2, botY - topY - 6);
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-cylW + 3, topY + 10], [cylW - 3, topY + 10],
                    [-cylW + 3, botY - 2], [cylW - 3, botY - 2]
                ], spoutLeft, spoutRight);

                // Standfuß
                ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(-hw * 0.85, hh * 0.90);
                ctx.lineTo(hw * 0.85, hh * 0.90);
                ctx.lineTo(hw * 0.65, botY);
                ctx.lineTo(-hw * 0.65, botY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Zylinderkontur
                ctx.beginPath();
                ctx.moveTo(-cylW - 6, topY);
                ctx.lineTo(-cylW, topY + 6);
                ctx.lineTo(-cylW, botY);
                ctx.lineTo(cylW, botY);
                ctx.lineTo(cylW, topY + 4);
                ctx.lineTo(cylW + 3, topY);
                ctx.stroke();

                // Feine Skala
                ctx.strokeStyle = 'rgba(30,41,59,0.6)';
                ctx.lineWidth = 1.2;
                for (let i = 1; i <= 10; i++) {
                    const y = botY - 12 - (i / 11) * (botY - topY - 24);
                    const tw = (i % 5 === 0) ? cylW * 0.85 : cylW * 0.45;
                    ctx.beginPath();
                    ctx.moveTo(cylW - 3, y);
                    ctx.lineTo(cylW - 3 - tw, y);
                    ctx.stroke();
                }
                drawVesselLabel(ctx, item.label, 12, w * 1.1);
                break;
            }

            // -----------------------------------------------------------------
            // 6. TRICHTER
            // -----------------------------------------------------------------
            case 'funnel': {
                const topY = -hh * 0.82;
                const coneBotY = hh * 0.05;
                const stemBotY = hh * 0.88;
                const topW = hw * 0.84;
                const stemW = hw * 0.13;

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-topW + 4, topY + 3);
                    c.lineTo(topW - 4, topY + 3);
                    c.lineTo(stemW - 2, coneBotY);
                    c.lineTo(stemW - 2, stemBotY - 8);
                    c.lineTo(-stemW + 2, stemBotY);
                    c.lineTo(-stemW + 2, coneBotY);
                    c.closePath();
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-topW, topY + 8], [topW, topY + 8],
                    [-stemW, coneBotY + 10], [stemW, coneBotY + 10]
                ]);

                // Filterpapier-Linie angedeutet
                ctx.strokeStyle = 'rgba(255,255,255,0.75)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-topW * 0.82, topY + 12);
                ctx.lineTo(0, coneBotY - 2);
                ctx.lineTo(topW * 0.82, topY + 12);
                ctx.stroke();

                // Trichter-Kontur
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(-topW, topY);
                ctx.lineTo(-stemW, coneBotY);
                ctx.lineTo(-stemW, stemBotY);
                ctx.lineTo(stemW, stemBotY - 10);
                ctx.lineTo(stemW, coneBotY);
                ctx.lineTo(topW, topY);
                ctx.stroke();

                // Oberer Rand (Ellipse)
                ctx.beginPath();
                ctx.ellipse(0, topY, topW, 7, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 7. TROPFPIPETTE
            // -----------------------------------------------------------------
            case 'pipette': {
                const bulbTopY = -hh * 0.90;
                const bulbBotY = -hh * 0.35;
                const tipY = hh * 0.82;
                const tubeW = hw * 0.32;

                // Gummisauger oben
                ctx.fillStyle = '#dc2626';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(-tubeW * 1.1, bulbBotY);
                ctx.bezierCurveTo(-hw * 0.95, bulbBotY - 10, -hw * 0.85, bulbTopY, 0, bulbTopY);
                ctx.bezierCurveTo(hw * 0.85, bulbTopY, hw * 0.95, bulbBotY - 10, tubeW * 1.1, bulbBotY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-tubeW + 1.5, bulbBotY + 2);
                    c.lineTo(tubeW - 1.5, bulbBotY + 2);
                    c.lineTo(tubeW - 1.5, hh * 0.35);
                    c.lineTo(2, tipY);
                    c.lineTo(-2, tipY);
                    c.lineTo(-tubeW + 1.5, hh * 0.35);
                    c.closePath();
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-tubeW, bulbBotY + 4], [tubeW, bulbBotY + 4],
                    [-2, tipY], [2, tipY]
                ]);

                // Glasröhrchen
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(-tubeW, bulbBotY);
                ctx.lineTo(-tubeW, hh * 0.35);
                ctx.lineTo(-2.5, tipY);
                ctx.moveTo(tubeW, bulbBotY);
                ctx.lineTo(tubeW, hh * 0.35);
                ctx.lineTo(2.5, tipY);
                ctx.stroke();

                // Fallender Tropfen an der Spitze wenn gefüllt
                if ((item.fillLevel ?? 0) > 0.05) {
                    ctx.fillStyle = hexToRgba(item.liquidColor || '#ef4444', 0.9);
                    ctx.beginPath();
                    ctx.moveTo(0, tipY + 6);
                    ctx.bezierCurveTo(6, tipY + 16, 6, tipY + 24, 0, tipY + 24);
                    ctx.bezierCurveTo(-6, tipY + 24, -6, tipY + 16, 0, tipY + 6);
                    ctx.fill();
                }
                break;
            }

            // -----------------------------------------------------------------
            // 8. BÜRETTE
            // -----------------------------------------------------------------
            case 'burette': {
                const topY = -hh * 0.90;
                const cockY = hh * 0.58;
                const tipY = hh * 0.90;
                const tubeW = hw * 0.34;

                const innerClip = (c) => {
                    c.beginPath();
                    c.rect(-tubeW + 2, topY + 4, (tubeW - 2) * 2, cockY - topY - 4);
                };

                innerClip(ctx);
                ctx.fillStyle = glassFill;
                ctx.fill();

                drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-tubeW, topY + 6], [tubeW, topY + 6],
                    [-tubeW, cockY], [tubeW, cockY]
                ]);

                // Röhre
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.moveTo(-tubeW - 4, topY);
                ctx.lineTo(-tubeW, topY + 5);
                ctx.lineTo(-tubeW, cockY);
                ctx.lineTo(-3, tipY);
                ctx.moveTo(tubeW + 4, topY);
                ctx.lineTo(tubeW, topY + 5);
                ctx.lineTo(tubeW, cockY);
                ctx.lineTo(3, tipY);
                ctx.stroke();

                // Skala
                ctx.strokeStyle = 'rgba(30,41,59,0.55)';
                ctx.lineWidth = 1.1;
                for (let i = 1; i <= 14; i++) {
                    const y = topY + 16 + (i / 15) * (cockY - topY - 26);
                    const tw = (i % 5 === 0) ? tubeW * 1.1 : tubeW * 0.55;
                    ctx.beginPath();
                    ctx.moveTo(tubeW - 2, y);
                    ctx.lineTo(tubeW - 2 - tw, y);
                    ctx.stroke();
                }

                // PTFE-Hahn
                ctx.fillStyle = '#2563eb';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.72, cockY - 5, hw * 1.44, 10, 4);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.roundRect(hw * 0.45, cockY - 12, 10, 24, 3);
                ctx.fill();
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 9. ABDAMPFSCHALE
            // -----------------------------------------------------------------
            case 'evaporating_dish': {
                const topY = -hh * 0.45;
                const botY = hh * 0.78;
                spoutLeft = [-hw * 0.88, topY];
                spoutRight = [hw * 0.88, topY];
                effectOrigin = [0, topY];

                const innerClip = (c) => {
                    c.beginPath();
                    c.moveTo(-hw * 0.84, topY + 2);
                    c.lineTo(hw * 0.84, topY + 2);
                    c.quadraticCurveTo(hw * 0.76, botY - 2, 0, botY - 2);
                    c.quadraticCurveTo(-hw * 0.76, botY - 2, -hw * 0.84, topY + 2);
                    c.closePath();
                };

                // Porzellankörper
                innerClip(ctx);
                ctx.fillStyle = '#f8fafc';
                ctx.fill();

                liquidSurfaceWY = drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-hw * 0.8, topY + 4], [hw * 0.8, topY + 4],
                    [-hw * 0.4, botY - 3], [hw * 0.4, botY - 3]
                ], spoutLeft, spoutRight);

                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.8;
                ctx.beginPath();
                ctx.moveTo(-hw * 0.90, topY);
                ctx.quadraticCurveTo(-hw * 0.78, botY, 0, botY);
                ctx.quadraticCurveTo(hw * 0.78, botY, hw * 0.90, topY);
                ctx.stroke();

                // Standring unten
                ctx.beginPath();
                ctx.moveTo(-hw * 0.34, botY);
                ctx.lineTo(hw * 0.34, botY);
                ctx.stroke();
                drawVesselLabel(ctx, item.label, hh * 0.25, w * 0.55);
                break;
            }

            // -----------------------------------------------------------------
            // 10. UHRGLAS
            // -----------------------------------------------------------------
            case 'watch_glass': {
                const topY = -hh * 0.35;
                const botY = hh * 0.65;
                effectOrigin = [0, topY];

                // Inhalt (Pulver oder Tropfen)
                if ((item.fillLevel ?? 0) > 0.05) {
                    const f = item.fillLevel;
                    ctx.fillStyle = hexToRgba(item.liquidColor || '#eab308', 0.85);
                    ctx.beginPath();
                    ctx.moveTo(-hw * 0.55 * f, botY - 8);
                    ctx.quadraticCurveTo(0, botY - 12 - hh * 1.15 * f, hw * 0.55 * f, botY - 8);
                    ctx.quadraticCurveTo(0, botY + 4, -hw * 0.55 * f, botY - 8);
                    ctx.fill();
                }

                // Schale
                ctx.fillStyle = glassFill;
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(-hw * 0.90, topY);
                ctx.quadraticCurveTo(0, botY + 14, hw * 0.90, topY);
                ctx.quadraticCurveTo(0, botY + 2, -hw * 0.90, topY);
                ctx.fill();
                ctx.stroke();
                drawVesselLabel(ctx, item.label, botY + 16, w * 0.7);
                break;
            }

            // -----------------------------------------------------------------
            // 11. SPRITZFLASCHE
            // -----------------------------------------------------------------
            case 'wash_bottle': {
                const capTopY = -hh * 0.62;
                const bodyTopY = -hh * 0.34;
                const botY = hh * 0.88;
                const bw = hw * 0.62;

                const innerClip = (c) => {
                    c.beginPath();
                    c.roundRect(-bw + 3, bodyTopY + 3, (bw - 3) * 2, botY - bodyTopY - 6, 12);
                };

                innerClip(ctx);
                ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
                ctx.fill();

                drawGravityLiquidInClip(ctx, item, innerClip, [
                    [-bw + 4, bodyTopY + 8], [bw - 4, bodyTopY + 8],
                    [-bw + 4, botY - 4], [bw - 4, botY - 4]
                ]);

                // Flaschenkörper
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.roundRect(-bw, bodyTopY, bw * 2, botY - bodyTopY, 14);
                ctx.stroke();

                // Schraubkappe
                ctx.fillStyle = '#0284c7';
                ctx.beginPath();
                ctx.roundRect(-bw * 0.52, capTopY, bw * 1.04, bodyTopY - capTopY + 2, 5);
                ctx.fill();
                ctx.stroke();

                // Gebogenes Spritzrohr
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, capTopY);
                ctx.lineTo(0, -hh * 0.86);
                ctx.quadraticCurveTo(0, -hh * 0.94, hw * 0.35, -hh * 0.92);
                ctx.lineTo(hw * 0.86, -hh * 0.74);
                ctx.stroke();

                drawVesselLabel(ctx, item.label, hh * 0.25, bw * 1.6);
                break;
            }

            // -----------------------------------------------------------------
            // 12. BUNSENBRENNER (AUS / GELBE FLAMME / BLAUE FLAMME)
            // -----------------------------------------------------------------
            case 'bunsen_burner': {
                const baseY = hh * 0.88;
                const tubeTopY = -hh * 0.16;
                const tubeW = hw * 0.22;

                // Flamme
                const flameMode = item.flame || 'blue';
                if (flameMode === 'blue') {
                    // Äußere rauschende blaue Flamme
                    const gOut = ctx.createRadialGradient(0, tubeTopY - hh * 0.32, 4, 0, tubeTopY - hh * 0.35, hh * 0.45);
                    gOut.addColorStop(0, 'rgba(56, 189, 248, 0.95)');
                    gOut.addColorStop(0.6, 'rgba(37, 99, 235, 0.65)');
                    gOut.addColorStop(1, 'rgba(37, 99, 235, 0)');
                    ctx.fillStyle = gOut;
                    ctx.beginPath();
                    ctx.moveTo(-tubeW * 1.15, tubeTopY);
                    ctx.bezierCurveTo(-tubeW * 1.6, tubeTopY - hh * 0.32, -tubeW * 0.4, tubeTopY - hh * 0.62, 0, -hh * 0.94);
                    ctx.bezierCurveTo(tubeW * 0.4, tubeTopY - hh * 0.62, tubeW * 1.6, tubeTopY - hh * 0.32, tubeW * 1.15, tubeTopY);
                    ctx.closePath();
                    ctx.fill();

                    // Innerer heller Flammenkegel
                    ctx.fillStyle = 'rgba(186, 230, 253, 0.92)';
                    ctx.beginPath();
                    ctx.moveTo(-tubeW * 0.72, tubeTopY);
                    ctx.quadraticCurveTo(0, tubeTopY - hh * 0.46, tubeW * 0.72, tubeTopY);
                    ctx.closePath();
                    ctx.fill();
                } else if (flameMode === 'yellow') {
                    // Leuchtende gelbe Flamme
                    const gY = ctx.createLinearGradient(0, tubeTopY, 0, -hh * 0.94);
                    gY.addColorStop(0, '#f97316');
                    gY.addColorStop(0.45, '#facc15');
                    gY.addColorStop(1, '#fef08a');
                    ctx.fillStyle = gY;
                    ctx.beginPath();
                    ctx.moveTo(-tubeW * 1.2, tubeTopY);
                    ctx.bezierCurveTo(-tubeW * 2.1, tubeTopY - hh * 0.35, -tubeW * 0.5, tubeTopY - hh * 0.65, 0, -hh * 0.94);
                    ctx.bezierCurveTo(tubeW * 0.5, tubeTopY - hh * 0.65, tubeW * 2.1, tubeTopY - hh * 0.35, tubeW * 1.2, tubeTopY);
                    ctx.closePath();
                    ctx.fill();
                }

                // Gas-Zuleitung seitlich
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(tubeW, hh * 0.64);
                ctx.lineTo(hw * 0.86, hh * 0.64);
                ctx.stroke();

                // Brennerrohr (Metall)
                const metalGrad = ctx.createLinearGradient(-tubeW, 0, tubeW, 0);
                metalGrad.addColorStop(0, '#94a3b8');
                metalGrad.addColorStop(0.4, '#e2e8f0');
                metalGrad.addColorStop(1, '#64748b');
                ctx.fillStyle = metalGrad;
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.rect(-tubeW, tubeTopY, tubeW * 2, baseY - tubeTopY - 14);
                ctx.fill();
                ctx.stroke();

                // Luftzufuhr-Ring
                ctx.fillStyle = '#475569';
                ctx.fillRect(-tubeW - 3, hh * 0.38, tubeW * 2 + 6, 16);
                ctx.strokeRect(-tubeW - 3, hh * 0.38, tubeW * 2 + 6, 16);

                // Standfuß
                ctx.fillStyle = '#334155';
                ctx.beginPath();
                ctx.moveTo(-hw * 0.78, baseY);
                ctx.lineTo(hw * 0.78, baseY);
                ctx.lineTo(hw * 0.56, baseY - 16);
                ctx.lineTo(-hw * 0.56, baseY - 16);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 13. DREIFUSS MIT DRAHTNETZ
            // -----------------------------------------------------------------
            case 'tripod': {
                const topY = -hh * 0.72;
                const botY = hh * 0.88;

                // Keramik-Drahtnetz oben
                ctx.fillStyle = '#e2e8f0';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.86, topY - 10, hw * 1.72, 10, 3);
                ctx.fill();
                ctx.stroke();

                // Keramikkern (weißer Streifen in der Mitte)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-hw * 0.42, topY - 9, hw * 0.84, 8);

                // Metallring
                ctx.fillStyle = '#475569';
                ctx.beginPath();
                ctx.roundRect(-hw * 0.76, topY, hw * 1.52, 12, 4);
                ctx.fill();
                ctx.stroke();

                // 3 Beine
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-hw * 0.62, topY + 10);
                ctx.lineTo(-hw * 0.84, botY);
                ctx.moveTo(hw * 0.62, topY + 10);
                ctx.lineTo(hw * 0.84, botY);
                ctx.moveTo(0, topY + 10);
                ctx.lineTo(0, botY - 8);
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 14. STATIV
            // -----------------------------------------------------------------
            case 'retort_stand': {
                const rodX = -hw * 0.48;
                const topY = -hh * 0.90;
                const botY = hh * 0.88;

                // Metallstange
                const rodG = ctx.createLinearGradient(rodX - 5, 0, rodX + 5, 0);
                rodG.addColorStop(0, '#64748b');
                rodG.addColorStop(0.5, '#e2e8f0');
                rodG.addColorStop(1, '#475569');
                ctx.fillStyle = rodG;
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2;
                ctx.fillRect(rodX - 5, topY, 10, botY - topY - 14);
                ctx.strokeRect(rodX - 5, topY, 10, botY - topY - 14);

                // Grundplatte
                ctx.fillStyle = '#334155';
                ctx.beginPath();
                ctx.roundRect(-hw * 0.84, botY - 16, hw * 1.68, 16, 4);
                ctx.fill();
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 15. STATIVKLAMMER / MUFFE
            // -----------------------------------------------------------------
            case 'clamp': {
                // Muffe links
                ctx.fillStyle = '#475569';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.88, -14, 24, 28, 4);
                ctx.fill();
                ctx.stroke();

                // Feststellschraube links
                ctx.beginPath();
                ctx.moveTo(-hw * 0.88, 0);
                ctx.lineTo(-hw * 0.98, 0);
                ctx.moveTo(-hw * 0.98, -8);
                ctx.lineTo(-hw * 0.98, 8);
                ctx.stroke();

                // Verbindungsstange
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(-hw * 0.88 + 24, -4, hw * 1.12, 8);
                ctx.strokeRect(-hw * 0.88 + 24, -4, hw * 1.12, 8);

                // Greifbacken rechts
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 4.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(hw * 0.36, -4);
                ctx.quadraticCurveTo(hw * 0.65, -hh * 0.78, hw * 0.88, -hh * 0.45);
                ctx.moveTo(hw * 0.36, 4);
                ctx.quadraticCurveTo(hw * 0.65, hh * 0.78, hw * 0.88, hh * 0.45);
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 16. REAGENZGLASSTÄNDER
            // -----------------------------------------------------------------
            case 'test_tube_rack': {
                const wood = '#d97706';
                const woodLight = '#f59e0b';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;

                // Seitliche Stützen
                ctx.fillStyle = wood;
                ctx.fillRect(-hw * 0.84, -hh * 0.65, 14, hh * 1.45);
                ctx.strokeRect(-hw * 0.84, -hh * 0.65, 14, hh * 1.45);
                ctx.fillRect(hw * 0.84 - 14, -hh * 0.65, 14, hh * 1.45);
                ctx.strokeRect(hw * 0.84 - 14, -hh * 0.65, 14, hh * 1.45);

                // Obere & untere Leiste
                ctx.fillStyle = woodLight;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.92, -hh * 0.68, hw * 1.84, 16, 4);
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.roundRect(-hw * 0.92, hh * 0.66, hw * 1.84, 18, 4);
                ctx.fill();
                ctx.stroke();

                // Öffnungen für Reagenzgläser
                ctx.fillStyle = '#78350f';
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.ellipse(i * (w * 0.145), -hh * 0.60, 10, 4, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            // -----------------------------------------------------------------
            // 17. THERMOMETER
            // -----------------------------------------------------------------
            case 'thermometer': {
                const topY = -hh * 0.88;
                const bulbCY = hh * 0.74;
                const bulbR = hw * 0.56;
                const tubeW = hw * 0.34;
                const fill = Math.max(0.05, Math.min(0.95, item.fillLevel ?? 0.55));
                const colColor = item.liquidColor || '#ef4444';

                // Glaskörper
                ctx.fillStyle = '#f8fafc';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.roundRect(-tubeW, topY, tubeW * 2, bulbCY - topY, tubeW);
                ctx.fill();
                ctx.stroke();

                // Kugel unten
                ctx.fillStyle = colColor;
                ctx.beginPath();
                ctx.arc(0, bulbCY, bulbR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Steigende Säule
                const colTop = bulbCY - fill * (bulbCY - topY - 14);
                ctx.fillStyle = colColor;
                ctx.fillRect(-3.2, colTop, 6.4, bulbCY - colTop);

                // Skala
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 1.2;
                for (let i = 0; i <= 10; i++) {
                    const y = bulbCY - 18 - (i / 10) * (bulbCY - topY - 34);
                    const tw = (i % 5 === 0) ? tubeW * 0.85 : tubeW * 0.45;
                    ctx.beginPath();
                    ctx.moveTo(tubeW - 1, y);
                    ctx.lineTo(tubeW - 1 - tw, y);
                    ctx.stroke();
                }
                break;
            }

            // -----------------------------------------------------------------
            // 18. GLASROHR 90°
            // -----------------------------------------------------------------
            case 'glass_tube_90': {
                effectOrigin = [hw * 0.82, hh * 0.78];
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                // Äußere Kontur
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 11;
                ctx.beginPath();
                ctx.moveTo(-hw * 0.78, hh * 0.78);
                ctx.lineTo(-hw * 0.78, -hh * 0.45);
                ctx.quadraticCurveTo(-hw * 0.78, -hh * 0.78, -hw * 0.42, -hh * 0.78);
                ctx.lineTo(hw * 0.42, -hh * 0.78);
                ctx.quadraticCurveTo(hw * 0.78, -hh * 0.78, hw * 0.78, -hh * 0.45);
                ctx.lineTo(hw * 0.78, hh * 0.78);
                ctx.stroke();

                // Glas-Innenraum
                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 6.5;
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 19. GLASSTAB
            // -----------------------------------------------------------------
            case 'stirring_rod': {
                ctx.fillStyle = 'rgba(224, 242, 254, 0.75)';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.roundRect(-4.5, -hh * 0.90, 9, hh * 1.80, 4.5);
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(-1.5, -hh * 0.82);
                ctx.lineTo(-1.5, hh * 0.82);
                ctx.stroke();
                break;
            }

            // -----------------------------------------------------------------
            // 20. FESTSTOFF / PULVER-HAUFEN
            // -----------------------------------------------------------------
            case 'solid_powder': {
                effectOrigin = [0, -hh * 0.45];
                const col = item.liquidColor || '#eab308';
                const f = Math.max(0.25, item.fillLevel ?? 0.7);
                const baseY = hh * 0.78;
                const peakY = baseY - hh * 1.45 * f;

                ctx.fillStyle = col;
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(-hw * 0.88, baseY);
                ctx.quadraticCurveTo(-hw * 0.35, peakY, 0, peakY);
                ctx.quadraticCurveTo(hw * 0.35, peakY, hw * 0.88, baseY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Körnung / Kristallpunkte
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                const grains = [[-0.25, 0.65], [0.18, 0.52], [-0.08, 0.38], [0.32, 0.78], [-0.42, 0.82]];
                for (const [gx, gy] of grains) {
                    ctx.beginPath();
                    ctx.arc(gx * hw, peakY + gy * (baseY - peakY), 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                drawVesselLabel(ctx, item.label, baseY - 12, w * 0.75);
                break;
            }

            // -----------------------------------------------------------------
            // 21. DIGITALWAAGE
            // -----------------------------------------------------------------
            case 'scale': {
                const panY = -hh * 0.68;
                // Wiegeplatte oben
                ctx.fillStyle = '#cbd5e1';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.76, panY, hw * 1.52, 12, 4);
                ctx.fill();
                ctx.stroke();

                // Stütze
                ctx.fillStyle = '#64748b';
                ctx.fillRect(-14, panY + 12, 28, 12);
                ctx.strokeRect(-14, panY + 12, 28, 12);

                // Gehäuse
                ctx.fillStyle = '#f1f5f9';
                ctx.beginPath();
                ctx.moveTo(-hw * 0.82, panY + 24);
                ctx.lineTo(hw * 0.82, panY + 24);
                ctx.lineTo(hw * 0.92, hh * 0.86);
                ctx.lineTo(-hw * 0.92, hh * 0.86);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // LCD-Display
                ctx.fillStyle = '#1e293b';
                ctx.beginPath();
                ctx.roundRect(-hw * 0.56, hh * 0.04, hw * 1.12, hh * 0.58, 6);
                ctx.fill();

                ctx.fillStyle = '#4ade80';
                ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((item.label && item.label.trim()) ? item.label.trim() : '0.00 g', 0, hh * 0.34);
                break;
            }

            // -----------------------------------------------------------------
            // 22. SPANNUNGSQUELLE / NETZGERÄT
            // -----------------------------------------------------------------
            case 'power_supply': {
                ctx.fillStyle = '#e2e8f0';
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.88, -hh * 0.82, hw * 1.76, hh * 1.64, 10);
                ctx.fill();
                ctx.stroke();

                // Display oben
                ctx.fillStyle = '#0f172a';
                ctx.beginPath();
                ctx.roundRect(-hw * 0.66, -hh * 0.62, hw * 1.32, hh * 0.52, 6);
                ctx.fill();

                ctx.fillStyle = '#38bdf8';
                ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((item.label && item.label.trim()) ? item.label.trim() : '6.0 V', 0, -hh * 0.35);

                // Plus-Buchse (Rot) & Minus-Buchse (Blau/Schwarz)
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.arc(-hw * 0.38, hh * 0.36, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = '700 15px system-ui, sans-serif';
                ctx.fillText('+', -hw * 0.38, hh * 0.37);

                ctx.fillStyle = '#1e293b';
                ctx.beginPath();
                ctx.arc(hw * 0.38, hh * 0.36, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.fillText('−', hw * 0.38, hh * 0.37);
                break;
            }

            // -----------------------------------------------------------------
            // 23. HERDPLATTE / MAGNETRÜHRER-HEIZPLATTE
            // -----------------------------------------------------------------
            case 'hotplate': {
                const heatMode = item.flame || 'yellow'; // 'off' | 'yellow' (warm) | 'blue' (heiß)
                const plateY = -hh * 0.62;
                const bodyTopY = -hh * 0.34;
                const botY = hh * 0.84;

                // Optionale Wärmewellen über der Platte, wenn eingeschaltet
                if (heatMode !== 'off') {
                    const waveColor = (heatMode === 'blue') ? 'rgba(239, 68, 68, 0.78)' : 'rgba(249, 115, 22, 0.65)';
                    ctx.strokeStyle = waveColor;
                    ctx.lineWidth = 2.4;
                    ctx.lineCap = 'round';
                    const xs = [-hw * 0.42, 0, hw * 0.42];
                    for (const wx of xs) {
                        ctx.beginPath();
                        ctx.moveTo(wx, plateY - 6);
                        ctx.quadraticCurveTo(wx - 7, plateY - 15, wx, plateY - 23);
                        ctx.quadraticCurveTo(wx + 7, plateY - 31, wx, plateY - 39);
                        ctx.stroke();
                    }
                }

                // Heizplatte oben (Keramik / Metall mit Glüheffekt je nach Heizstufe)
                if (heatMode === 'blue') {
                    const hg = ctx.createLinearGradient(-hw * 0.78, plateY, hw * 0.78, plateY);
                    hg.addColorStop(0, '#991b1b');
                    hg.addColorStop(0.5, '#ef4444');
                    hg.addColorStop(1, '#991b1b');
                    ctx.fillStyle = hg;
                } else if (heatMode === 'yellow') {
                    const hg = ctx.createLinearGradient(-hw * 0.78, plateY, hw * 0.78, plateY);
                    hg.addColorStop(0, '#7c2d12');
                    hg.addColorStop(0.5, '#f97316');
                    hg.addColorStop(1, '#7c2d12');
                    ctx.fillStyle = hg;
                } else {
                    ctx.fillStyle = '#475569';
                }
                ctx.strokeStyle = glassStroke;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.roundRect(-hw * 0.78, plateY, hw * 1.56, 15, 4);
                ctx.fill();
                ctx.stroke();

                // Distanzsockel unter der Platte
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(-hw * 0.66, plateY + 15, hw * 1.32, bodyTopY - (plateY + 15) + 2);
                ctx.strokeRect(-hw * 0.66, plateY + 15, hw * 1.32, bodyTopY - (plateY + 15) + 2);

                // Hauptgehäuse (abgeschrägte Labor-Optik)
                ctx.fillStyle = '#f1f5f9';
                ctx.beginPath();
                ctx.moveTo(-hw * 0.82, bodyTopY);
                ctx.lineTo(hw * 0.82, bodyTopY);
                ctx.lineTo(hw * 0.92, botY);
                ctx.lineTo(-hw * 0.92, botY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Standfüße
                ctx.fillStyle = '#334155';
                ctx.fillRect(-hw * 0.82, botY, 18, 7);
                ctx.fillRect(hw * 0.82 - 18, botY, 18, 7);

                // Status-LED links
                ctx.fillStyle = (heatMode === 'off') ? '#94a3b8' : (heatMode === 'blue' ? '#ef4444' : '#f59e0b');
                ctx.beginPath();
                ctx.arc(-hw * 0.62, hh * 0.28, 5.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Zwei Drehregler (Temperatur & Rührer)
                const knobs = [-hw * 0.22, hw * 0.42];
                for (let k = 0; k < knobs.length; k++) {
                    const kx = knobs[k];
                    const ky = hh * 0.30;
                    ctx.fillStyle = '#334155';
                    ctx.beginPath();
                    ctx.arc(kx, ky, 14, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    // Regler-Markierung
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(kx, ky);
                    const ang = (k === 0 && heatMode === 'blue') ? -0.4 : (k === 0 && heatMode === 'yellow' ? -1.4 : -2.3);
                    ctx.lineTo(kx + Math.cos(ang) * 10, ky + Math.sin(ang) * 10);
                    ctx.stroke();
                    ctx.strokeStyle = glassStroke;
                    ctx.lineWidth = 2.4;
                }

                // Optionales Temperatur-Etikett in der Mitte/rechts
                if (item.label && item.label.trim()) {
                    drawVesselLabel(ctx, item.label, hh * 0.02, w * 0.55);
                }
                break;
            }
        }

        ctx.restore();

        // Weltkoordinaten-Effekte NACH dem Gefäß zeichnen (Ausguss + Dampf/Rauch)
        if (spoutLeft && spoutRight) {
            drawPourStreamWorld(ctx, item, spoutLeft, spoutRight, liquidSurfaceWY);
        }
        drawGasEffectWorld(ctx, item, effectOrigin);
    }

    // =========================================================================
    // 4. INTERAKTIVES LABOR-KATALOG- & INSPEKTOR-UI
    // =========================================================================
    let activeCategory = 'vessels';

    function renderLabCatalogGrid() {
        const grid = document.getElementById('lab-catalog-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const filtered = LAB_CATALOG.filter(c => c.category === activeCategory);
        filtered.forEach(def => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lab-catalog-item';
            btn.title = def.name + ' einfügen';

            const canvas = document.createElement('canvas');
            canvas.width = 68;
            canvas.height = 68;
            const cctx = canvas.getContext('2d');
            const scale = Math.min(54 / def.w, 54 / def.h);
            cctx.save();
            cctx.translate(34, 34);
            cctx.scale(scale, scale);
            drawLabObject(cctx, {
                type: def.type,
                x: -def.w * 0.5,
                y: -def.h * 0.5,
                w: def.w,
                h: def.h,
                rotation: 0,
                flipX: false,
                fillLevel: def.defaultFill ?? 0.45,
                liquidColor: def.defaultColor || '#38bdf8',
                effect: 'none',
                flame: def.defaultFlame || 'blue',
                stopper: false,
                pourOverride: 'off',
                label: def.defaultLabel || ''
            });
            cctx.restore();

            const span = document.createElement('span');
            span.textContent = def.name;

            btn.appendChild(canvas);
            btn.appendChild(span);
            btn.addEventListener('click', () => {
                insertLabItemOnCurrentPage(def.type);
            });
            grid.appendChild(btn);
        });
    }

    function insertLabItemOnCurrentPage(type) {
        const app = window.WebNotesApp;
        if (!app) return;
        const pageData = app.getCurrentPageData();
        const def = CATALOG_BY_TYPE[type];
        if (!pageData || !def) return;

        app.saveHistorySnapshot();
        if (!Array.isArray(pageData.labItems)) pageData.labItems = [];

        // Leicht versetzt in der Mitte platzieren, falls schon Geräte da sind
        const offset = (pageData.labItems.length % 5) * 28;
        const newItem = {
            id: 'lab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: def.type,
            x: Math.round((app.PAGE_WIDTH - def.w) * 0.5 - 40 + offset),
            y: Math.round(app.PAGE_HEIGHT * 0.30 + offset),
            w: def.w,
            h: def.h,
            rotation: 0,
            flipX: false,
            fillLevel: def.defaultFill ?? 0,
            liquidColor: def.defaultColor || '#38bdf8',
            effect: 'none',
            flame: def.defaultFlame || 'blue',
            stopper: false,
            pourOverride: 'auto',
            label: def.defaultLabel || ''
        };

        pageData.labItems.push(newItem);
        app.setSelectedLabId(newItem.id);
        app.redrawMainCanvas();
        app.triggerPageAutoSave();
        app.showCanvasToast(def.name + ' eingefügt – ziehen, drehen & füllen!');
        syncLabInspectorUI();
    }

    function getSelectedLabItem() {
        const app = window.WebNotesApp;
        if (!app) return null;
        const selId = app.getSelectedLabId();
        if (!selId) return null;
        const pageData = app.getCurrentPageData();
        if (!pageData || !Array.isArray(pageData.labItems)) return null;
        return pageData.labItems.find(it => it.id === selId) || null;
    }

    function syncLabInspectorUI() {
        const inspector = document.getElementById('lab-inspector-panel');
        if (!inspector) return;
        const item = getSelectedLabItem();
        if (!item) {
            inspector.classList.add('hidden');
            return;
        }
        const def = CATALOG_BY_TYPE[item.type] || {};
        inspector.classList.remove('hidden');

        const titleEl = document.getElementById('lab-insp-title');
        if (titleEl) titleEl.textContent = def.name || 'Laborgerät';

        // Flüssigkeit / Füllstand
        const liqSection = document.getElementById('lab-insp-liquid-section');
        if (liqSection) {
            liqSection.classList.toggle('hidden', !def.hasLiquid);
            if (def.hasLiquid) {
                const slider = document.getElementById('lab-insp-fill');
                const valLbl = document.getElementById('lab-insp-fill-val');
                const pct = Math.round((item.fillLevel ?? 0) * 100);
                if (slider) slider.value = String(pct);
                if (valLbl) valLbl.textContent = pct + '%';

                const colorInput = document.getElementById('lab-insp-color-custom');
                if (colorInput) colorInput.value = item.liquidColor || '#38bdf8';

                document.querySelectorAll('#lab-insp-colors .lab-swatch').forEach(sw => {
                    sw.classList.toggle('active', sw.dataset.color === item.liquidColor);
                });
            }
        }

        // Ausguss-Steuerung
        const pourSection = document.getElementById('lab-insp-pour-section');
        if (pourSection) {
            pourSection.classList.toggle('hidden', !def.canPour);
            const mode = item.pourOverride || 'auto';
            pourSection.querySelectorAll('[data-pour-mode]').forEach(b => {
                b.classList.toggle('active', b.dataset.pourMode === mode);
            });
        }

        // Effekte (Dampf, Rauch, Blasen)
        const effSection = document.getElementById('lab-insp-effects-section');
        if (effSection) {
            effSection.classList.toggle('hidden', !def.hasEffects);
            const eff = item.effect || 'none';
            effSection.querySelectorAll('[data-lab-effect]').forEach(b => {
                b.classList.toggle('active', b.dataset.labEffect === eff);
            });
        }

        // Bunsenbrenner-Flamme / Herdplatten-Heizstufe
        const flameSection = document.getElementById('lab-insp-flame-section');
        if (flameSection) {
            flameSection.classList.toggle('hidden', !def.hasFlame);
            const fl = item.flame || def.defaultFlame || 'blue';
            const isHotplate = (item.type === 'hotplate');
            const headSpan = flameSection.querySelector('.lab-insp-row-head span');
            if (headSpan) headSpan.textContent = isHotplate ? 'Heizstufe' : 'Brenner-Flamme';
            flameSection.querySelectorAll('[data-lab-flame]').forEach(b => {
                b.classList.toggle('active', b.dataset.labFlame === fl);
                if (b.dataset.labFlame === 'yellow') b.textContent = isHotplate ? 'Warm' : 'Gelb';
                if (b.dataset.labFlame === 'blue') b.textContent = isHotplate ? 'Heiß' : 'Blau';
            });
        }

        // Stopfen
        const stopperBtn = document.getElementById('lab-insp-stopper');
        if (stopperBtn) {
            stopperBtn.classList.toggle('hidden', !def.hasStopper);
            stopperBtn.classList.toggle('active', !!item.stopper);
        }

        // Etikett / Beschriftung
        const labelSection = document.getElementById('lab-insp-label-section');
        if (labelSection) {
            labelSection.classList.toggle('hidden', !def.hasLabel);
            const lblInp = document.getElementById('lab-insp-label');
            if (lblInp && document.activeElement !== lblInp) {
                lblInp.value = item.label || '';
            }
        }
    }

    function openLabDrawer(open) {
        const drawer = document.getElementById('lab-catalog-drawer');
        if (!drawer) return;
        if (open) {
            drawer.classList.remove('hidden');
            renderLabCatalogGrid();
        } else {
            drawer.classList.add('hidden');
        }
    }

    function initLabUI() {
        // Kategorie-Tabs
        document.querySelectorAll('.lab-cat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeCategory = tab.dataset.labCat;
                document.querySelectorAll('.lab-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderLabCatalogGrid();
            });
        });

        // Katalog schließen / öffnen
        const btnCloseDrawer = document.getElementById('btn-close-lab-drawer');
        if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => openLabDrawer(false));

        const btnOpenCatalog = document.getElementById('btn-lab-open-catalog');
        if (btnOpenCatalog) {
            btnOpenCatalog.addEventListener('click', () => {
                const drawer = document.getElementById('lab-catalog-drawer');
                openLabDrawer(drawer && drawer.classList.contains('hidden'));
            });
        }

        // Farb-Palette im Inspektor generieren
        const colorWrap = document.getElementById('lab-insp-colors');
        if (colorWrap) {
            colorWrap.innerHTML = '';
            LAB_LIQUID_PRESETS.forEach(p => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'lab-swatch';
                b.dataset.color = p.color;
                b.title = p.name;
                b.style.backgroundColor = p.color;
                b.addEventListener('click', () => {
                    const item = getSelectedLabItem();
                    if (!item) return;
                    window.WebNotesApp.saveHistorySnapshot();
                    item.liquidColor = p.color;
                    window.WebNotesApp.redrawMainCanvas();
                    window.WebNotesApp.triggerPageAutoSave();
                    syncLabInspectorUI();
                });
                colorWrap.appendChild(b);
            });
        }

        // Custom-Farbe
        const customColor = document.getElementById('lab-insp-color-custom');
        if (customColor) {
            customColor.addEventListener('input', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                item.liquidColor = customColor.value;
                window.WebNotesApp.redrawMainCanvas();
            });
            customColor.addEventListener('change', () => {
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        }

        // Füllstand-Slider
        const fillSlider = document.getElementById('lab-insp-fill');
        if (fillSlider) {
            fillSlider.addEventListener('input', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                const pct = parseInt(fillSlider.value, 10) || 0;
                item.fillLevel = pct / 100;
                const valLbl = document.getElementById('lab-insp-fill-val');
                if (valLbl) valLbl.textContent = pct + '%';
                window.WebNotesApp.redrawMainCanvas();
            });
            fillSlider.addEventListener('change', () => {
                window.WebNotesApp.triggerPageAutoSave();
            });
        }

        // Ausguss-Modus
        document.querySelectorAll('[data-pour-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                window.WebNotesApp.saveHistorySnapshot();
                item.pourOverride = btn.dataset.pourMode;
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        });

        // Effekte (Dampf, Rauch, Blasen)
        document.querySelectorAll('[data-lab-effect]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                window.WebNotesApp.saveHistorySnapshot();
                item.effect = btn.dataset.labEffect;
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        });

        // Bunsenbrenner-Flamme
        document.querySelectorAll('[data-lab-flame]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                window.WebNotesApp.saveHistorySnapshot();
                item.flame = btn.dataset.labFlame;
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        });

        // Stopfen
        const stopperBtn = document.getElementById('lab-insp-stopper');
        if (stopperBtn) {
            stopperBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                window.WebNotesApp.saveHistorySnapshot();
                item.stopper = !item.stopper;
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        }

        // Spiegeln
        const flipBtn = document.getElementById('lab-insp-flip');
        if (flipBtn) {
            flipBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                window.WebNotesApp.saveHistorySnapshot();
                item.flipX = !item.flipX;
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
            });
        }

        // Nach vorn / Nach hinten
        const frontBtn = document.getElementById('lab-insp-front');
        if (frontBtn) {
            frontBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                const pageData = window.WebNotesApp.getCurrentPageData();
                if (!item || !pageData || !Array.isArray(pageData.labItems)) return;
                window.WebNotesApp.saveHistorySnapshot();
                pageData.labItems = pageData.labItems.filter(x => x.id !== item.id);
                pageData.labItems.push(item);
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
            });
        }
        const backBtn = document.getElementById('lab-insp-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                const pageData = window.WebNotesApp.getCurrentPageData();
                if (!item || !pageData || !Array.isArray(pageData.labItems)) return;
                window.WebNotesApp.saveHistorySnapshot();
                pageData.labItems = pageData.labItems.filter(x => x.id !== item.id);
                pageData.labItems.unshift(item);
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
            });
        }

        // Duplizieren
        const dupBtn = document.getElementById('lab-insp-duplicate');
        if (dupBtn) {
            dupBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                const pageData = window.WebNotesApp.getCurrentPageData();
                if (!item || !pageData) return;
                window.WebNotesApp.saveHistorySnapshot();
                const clone = {
                    ...item,
                    id: 'lab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    x: Math.min(window.WebNotesApp.PAGE_WIDTH - item.w - 10, item.x + 28),
                    y: Math.min(window.WebNotesApp.PAGE_HEIGHT - item.h - 10, item.y + 28)
                };
                pageData.labItems.push(clone);
                window.WebNotesApp.setSelectedLabId(clone.id);
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        }

        // Löschen
        const delBtn = document.getElementById('lab-insp-delete');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                const item = getSelectedLabItem();
                const pageData = window.WebNotesApp.getCurrentPageData();
                if (!item || !pageData) return;
                window.WebNotesApp.saveHistorySnapshot();
                pageData.labItems = (pageData.labItems || []).filter(x => x.id !== item.id);
                window.WebNotesApp.setSelectedLabId(null);
                window.WebNotesApp.redrawMainCanvas();
                window.WebNotesApp.triggerPageAutoSave();
                syncLabInspectorUI();
            });
        }

        // Etikett-Eingabe
        const lblInput = document.getElementById('lab-insp-label');
        if (lblInput) {
            lblInput.addEventListener('input', () => {
                const item = getSelectedLabItem();
                if (!item) return;
                item.label = lblInput.value;
                window.WebNotesApp.redrawMainCanvas();
            });
            lblInput.addEventListener('change', () => {
                window.WebNotesApp.triggerPageAutoSave();
            });
        }

        // Inspektor schließen
        const btnCloseInsp = document.getElementById('btn-close-lab-inspector');
        if (btnCloseInsp) {
            btnCloseInsp.addEventListener('click', () => {
                window.WebNotesApp.setSelectedLabId(null);
                syncLabInspectorUI();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', initLabUI);

    window.WebNotesLab = {
        CATALOG: LAB_CATALOG,
        CATALOG_BY_TYPE,
        drawLabObject,
        openLabDrawer,
        syncLabInspectorUI,
        insertLabItemOnCurrentPage
    };
})();

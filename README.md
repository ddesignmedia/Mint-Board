# 🧪 Mint-Board

> Digitales Tafel- & Notizheft für den MINT-Unterricht – optimiert für Wacom-Stiftdisplays (Windows) und iPad (Apple Pencil), mit integriertem Labor-Baukasten, Unterrichts-Widgets, PDF-Pipeline und Multi-Device-Sync.

<p align="center">
  <img src="https://img.shields.io/badge/Version-v0.0.2-informational?style=flat-square" alt="Version v0.0.2">
  <img src="https://img.shields.io/badge/Frontend-Vanilla_HTML5_%2F_CSS3_%2F_JS-F7DF1E?style=flat-square" alt="Vanilla Frontend">
  <img src="https://img.shields.io/badge/Backend-PHP_8.x_(JSON_Flat--File)-777BB4?style=flat-square&logo=php&logoColor=white" alt="PHP 8.x">
  <img src="https://img.shields.io/badge/Dependencies-Zero_External_CDNs-blue?style=flat-square" alt="Zero External CDNs">
  <img src="https://img.shields.io/badge/DSGVO-100%25_lokal_%26_self--hosted-success?style=flat-square" alt="DSGVO Konform">
</p>

<p align="center">
  <a href="https://ddesignmedia.github.io/Mint-Board/">
    <img src="https://img.shields.io/badge/🚀_Live_Demo_(GitHub_Pages)-Direkt_im_Browser_testen-2b579a?style=for-the-badge&logoColor=white" alt="Live Demo auf GitHub Pages">
  </a>
</p>

---

## 🚀 Direkt ausprobieren (GitHub Pages Demo)

Auf **GitHub Pages** startet Mint-Board automatisch im **lokalen Demo-Modus** (Browser-Speicher / `localStorage`, ohne PHP-Server):

👉 [**🌐 Mint-Board Live-Demo öffnen**](https://ddesignmedia.github.io/Mint-Board/)

* Alle Zeichen-, Text-, Labor-, Widget-, Bild- sowie PDF-Import- und Export-Funktionen können direkt getestet werden.
* Neue Hefte und Änderungen werden lokal im Browser gespeichert (gerätespezifisch, ohne Cloud-Sync).
* Für den produktiven Einsatz mit **Multi-Device-Sync** (z. B. Lehrer-PC ↔ iPad) einfach auf einem eigenen PHP-Webspace hosten.

---

## ✨ Kernfunktionen

* **🖊️ Ultra-Low-Latency Handschrift & Werkzeuge**
  * Füller, Fineliner, drucksensitiver Stift, Textmarker (mit Offscreen-Puffer ohne Überlagerungs-Artefakte), Radiergummi, Lasso-Auswahl, Formen & Textboxen.
  * Optimiert für Wacom Cintiq / Stiftdisplays unter Windows sowie iPad mit Apple Pencil.
* **📚 Schulheft- & Ordner-Verwaltung**
  * Beliebige Ordner und Hefte mit anpassbaren Buchcovern, Farben und Papiervorlagen (5 mm Karo, liniert, punktiert, blanko).
* **🧪 Integrierter MINT-Labor-Baukasten (`lab.js`)**
  * Vektorgrafik-Laborgeräte (Becherglas, Erlenmeyerkolben, Reagenzglas, Stativ, Bunsenbrenner u. v. m.) mit Füllständen, Farbstoff-Presets, Schwerkraft-Flüssigkeit beim Kippen, Ausguss-Effekt, Dampf/Gasblasen und Beschriftungen.
* **⏱️ Schwebende Unterrichts-Widgets (`widgets.js`)**
  * Bleiben fest im Sichtbereich und werden beim PDF-Export automatisch ausgeblendet (inkl. Countdown-Timer mit sanftem Web-Audio-Gong und integriertem Taschenrechner).
* **📄 Medien- & PDF-Pipeline**
  * Bilder einfügen per Datei-Dialog, Drag & Drop oder Zwischenablage (`Strg + V` / Snipping Tool).
  * **PDF-Import** (lokal via `pdf.js`) und **300-DPI PDF-Export** (lokal via `jsPDF`).
* **🔄 Granularer Multi-Device-Sync & Offline-Puffer (`api.php`)**
  * Atomares JSON-Speichern pro Seite, lokaler `localStorage`-Offline-Puffer bei instabilem Schul-WLAN und Stale-Tab-Konfliktschutz (`409 Conflict` mit Merge-Option).
* **🔒 100 % DSGVO-konform & Zero-CDN**
  * Keine externen Skripte, keine Schriftarten-CDNs, kein Tracking – alle Bibliotheken (`libs/`) liegen lokal.

---

## 🛠️ Installation (Self-Hosting mit PHP)

1. Alle Projektdateien (ohne `data/notebooks/`) auf einen Webspace mit **PHP 8.x** hochladen.
2. Sicherstellen, dass PHP im Verzeichnis `data/` Schreibrechte hat (die Verzeichnisse `data/` und `data/notebooks/` sowie der `.htaccess`-Schutz werden beim ersten Aufruf automatisch angelegt).
3. Optional: Falls die Bibliotheken im Ordner `libs/` fehlen, einmalig `setup_libs.php` aufrufen.
4. `index.html` im Browser öffnen – fertig!

> **Hinweis zum Datenschutz:** Der Ordner `data/` enthält eine eigene `.htaccess` (`Require all denied`), sodass gespeicherte Hefte nicht direkt per URL abrufbar sind. Bei öffentlichem Einsatz auf einem Webserver sollte das gesamte Verzeichnis zusätzlich durch ein Login-Portal oder HTTP-Basic-Auth geschützt werden.

---

## 📋 Changelog

### `v0.0.2`
* **Formen-Auswahlwerkzeug:** Erweitertes Auswahlmenü für geometrische Formen inkl. neuer Form **Merkkasten**
* **Neues Unterrichts-Widget:** Integrierter schwebender **Taschenrechner** (`widgets.js`)
* **Papier-Kontrast:** Angepasster Kontrast für Papiervorlagen (liniert, kariert usw.) für bessere Lesbarkeit auf Beamer & Tablet

### `v0.0.1`
* Initiales Release von **Mint-Board**
* Heft- & Ordner-Dashboard, Canvas-Editor, Labor-Baukasten (`lab.js`), schwebende Unterrichts-Widgets (`widgets.js`), PDF-Import & 300-DPI-Export
* Automatischer lokaler Demo-Modus für GitHub Pages / statisches Hosting
* Robuste Offline-Queue-Bereinigung bei gelöschten Heften (`404`-Handling)

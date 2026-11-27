# 🧪 Mint-Board

> Digitales Tafel- & Notizheft für den MINT-Unterricht – optimiert für Wacom-Stiftdisplays (Windows) und iPad (Apple Pencil), mit integriertem Labor-Baukasten, Unterrichts-Widgets, PDF-Pipeline und Multi-Device-Sync.

<p align="center">
  <img src="https://img.shields.io/badge/Version-v0.0.4-informational?style=flat-square" alt="Version v0.0.4">
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
* Neue Hefte und Änderungen werden lokal im Browser gespeichert (gerätespezifisch, ohne Cloud-Sync) – über **Einstellungen → Datensicherung** lassen sich alle Test-Hefte jederzeit als `.json`-Backup exportieren, wiederherstellen oder sogar auf einen eigenen PHP-Server übernehmen.
* Für den produktiven Einsatz mit **Multi-Device-Sync** (z. B. Lehrer-PC ↔ iPad) einfach auf einem eigenen PHP-Webspace hosten.

---

## ✨ Kernfunktionen

* **🖊️ Ultra-Low-Latency Handschrift & Werkzeuge**
  * Füller, Fineliner, drucksensitiver Stift, Textmarker (mit Offscreen-Puffer ohne Überlagerungs-Artefakte), Radiergummi, Lasso-Auswahl, Formen & Textboxen.
  * **Geometrie-Werkzeuge im exakten DIN-A4-Maßstab** (`1 cm = 2 Karos`): Interaktives Lineal, Geodreieck (mit Winkelmesser & Kanten-Einrasten an allen 3 Kanten) und Zirkel (Kreisbögen & Vollkreise).
  * Optimiert für Wacom Cintiq / Stiftdisplays unter Windows sowie iPad mit Apple Pencil (inkl. Zoom-Sperre gegen versehentliches Pinch-Zoomen beim Touch-Scrollen).
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

## 💾 Portabler Betrieb auf einem USB-Stick (Windows)

Mint-Board lässt sich komplett ohne Installation, ohne Admin-Rechte und ohne eigenen Webspace direkt von einem USB-Stick starten – ideal für wechselnde Lehrer-PCs im Klassenzimmer. Alle Hefte bleiben dabei direkt im Ordner `data/` auf dem Stick gespeichert.

### 1. Portables PHP herunterladen
1. Die offizielle Windows-Downloadseite öffnen: **[windows.php.net/download](https://windows.php.net/download/)**
2. Bei der aktuellen **PHP 8.x**-Version das **ZIP-Archiv** für **x64 Thread Safe** (z. B. `VS17 x64 Thread Safe` → *Zip*) herunterladen. *(Es ist kein Installer nötig – PHP läuft komplett portabel aus dem entpackten Ordner.)*

### 2. Ordnerstruktur auf dem USB-Stick anlegen
Auf dem USB-Stick einen Ordner (z. B. `Mint-Board-Portable`) anlegen und wie folgt befüllen:

```text
USB-Stick:\Mint-Board-Portable\
├── php\                  ← Inhalt des heruntergeladenen PHP-ZIP-Archivs hier entpacken
├── app\                  ← Alle Mint-Board-Dateien (index.html, api.php, app.js, libs/, ...)
└── Mint-Board-Start.bat  ← Start-Skript (wird in Schritt 4 erstellt)
```

### 3. `php.ini` für Uploads & Backups einrichten
Damit Bilder, PDFs und die 1-Klick-ZIP-Backups problemlos funktionieren, muss PHP kurz konfiguriert werden:

1. Im Ordner `php\` die Datei `php.ini-production` kopieren und die Kopie in **`php.ini`** umbenennen.
2. `php.ini` mit dem Windows-Editor (Notepad) öffnen und folgende Zeilen suchen, das führende Semikolon `;` entfernen und die Werte anpassen:

```ini
extension_dir = "ext"
extension=fileinfo
extension=zip

upload_max_filesize = 64M
post_max_size = 64M
memory_limit = 256M
```

3. Datei speichern und schließen.

### 4. Start-Skript (`Mint-Board-Start.bat`) erstellen
Im Hauptordner `Mint-Board-Portable\` eine neue Textdatei namens **`Mint-Board-Start.bat`** anlegen (darauf achten, dass die Endung wirklich `.bat` und nicht `.bat.txt` ist) und folgenden Inhalt speichern:

```bat
@echo off
title Mint-Board (USB-Stick)
echo Starte Mint-Board Server auf http://127.0.0.1:8080 ...
echo Dieses Fenster waehrend der Nutzung einfach minimiert offen lassen.
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
echo.
start "" http://127.0.0.1:8080
"%~dp0php\php.exe" -c "%~dp0php\php.ini" -S 127.0.0.1:8080 -t "%~dp0app"
```

> **Warum `%~dp0`?** Dadurch funktioniert das Skript automatisch unabhängig davon, welchen Laufwerksbuchstaben (`D:`, `E:`, `F:` …) Windows dem USB-Stick am jeweiligen PC zuweist.

### 5. Starten & Beenden
* **Starten:** Doppelklick auf `Mint-Board-Start.bat`. Der lokale PHP-Server startet und öffnet Mint-Board automatisch im Browser *(falls der Browser schneller war als der Serverstart, einmal `F5` drücken)*.
* **Beenden:** Nach dem Unterricht einfach das schwarze Konsolenfenster schließen und den USB-Stick über *„Hardware sicher entfernen“* auswerfen, damit alle Änderungen sauber auf den Stick geschrieben sind.

> **Hinweise:**
> * **Sicherheit:** Durch `127.0.0.1` ist der Server ausschließlich lokal auf dem jeweiligen PC erreichbar – andere Geräte im Schul-WLAN haben keinen Zugriff.
> * **Fehlende DLL-Meldung:** Falls auf einem älteren PC beim Start eine Meldung über eine fehlende `VCRUNTIME140.dll` erscheint, wird einmalig die [Microsoft Visual C++ Redistributable (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe) auf dem Rechner benötigt (auf aktuellen Windows-10/11-PCs in der Regel bereits vorinstalliert).

---

## 📋 Changelog

### `v0.0.4`
* **Komplett-Backup & Wiederherstellung (PHP-Server):** Neuer 1-Klick-Export aller Ordner, Hefte, Seiten und eingebetteten Bilder/PDFs als `.zip`-Archiv (`api.php?action=export_backup`) sowie sichere Wiederherstellung per Chunked-Upload (`1,5 MB`-Chunks für große Archive, Zip-Slip-Schutz, Dateityp-Whitelist & automatisches Rollback bei Fehlern)
* **Backup & Restore im GitHub-Pages Demo-Modus:** Test-Hefte & Ordner lassen sich lokal als `.json`-Backup sichern, wiederherstellen und bei Bedarf sogar direkt auf einen eigenen PHP-Server importieren
* **Zwei Wiederherstellungs-Modi:** Wahl zwischen **Zusammenführen (Merge)** (ergänzt fehlende Ordner & Hefte) und **Komplett ersetzen** (stellt exakt den Backup-Stand wieder her) direkt im Einstellungen-Dialog

### `v0.0.3`
* **Interaktives Geodreieck:** Klassisches Schul-Geodreieck mit farbigem Winkelmesser (Doppelskala), Parallellinien, Drehung exakt um den Nullpunkt und Stift-Einrasten an allen drei Kanten
* **Interaktiver Zirkel:** Frei positionierbare Nadelspitze, stufenlose Radiuseinstellung in cm (inkl. `0,5 cm`-Tasten), direktes Zeichnen präziser Kreisbögen mit Live-Winkelanzeige sowie Vollkreis-Button (`○ Kreis`)
* **Exakte DIN-A4-Maßstab-Synchronisation:** Karo- & Punktraster (`0,5 cm`), Lineal, Geodreieck und Zirkel nutzen exakt denselben Maßstab (`1 cm = 2 Karos bzw. 2 Punktabstände`) – auch beim 300-DPI PDF-Export
* **Zoom-Sperre & Zentrier-Buttons:** Schloss-Symbol in der Zoomleiste sperrt den Zoomfaktor beim 2-Finger-Touch-Scrollen (Panning bleibt aktiv); neue Buttons für horizontales und vertikales Zentrieren der Seite
* **UI-Fix (409 Sync-Konflikt-Dialog):** Flexiblere Button-Höhen und sauber gegliedertes Button-Layout ohne Textüberlauf

### `v0.0.2`
* **Formen-Auswahlwerkzeug:** Erweitertes Auswahlmenü für geometrische Formen inkl. neuer Form **Merkkasten**
* **Neues Unterrichts-Widget:** Integrierter schwebender **Taschenrechner** (`widgets.js`)
* **Papier-Kontrast:** Angepasster Kontrast für Papiervorlagen (liniert, kariert usw.) für bessere Lesbarkeit auf Beamer & Tablet

### `v0.0.1`
* Initiales Release von **Mint-Board**
* Heft- & Ordner-Dashboard, Canvas-Editor, Labor-Baukasten (`lab.js`), schwebende Unterrichts-Widgets (`widgets.js`), PDF-Import & 300-DPI-Export
* Automatischer lokaler Demo-Modus für GitHub Pages / statisches Hosting
* Robuste Offline-Queue-Bereinigung bei gelöschten Heften (`404`-Handling)

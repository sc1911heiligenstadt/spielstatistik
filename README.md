# Spielstatistik

Interne Web-Anwendung des 1. SC 1911 Heiligenstadt: Einsätze, Minuten, Tore und
Karten der Mannschaften — Saison für Saison.

Ein Spiel wird genau einmal erfasst: Startelf und Bank, Wechsel mit Minute, Tore mit
Schütze, Karten und der Grund, warum jemand fehlte. Daraus rechnet die Anwendung

- die gewohnte Tabelle aus Spieltagen und Spielern mit allen Summenzeilen,
- die Vereinsbilanz jedes Spielers über die Jahre hinweg,
- Auswertungen zu Team, Formationen und Einsatzzeiten,
- und den fertigen Spielbericht als Word-Datei samt Aufstellungsgrafik.

Sie löst die bisherigen Excel-Dateien „Statistik Saison …" und den handgeschriebenen
Word-Spielbericht ab.

## Technik

Vanilla JavaScript ohne Build-Step. Anmeldung und Speicherung laufen über den
zentralen Login-Gateway der Tools-Übersicht in die Vereins-Nextcloud. Einzige externe
Bibliothek ist JSZip (per CDN) für die Word-Datei.

| Datei | Inhalt |
|---|---|
| `index.html` | Aufbau der Oberfläche |
| `config.js` | Konstanten, Formationen, Versionshistorie |
| `db.js` | Anbindung an den Gateway |
| `stats.js` | sämtliche Berechnungen, ohne Oberfläche |
| `aufstellung.js` | Spielfeld und Aufstellungsgrafik |
| `docx-spielbericht.js` | Erzeugung der Word-Datei |
| `app.js` | Bedienlogik |
| `style.css` | Gestaltung |

## Zugang

Die Anwendung ist nur für einen festgelegten Personenkreis sichtbar, weil sie
festhält, wer verletzt oder krank gefehlt hat. Im Spielbericht erscheinen diese
Angaben nicht.

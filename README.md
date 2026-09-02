# 📊 Spielstatistik

Einsätze, Minuten, Tore und Karten der Mannschaften — Saison für Saison. Ein Spiel wird genau einmal erfasst: Startelf und Bank, Wechsel mit Minute, Tore mit Schütze, Karten und der Grund, warum jemand gefehlt hat. Alles Weitere rechnet die App daraus — die gewohnte Tabelle aus Spieltagen und Spielern samt Summenzeilen, die Vereinsbilanz jedes Spielers über die Jahre hinweg und den fertigen Spielbericht als Word-Datei mit Aufstellungsgrafik. Sie löst die Excel-Dateien „Statistik Saison …“ und den handgeschriebenen Word-Spielbericht ab.

**➡️ [Spielstatistik öffnen](https://sc1911heiligenstadt.github.io/spielstatistik/)**

## Wie es gedacht ist

1. Einmal je Saison stehen **Mannschaft, Kader und Wettbewerbe** fest. Testspiele zählen standardmäßig nicht in die Vereinsbilanz — das lässt sich je Wettbewerb umstellen.
2. Nach dem Spiel wird **einmal** erfasst: wer stand in der Startelf, wer auf der Bank, wer hat gefehlt und warum, dazu Wechsel mit Minute, Tore und Karten. Die Aufstellung wird auf einem Spielfeld gesetzt; eine Formation verteilt die Spieler vor, verschieben geht danach frei.
3. Die **Matrix** zeigt danach Spieltage und Spieler wie in der alten Excel — nur rechnet sie die Summen selbst.
4. Der **Spielbericht** entsteht auf Knopfdruck als Word-Datei, mit dem Spielfeld und der Aufstellung als Bild.

## Die Reiter

| Reiter | Wofür |
|---|---|
| **Spiele** | Spielliste je Wettbewerb, die Erfassungsmaske und der Word-Bericht; oben der Jubiläums-Hinweis |
| **Matrix** | Spieltage × Spieler wie in der alten Excel, Zellen direkt änderbar |
| **Spieler** | Eine Zeile je Spieler mit Saison- und Gesamtzahlen; ein Klick öffnet den Steckbrief |
| **Auswertung** | Punkteschnitt, Heim- und Auswärtsbilanz, Tore nach Spielabschnitten, Zuschauerschnitt, Bilanz je Formation |
| **Verwaltung** | Mannschaften, Saisons, Wettbewerbe, Kader, Spieler-Stammdaten, Nachträge, Import (nur Administrieren) |
| **Info** | Was die App tut, die Änderungen und der Datenschutz-Hinweis |

## Warum nur einmal getippt wird

In der alten Arbeitsweise stand dieselbe Tatsache an zwei Orten: der Word-Bericht sagte „Spieler B für Spieler A (61. Minute)“, die Excel sagte bei Spieler A `61(A)` und bei Spieler B `29(E)`. Nichts glich das ab. Hier ist der Wechsel die einzige Quelle — Minuten, Einsätze und Ein-/Auswechslungen werden daraus abgeleitet, nie zusätzlich gespeichert. Auch der Spielstand: er ergibt sich aus den erfassten Toren und lässt sich gar nicht falsch eintippen.

Aus demselben Grund hängt die Vereinsbilanz am Spieler und nicht an einer Spaltenposition: In der Excel war die Zeile mit den Karriere-Zahlen einmal nicht mitverschoben worden, seitdem stand ein Spieler auf den 280 Spielen eines anderen.

## Nachträge aus der alten Excel

Tore und Gelbe Karten, die in der alten Excel nur als Saison-Summe standen, lassen sich keinem einzelnen Spiel zuordnen. Sie stehen deshalb in der Verwaltung offen als **„Nachträge ohne Spielzuordnung“** und zählen in alle Bilanzen mit — statt still in einer Zelle zu verschwinden.

## Zugang

Die Anmeldung läuft über die [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) — dort einmal anmelden, danach ist dieses Werkzeug offen.

Die Rechte gelten in drei Stufen: **Sehen** (alle Zahlen und Berichte, schreibgeschützt), **Bearbeiten** (Spiele erfassen und ändern, Spielbericht erzeugen) und **Administrieren** (Mannschaften, Saisons, Wettbewerbe, Kader, Startwerte, Import und Löschen). Wer welche Stufe hat, legt die Tools-Übersicht fest.

⚠️ **Dieses Werkzeug ist nur für einen festgelegten Personenkreis sichtbar.** Es hält je Spiel fest, wer verletzt oder krank gefehlt hat — das sind Gesundheitsangaben. Im Spielbericht, der das Haus verlässt, erscheint der Grund nie.

Fällt die Anmeldung weg, während die App offen ist, wird der Bildschirm samt dem Einsatz-Dialog daneben geräumt; zurück geht es über ein Neuladen der Seite.

## Lokal starten

Über den Eintrag `spielstatistik` in `E:\.claude\launch.json` — der Server läuft dann auf `http://localhost:8814/`.

## Technik

| Datei | Zweck |
|---|---|
| `index.html` | sechs Reiter, ein Dialog für die einzelne Matrix-Zelle |
| `config.js` | Version, Rollen, Ausfallgründe, Kartenarten, Formationen, Changelog |
| `db.js` | Anbindung an das Gateway der Tools-Übersicht |
| `stats.js` | die Rechnerei — Minuten, Einsätze, Bilanzen, ohne Oberfläche |
| `aufstellung.js` | die Aufstellungsgrafik |
| `docx-spielbericht.js` | der Word-Bericht |
| `app.js` | Reiter, Masken, Rechte, Speichern |
| `style.css` | Gestaltung |

Vanilla JavaScript ohne Build-Schritt — die Dateien werden so ausgeliefert, wie sie im Repo liegen. Veröffentlicht über GitHub Pages. Die Daten liegen in der Vereins-Nextcloud; der Zugriff läuft ausschließlich über den Login-Worker der Tools-Übersicht, nie mit Zugangsdaten im Browser.

Die Berechnungen stehen bewusst getrennt von der Oberfläche in `stats.js` — dadurch lassen sie sich ohne Browser nachrechnen. Genau das ist beim Übernehmen der Altdaten geschehen: 384 Werte wurden gegen die Summenzeilen der alten Excel geprüft. Die fünf verbliebenen Abweichungen sind Rechenfehler der Excel selbst, unabhängig davon nachgerechnet. Einzige externe Bibliothek ist JSZip für die Word-Datei; sie wird erst beim ersten Bericht nachgeladen.

---

Ein Werkzeug des 1. SC 1911 Heiligenstadt. Alle Werkzeuge auf einen Blick: [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) · Erklärungen im [Toolbox Wiki](https://sc1911heiligenstadt.github.io/Vereinswiki/).

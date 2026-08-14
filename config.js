// Konstanten der Spielstatistik. APP_VERSION bleibt flottenweit auf "1.0" —
// neue Funktionen kommen als Changelog-Block dazu, nicht als neue Nummer.
const APP_VERSION = "1.0";

// Regel-Spieldauer. Einzelne Spiele duerfen davon abweichen (Verlaengerung im
// Pokal) — dann traegt das Spiel selbst eine `dauer`.
const STANDARD_SPIELDAUER = 90;

// Rolle eines Spielers in einem Spiel. Fehlt der Eintrag ganz, gehoerte er zu
// diesem Zeitpunkt nicht zum Kader (im alten Excel das "/").
const ROLLEN = [
  { id: "start", label: "Startelf", kurz: "Startelf" },
  { id: "ein", label: "Eingewechselt", kurz: "eingewechselt" },
  { id: "bank", label: "Bank (nicht eingesetzt)", kurz: "Bank" },
  { id: "fehlt", label: "Nicht dabei", kurz: "nicht dabei" }
];

// Gruende fuer "nicht dabei". `kurz` ist die Anzeige in der Matrix und
// entspricht bewusst den Kuerzeln aus dem bisherigen Excel.
const GRUENDE = [
  { id: "nichtKader", label: "Nicht im Kader", kurz: "n.K." },
  { id: "verletzt", label: "Verletzt", kurz: "verl." },
  { id: "krank", label: "Krank", kurz: "krank" },
  { id: "gesperrt", label: "Gesperrt", kurz: "gesp." },
  { id: "urlaub", label: "Urlaub", kurz: "Url." },
  { id: "sonstiges", label: "Sonstiges (mit Notiz)", kurz: "sonst." }
];

// Gesundheitsangaben. Wer die App sehen darf, sieht sie hier ohnehin — die
// Sichtbarkeit der GESAMTEN App ist eng gegated (siehe CLAUDE.md). Diese Liste
// steuert nur, was im Word-Bericht und im Ausdruck NIE auftaucht.
const GRUENDE_VERTRAULICH = ["verletzt", "krank"];

const KARTEN_ARTEN = [
  { id: "gelb", label: "Gelbe Karte", kurz: "GK", farbe: "#e5b80b" },
  { id: "gelbrot", label: "Gelb-Rote Karte", kurz: "GRK", farbe: "#e07b39" },
  { id: "rot", label: "Rote Karte", kurz: "RK", farbe: "#c0392b" }
];
// Ein Platzverweis beendet den Einsatz, zaehlt aber NICHT als Auswechslung —
// so rechnet auch das bisherige Excel (ein 63(GRK) eines Spielers steckt nicht
// in seinen Auswechslungen).
const PLATZVERWEIS_ARTEN = ["gelbrot", "rot"];

const TOR_ARTEN = [
  { id: "tor", label: "Tor" },
  { id: "elfmeter", label: "Elfmeter" },
  { id: "freistoss", label: "Freistoß" },
  { id: "kopfball", label: "Kopfball" },
  { id: "eigentor", label: "Eigentor" }
];

const WETTBEWERB_ARTEN = [
  { id: "liga", label: "Liga (Punktspiele)" },
  { id: "pokal", label: "Pokal" },
  { id: "test", label: "Testspiel / Freundschaftsspiel" },
  { id: "sonstiges", label: "Sonstiger Wettbewerb" }
];

// Startbestand beim Anlegen einer Saison. `zaehltKarriere` entscheidet, ob die
// Spiele in die Vereins-Gesamtbilanz einfliessen — Testspiele bewusst nicht,
// sonst verwaessern sie die Pflichtspiel-Zahlen.
const DEFAULT_WETTBEWERBE = [
  { name: "Liga", art: "liga", zaehltKarriere: true },
  { name: "Landespokal", art: "pokal", zaehltKarriere: true },
  { name: "Testspiele", art: "test", zaehltKarriere: false }
];

const POSITIONEN = ["TW", "IV", "LV", "RV", "DM", "ZM", "OM", "LA", "RA", "ST"];

// Spielfeld-Vorlagen fuer die Aufstellungsgrafik. Koordinaten in Prozent auf
// einem hochkant gezeichneten Feld: y = 0 ist das gegnerische Tor (oben),
// y = 100 das eigene (unten). `pos` ist nur ein Vorschlag fuer die Zuordnung.
const FORMATIONEN = [
  { id: "4-2-3-1", name: "4-2-3-1", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "LV", x: 13, y: 74 }, { pos: "IV", x: 36, y: 78 }, { pos: "IV", x: 64, y: 78 }, { pos: "RV", x: 87, y: 74 },
    { pos: "DM", x: 36, y: 58 }, { pos: "DM", x: 64, y: 58 },
    { pos: "LA", x: 15, y: 39 }, { pos: "OM", x: 50, y: 39 }, { pos: "RA", x: 85, y: 39 },
    { pos: "ST", x: 50, y: 18 }
  ] },
  { id: "4-4-2", name: "4-4-2", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "LV", x: 13, y: 74 }, { pos: "IV", x: 36, y: 78 }, { pos: "IV", x: 64, y: 78 }, { pos: "RV", x: 87, y: 74 },
    { pos: "LM", x: 13, y: 50 }, { pos: "ZM", x: 38, y: 53 }, { pos: "ZM", x: 62, y: 53 }, { pos: "RM", x: 87, y: 50 },
    { pos: "ST", x: 38, y: 22 }, { pos: "ST", x: 62, y: 22 }
  ] },
  { id: "4-3-3", name: "4-3-3", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "LV", x: 13, y: 74 }, { pos: "IV", x: 36, y: 78 }, { pos: "IV", x: 64, y: 78 }, { pos: "RV", x: 87, y: 74 },
    { pos: "ZM", x: 30, y: 55 }, { pos: "DM", x: 50, y: 61 }, { pos: "ZM", x: 70, y: 55 },
    { pos: "LA", x: 16, y: 26 }, { pos: "ST", x: 50, y: 18 }, { pos: "RA", x: 84, y: 26 }
  ] },
  { id: "4-1-4-1", name: "4-1-4-1", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "LV", x: 13, y: 74 }, { pos: "IV", x: 36, y: 78 }, { pos: "IV", x: 64, y: 78 }, { pos: "RV", x: 87, y: 74 },
    { pos: "DM", x: 50, y: 62 },
    { pos: "LM", x: 13, y: 44 }, { pos: "ZM", x: 38, y: 46 }, { pos: "ZM", x: 62, y: 46 }, { pos: "RM", x: 87, y: 44 },
    { pos: "ST", x: 50, y: 20 }
  ] },
  { id: "3-5-2", name: "3-5-2", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "IV", x: 26, y: 78 }, { pos: "IV", x: 50, y: 80 }, { pos: "IV", x: 74, y: 78 },
    { pos: "LM", x: 10, y: 52 }, { pos: "ZM", x: 33, y: 56 }, { pos: "ZM", x: 50, y: 60 }, { pos: "ZM", x: 67, y: 56 }, { pos: "RM", x: 90, y: 52 },
    { pos: "ST", x: 38, y: 22 }, { pos: "ST", x: 62, y: 22 }
  ] },
  { id: "3-4-3", name: "3-4-3", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "IV", x: 26, y: 78 }, { pos: "IV", x: 50, y: 80 }, { pos: "IV", x: 74, y: 78 },
    { pos: "LM", x: 12, y: 55 }, { pos: "ZM", x: 38, y: 58 }, { pos: "ZM", x: 62, y: 58 }, { pos: "RM", x: 88, y: 55 },
    { pos: "LA", x: 18, y: 26 }, { pos: "ST", x: 50, y: 19 }, { pos: "RA", x: 82, y: 26 }
  ] },
  { id: "5-3-2", name: "5-3-2", plaetze: [
    { pos: "TW", x: 50, y: 92 },
    { pos: "LV", x: 9, y: 66 }, { pos: "IV", x: 29, y: 79 }, { pos: "IV", x: 50, y: 82 }, { pos: "IV", x: 71, y: 79 }, { pos: "RV", x: 91, y: 66 },
    { pos: "ZM", x: 30, y: 52 }, { pos: "ZM", x: 50, y: 56 }, { pos: "ZM", x: 70, y: 52 },
    { pos: "ST", x: 38, y: 22 }, { pos: "ST", x: 62, y: 22 }
  ] }
];
const DEFAULT_FORMATION = "4-2-3-1";

// Groesse der erzeugten Aufstellungsgrafik (hochkant, Seitenverhaeltnis eines
// Spielfelds 68:105). Landet unveraendert im Word-Bericht.
const GRAFIK_BREITE = 760;
const GRAFIK_HOEHE = 1040;

// Schwellen fuer den Jubilaeums-Hinweis: steht ein Spieler vor einem dieser
// Werte, meldet die App das vor dem naechsten Spiel.
const JUBILAEUM_SPIELE_SCHRITT = 50;
const JUBILAEUM_TORE_SCHRITT = 25;

const VEREIN_NAME = "Heiligenstadt";

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Spielstatistik",
        items: [
          "Löst die bisherigen Excel-Dateien „Statistik Saison …“ ab: Einsätze, Minuten, Tore und Karten der 1. Mannschaft, Saison für Saison.",
          "Ein Spiel wird genau einmal erfasst. Spiele, Minuten, Ein- und Auswechslungen rechnet die App daraus selbst aus — nichts wird doppelt getippt.",
          "Mehrere Mannschaften und mehrere Saisons, umschaltbar in der Kopfzeile.",
          "Wettbewerbe je Saison frei anlegbar: Liga, Landespokal, Testspiele, weitere Pokale. Je Wettbewerb eine eigene Statistik.",
          "Testspiele zählen bewusst nicht in die Vereins-Gesamtbilanz — pro Wettbewerb einstellbar."
        ]
      },
      {
        title: "Spielbericht erfassen",
        items: [
          "Eine Maske je Spiel: Startelf und Bank anhaken, Wechsel mit Minute, Tore mit Minute und Schütze, Karten, dazu je fehlendem Spieler ein Grund.",
          "Die Aufstellung wird auf einem Spielfeld gesetzt — Formation auswählen, Spieler landen automatisch auf den Plätzen und lassen sich verschieben.",
          "Der Spielstand ergibt sich aus den erfassten Toren; ein falsch getipptes Ergebnis kann es gar nicht geben."
        ]
      },
      {
        title: "Matrix wie im Excel",
        items: [
          "Die gewohnte Tabelle Spieltag × Spieler mit „90“, „61(A)“ und „29(E)“ — nur dass die Summenzeilen sich selbst rechnen.",
          "Einzelne Zellen lassen sich direkt in der Matrix ändern, für Nachträge.",
          "Ein Wechsel, dessen Gegenstück noch fehlt, wird als offen markiert statt stillschweigend geschluckt."
        ]
      },
      {
        title: "Word-Spielbericht",
        items: [
          "Aus den erfassten Daten fällt der fertige Spielbericht als Word-Datei heraus: Ergebnis, Datum, Ort, Karten, Tore, Wechsel, Schiedsrichter, Zuschauer und die Aufstellungsgrafik.",
          "Bericht und Statistik können nicht auseinanderlaufen, weil beide aus derselben Eingabe stammen.",
          "Ausfallgründe wie „verletzt“ oder „krank“ stehen nie im Bericht."
        ]
      },
      {
        title: "Auswertungen",
        items: [
          "Spieler-Steckbrief über alle Saisons: Einsätze, Minuten, Tore, Karten, Ausfälle und die Bilanz beim Verein.",
          "Karriere-Zahlen hängen am Spieler, nicht an einer Tabellenspalte — verrutschen können sie nicht mehr.",
          "Jubiläums-Hinweis vor dem nächsten Spiel: wer vor seinem 50., 100., 650. Spiel oder einem runden Tor steht.",
          "Einsatzquote, Startelf-Quote und verpasste Spiele nach Grund.",
          "Team-Auswertung: Punkteschnitt, Heim- und Auswärtsbilanz, Tore nach Spielabschnitten, Zuschauerschnitt und die Bilanz je Formation."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Die App ist nur für eine festgelegte Gruppe überhaupt sichtbar — sie enthält Angaben zu Verletzung und Krankheit.",
          "Sehen: alle Zahlen und Berichte, schreibgeschützt.",
          "Bearbeiten: Spiele erfassen und ändern, Word-Bericht erzeugen.",
          "Administrieren: Mannschaften, Saisons, Wettbewerbe, Kader, Karriere-Startwerte, Import und Löschen.",
          "Der Reiter „Info“ ist für alle sichtbar."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Gespeichert wird in der Vereins-Nextcloud über die zentrale Anmeldung der Tools-Übersicht — ein eigenes Passwort braucht es nicht.",
          "Ändern zwei Geräte gleichzeitig denselben Stand, erkennt die App das, lädt den fremden Stand nach und sagt Bescheid."
        ]
      }
    ]
  }
];

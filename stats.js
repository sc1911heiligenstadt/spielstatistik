// Alle Ableitungen der Spielstatistik. Bewusst frei von DOM und globalem
// Zustand: die Funktionen bekommen ihre Daten uebergeben und geben Zahlen
// zurueck. Nur so laesst sich der Bestand gegen die alten Excel-Summen
// nachrechnen, ohne die App zu starten.
//
// GRUNDSATZ: gespeichert werden Ereignisse, nie Kennzahlen.
//   * Wer wann rein- und rausging, steht ausschliesslich in `spiel.wechsel`.
//   * `einsaetze[spielerId]` traegt nur Rolle und Ausfallgrund.
//   * Minuten, Spiele, Ein-/Auswechslungen, Ergebnis: hier gerechnet.
// Wer eine Zahl zusaetzlich ablegen will, macht damit zwei Wahrheiten auf.

const Stats = (() => {

  function clampMinute(m, dauer) {
    const n = Number(m);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(dauer, Math.round(n)));
  }

  function spieldauer(spiel, saison) {
    const d = Number(spiel && spiel.dauer);
    if (isFinite(d) && d > 0) return d;
    const s = Number(saison && saison.spieldauer);
    return (isFinite(s) && s > 0) ? s : STANDARD_SPIELDAUER;
  }

  // ---------- Einsatz eines Spielers in EINEM Spiel ----------
  // Liefert null, wenn der Spieler zu diesem Zeitpunkt gar nicht zum Kader
  // gehoerte (im alten Excel das "/"). Sonst:
  //   rolle, grund, ab, bis, minuten, eingewechselt, ausgewechselt,
  //   platzverweis, unvollstaendig
  //
  // `unvollstaendig` heisst: die Rolle sagt "eingewechselt", aber der zugehoerige
  // Wechsel fehlt. Das kann nur durch einen halb erfassten Nachtrag entstehen.
  // Solche Einsaetze werden NICHT still mitgezaehlt, sondern sichtbar markiert —
  // eine geratene Minutenzahl waere schlimmer als eine fehlende.
  function einsatz(spiel, spielerId, dauer) {
    const eintrag = (spiel.einsaetze || {})[spielerId];
    if (!eintrag) return null;
    const res = {
      rolle: eintrag.rolle || "fehlt",
      grund: eintrag.grund || "",
      grundText: eintrag.grundText || "",
      ab: null, bis: null, minuten: 0,
      eingewechselt: false, ausgewechselt: false,
      platzverweis: null, unvollstaendig: false
    };
    if (res.rolle !== "start" && res.rolle !== "ein") return res;

    const wechsel = Array.isArray(spiel.wechsel) ? spiel.wechsel : [];

    if (res.rolle === "ein") {
      const rein = wechsel.filter((w) => w.reinId === spielerId)
        .sort((a, b) => a.minute - b.minute)[0];
      if (!rein) { res.unvollstaendig = true; return res; }
      res.ab = clampMinute(rein.minute, dauer);
      res.eingewechselt = true;
    } else {
      res.ab = 0;
    }

    let bis = dauer;
    const raus = wechsel.filter((w) => w.rausId === spielerId && clampMinute(w.minute, dauer) >= res.ab)
      .sort((a, b) => a.minute - b.minute)[0];
    if (raus) { bis = clampMinute(raus.minute, dauer); res.ausgewechselt = true; }

    // Ein Platzverweis beendet den Einsatz ebenfalls — zaehlt aber NICHT als
    // Auswechslung. Genau so rechnet das bisherige Excel.
    const pv = (Array.isArray(spiel.karten) ? spiel.karten : [])
      .filter((k) => k.spielerId === spielerId && PLATZVERWEIS_ARTEN.indexOf(k.art) !== -1)
      .sort((a, b) => a.minute - b.minute)[0];
    if (pv) {
      const m = clampMinute(pv.minute, dauer);
      res.platzverweis = pv.art;
      if (m < bis) { bis = m; res.ausgewechselt = false; }
    }

    res.bis = bis;
    res.minuten = Math.max(0, bis - res.ab);
    return res;
  }

  // Kurzschreibweise fuer die Matrix — dieselbe Sprache wie im alten Excel.
  function matrixText(e) {
    if (!e) return "/";
    if (e.unvollstaendig) return "?";
    if (e.rolle === "bank") return "Bank";
    if (e.rolle === "fehlt") {
      const g = GRUENDE.find((x) => x.id === e.grund);
      return g ? g.kurz : "—";
    }
    let suffix = "";
    if (e.platzverweis) suffix = "(" + (KARTEN_ARTEN.find((k) => k.id === e.platzverweis) || {}).kurz + ")";
    else if (e.rolle === "ein" && e.ausgewechselt) suffix = "(E/A)";
    else if (e.rolle === "ein") suffix = "(E)";
    else if (e.ausgewechselt) suffix = "(A)";
    return String(e.minuten) + suffix;
  }

  // ---------- Ergebnis eines Spiels ----------
  function ergebnis(spiel) {
    let eigene = 0, gegner = 0;
    for (const t of (spiel.tore || [])) { if (t.fuerUns) eigene++; else gegner++; }
    return { eigene, gegner };
  }
  function ergebnisText(spiel) {
    const e = ergebnis(spiel);
    return e.eigene + ":" + e.gegner;
  }
  // Punkte aus Sicht der eigenen Mannschaft (nur sinnvoll bei Ligaspielen).
  function punkte(spiel) {
    const e = ergebnis(spiel);
    if (e.eigene > e.gegner) return 3;
    if (e.eigene === e.gegner) return 1;
    return 0;
  }
  // Ist das Spiel schon gespielt? Ohne Datum in der Vergangenheit und ohne
  // jeden Einsatz ist es ein blosser Spielplan-Eintrag und faellt aus jeder
  // Statistik heraus.
  function istGespielt(spiel) {
    if (spiel.gespielt === false) return false;
    const hatEinsatz = spiel.einsaetze && Object.keys(spiel.einsaetze)
      .some((id) => ["start", "ein"].indexOf(spiel.einsaetze[id].rolle) !== -1);
    return !!hatEinsatz;
  }

  // ---------- Wechsel-Paare ----------
  // Ein Wechsel-Eintrag darf eine offene Seite haben (`rausId` oder `reinId`
  // null). Das ist der Preis dafuer, dass die Matrix eine einzelne Zelle
  // aendern darf, ohne den Partner zu kennen — und es ist ehrlicher, als sich
  // einen auszudenken. Der Word-Bericht druckt nur vollstaendige Paare.
  function offeneWechsel(spiel) {
    return (spiel.wechsel || []).filter((w) => !w.rausId || !w.reinId);
  }

  // ---------- Bilanz eines Spielers ueber eine Menge Spiele ----------
  function leereBilanz() {
    return {
      spiele: 0, minuten: 0, startelf: 0, ein: 0, aus: 0, kader: 0,
      tore: 0, vorlagen: 0, eigentore: 0,
      gelb: 0, gelbrot: 0, rot: 0,
      ausfaelle: {}, ausfaelleGesamt: 0, unvollstaendig: 0,
      moeglicheMinuten: 0, moeglicheSpiele: 0
    };
  }

  function addNachtrag(bilanz, nachtraege, spielerId, wettbewerbIds) {
    for (const n of (nachtraege || [])) {
      if (n.spielerId !== spielerId) continue;
      if (wettbewerbIds && wettbewerbIds.indexOf(n.wettbewerbId) === -1) continue;
      bilanz.tore += Number(n.tore) || 0;
      bilanz.vorlagen += Number(n.vorlagen) || 0;
      bilanz.gelb += Number(n.gelb) || 0;
      bilanz.gelbrot += Number(n.gelbrot) || 0;
      bilanz.rot += Number(n.rot) || 0;
    }
    return bilanz;
  }

  // `spiele` sind bereits gefiltert (Wettbewerb/Saison). `saison` liefert nur
  // die Regel-Spieldauer.
  function bilanzSpieler(spiele, spielerId, saison) {
    const b = leereBilanz();
    for (const s of spiele) {
      if (!istGespielt(s)) continue;
      const d = spieldauer(s, saison);
      b.moeglicheSpiele++;
      b.moeglicheMinuten += d;

      const e = einsatz(s, spielerId, d);
      if (e) {
        if (e.unvollstaendig) b.unvollstaendig++;
        if (e.rolle === "start" || e.rolle === "ein") {
          if (!e.unvollstaendig) { b.spiele++; b.minuten += e.minuten; }
          if (e.rolle === "start") b.startelf++;
          if (e.eingewechselt) b.ein++;
          if (e.ausgewechselt) b.aus++;
          b.kader++;
        } else if (e.rolle === "bank") {
          b.kader++;
        } else if (e.rolle === "fehlt") {
          const g = e.grund || "sonstiges";
          b.ausfaelle[g] = (b.ausfaelle[g] || 0) + 1;
          b.ausfaelleGesamt++;
        }
      }

      for (const t of (s.tore || [])) {
        if (t.schuetzeId !== spielerId) continue;
        if (t.art === "eigentor") b.eigentore++; else b.tore++;
      }
      for (const t of (s.tore || [])) {
        if (t.vorlageId === spielerId && t.art !== "eigentor") b.vorlagen++;
      }
      for (const k of (s.karten || [])) {
        if (k.spielerId !== spielerId) continue;
        if (k.art === "gelb") b.gelb++;
        else if (k.art === "gelbrot") b.gelbrot++;
        else if (k.art === "rot") b.rot++;
      }
    }
    return b;
  }

  function einsatzquote(b) {
    if (!b.moeglicheMinuten) return 0;
    return b.minuten / b.moeglicheMinuten;
  }

  // ---------- Spiele einer Saison filtern ----------
  function spieleDerSaison(saison, wettbewerbId) {
    const alle = Array.isArray(saison.spiele) ? saison.spiele : [];
    if (!wettbewerbId) return alle;
    return alle.filter((s) => s.wettbewerbId === wettbewerbId);
  }

  // ---------- Welche Wettbewerbe zaehlen? ----------
  // `zaehltKarriere` ist die einzige Achse dafuer, ob ein Wettbewerb in eine
  // Bilanz eingeht. Testspiele stehen per Voreinstellung draussen: sie sollen
  // weder die Vereinsbilanz noch die Saisonzahlen im Spieler-Reiter aufblaehen.
  // Wer die Testspiele einzeln sehen will, waehlt sie als Wettbewerb aus —
  // dort werden sie weiterhin voll gerechnet.
  function zaehlendeWettbewerbIds(saison) {
    return ((saison && saison.wettbewerbe) || []).filter((w) => w.zaehltKarriere).map((w) => w.id);
  }
  function zaehlendeSpiele(saison) {
    const ids = zaehlendeWettbewerbIds(saison);
    return ((saison && saison.spiele) || []).filter((s) => ids.indexOf(s.wettbewerbId) !== -1);
  }

  // ---------- Karriere ueber alle Saisons ----------
  // Zaehlt nur Wettbewerbe mit `zaehltKarriere`. `spieler.start` ist der Stand
  // VOR der ersten erfassten Saison und haengt am Spieler — nicht an einer
  // Tabellenspalte. Genau daran ist die alte Excel gescheitert.
  function karriere(spieler, saisons) {
    const b = leereBilanz();
    for (const saison of saisons) {
      const ids = zaehlendeWettbewerbIds(saison);
      if (!ids.length) continue;
      const spiele = zaehlendeSpiele(saison);
      const teil = bilanzSpieler(spiele, spieler.id, saison);
      addNachtrag(teil, saison.nachtraege, spieler.id, ids);
      for (const k of ["spiele", "minuten", "startelf", "ein", "aus", "kader",
                       "tore", "vorlagen", "eigentore", "gelb", "gelbrot", "rot",
                       "ausfaelleGesamt", "unvollstaendig"]) b[k] += teil[k];
      for (const g of Object.keys(teil.ausfaelle)) b.ausfaelle[g] = (b.ausfaelle[g] || 0) + teil.ausfaelle[g];
    }
    const start = (spieler && spieler.start) || {};
    b.spiele += Number(start.spiele) || 0;
    b.tore += Number(start.tore) || 0;
    return b;
  }

  // ---------- Jubilaeen ----------
  // Meldet, wer mit dem naechsten Einsatz bzw. Tor eine runde Marke erreicht.
  function jubilaeen(spieler, saisons, kaderIds) {
    const treffer = [];
    for (const s of spieler) {
      if (kaderIds && kaderIds.indexOf(s.id) === -1) continue;
      const k = karriere(s, saisons);
      if (k.spiele > 0 && (k.spiele + 1) % JUBILAEUM_SPIELE_SCHRITT === 0) {
        treffer.push({ spielerId: s.id, art: "spiele", wert: k.spiele + 1 });
      }
      if (k.tore > 0 && (k.tore + 1) % JUBILAEUM_TORE_SCHRITT === 0) {
        treffer.push({ spielerId: s.id, art: "tore", wert: k.tore + 1 });
      }
    }
    return treffer;
  }

  // ---------- Team-Auswertung ----------
  const ABSCHNITTE = [
    { von: 1, bis: 15 }, { von: 16, bis: 30 }, { von: 31, bis: 45 },
    { von: 46, bis: 60 }, { von: 61, bis: 75 }, { von: 76, bis: 999 }
  ];
  function abschnittLabel(a) {
    return a.bis > 900 ? a.von + ".–Ende" : a.von + ".–" + a.bis + ".";
  }

  function teamBilanz(spiele) {
    const gespielt = spiele.filter(istGespielt);
    const res = {
      spiele: gespielt.length, siege: 0, remis: 0, niederlagen: 0,
      tore: 0, gegentore: 0, punkte: 0,
      heim: { spiele: 0, siege: 0, remis: 0, niederlagen: 0, tore: 0, gegentore: 0, punkte: 0 },
      auswaerts: { spiele: 0, siege: 0, remis: 0, niederlagen: 0, tore: 0, gegentore: 0, punkte: 0 },
      zuschauerSumme: 0, zuschauerSpiele: 0,
      toreAbschnitt: ABSCHNITTE.map(() => 0),
      gegentoreAbschnitt: ABSCHNITTE.map(() => 0),
      formationen: {}
    };
    for (const s of gespielt) {
      const e = ergebnis(s);
      const p = punkte(s);
      const seite = s.heim ? res.heim : res.auswaerts;
      res.tore += e.eigene; res.gegentore += e.gegner; res.punkte += p;
      seite.spiele++; seite.tore += e.eigene; seite.gegentore += e.gegner; seite.punkte += p;
      if (p === 3) { res.siege++; seite.siege++; }
      else if (p === 1) { res.remis++; seite.remis++; }
      else { res.niederlagen++; seite.niederlagen++; }

      const z = Number(s.zuschauer);
      if (isFinite(z) && z > 0) { res.zuschauerSumme += z; res.zuschauerSpiele++; }

      for (const t of (s.tore || [])) {
        const idx = ABSCHNITTE.findIndex((a) => t.minute >= a.von && t.minute <= a.bis);
        if (idx < 0) continue;
        if (t.fuerUns) res.toreAbschnitt[idx]++; else res.gegentoreAbschnitt[idx]++;
      }

      const f = s.formation || "—";
      if (!res.formationen[f]) res.formationen[f] = { spiele: 0, punkte: 0, tore: 0, gegentore: 0 };
      res.formationen[f].spiele++;
      res.formationen[f].punkte += p;
      res.formationen[f].tore += e.eigene;
      res.formationen[f].gegentore += e.gegner;
    }
    res.punkteschnitt = res.spiele ? res.punkte / res.spiele : 0;
    res.zuschauerschnitt = res.zuschauerSpiele ? Math.round(res.zuschauerSumme / res.zuschauerSpiele) : 0;
    return res;
  }

  // ---------- Torjaeger / Rangliste ----------
  function rangliste(spiele, spielerIds, saison, feld) {
    return spielerIds
      .map((id) => ({ spielerId: id, bilanz: bilanzSpieler(spiele, id, saison) }))
      .sort((a, b) => (b.bilanz[feld] - a.bilanz[feld]) || (b.bilanz.minuten - a.bilanz.minuten));
  }

  return {
    clampMinute, spieldauer, einsatz, matrixText,
    ergebnis, ergebnisText, punkte, istGespielt, offeneWechsel,
    leereBilanz, bilanzSpieler, addNachtrag, einsatzquote, spieleDerSaison,
    zaehlendeWettbewerbIds, zaehlendeSpiele,
    karriere, jubilaeen, teamBilanz, rangliste,
    ABSCHNITTE, abschnittLabel
  };
})();

// Damit der Prüfstand die Datei auch ausserhalb des Browsers laden kann.
if (typeof module !== "undefined" && module.exports) module.exports = { Stats };

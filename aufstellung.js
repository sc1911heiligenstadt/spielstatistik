// Aufstellungsgrafik: dieselbe Startelf einmal als bedienbares Spielfeld im
// Browser und einmal als PNG fuer den Word-Bericht.
//
// Koordinaten liegen in Prozent (x/y, 0–100) auf einem hochkant gedachten Feld,
// y = 100 ist das eigene Tor. Damit ist die Darstellung von der Pixelgroesse
// unabhaengig — Bildschirm und PNG teilen sich dieselben Zahlen.
//
// Muster fuer das Ziehen uebernommen aus E:\kadermanager\app.js (renderAufstellung,
// Pointer-Drag mit Prozentkoordinaten). Bewusst kopiert statt geteilt: getrennte
// Repos, kein Build-Step.

const Aufstellung = (() => {

  function formation(id) {
    return FORMATIONEN.find((f) => f.id === id) || FORMATIONEN.find((f) => f.id === DEFAULT_FORMATION);
  }

  // Verteilt eine Startelf auf die Plaetze einer Formation. Spieler mit
  // passender Position werden bevorzugt gesetzt, der Rest fuellt der Reihe nach
  // auf — der Trainer schiebt danach zurecht.
  function verteile(spielerIds, formationId, spielerById) {
    const f = formation(formationId);
    const offen = spielerIds.slice();
    const feld = [];
    for (const platz of f.plaetze) {
      let idx = offen.findIndex((id) => {
        const s = spielerById[id];
        return s && s.position && s.position === platz.pos;
      });
      if (idx < 0) idx = 0;
      if (!offen.length) break;
      const id = offen.splice(idx, 1)[0];
      feld.push({ spielerId: id, x: platz.x, y: platz.y });
    }
    // Mehr Spieler als Plaetze (sollte nicht vorkommen): unten anreihen.
    offen.forEach((id, i) => feld.push({ spielerId: id, x: 10 + i * 12, y: 50 }));
    return feld;
  }

  function kuerzel(spieler) {
    if (!spieler) return "?";
    const v = (spieler.vorname || "").trim();
    const n = (spieler.nachname || "").trim();
    if (!n) return v || "?";
    return (v ? v.charAt(0) + ". " : "") + n;
  }

  // ---------- Bildschirm ----------
  // `feldEl` ist ein positioniertes Element mit Spielfeld-Hintergrund. Die Chips
  // werden absolut darin platziert; das Ziehen schreibt die Prozentwerte zurueck
  // und ruft `onChange`.
  function renderFeld(feldEl, feldDaten, spielerById, opts) {
    const bearbeitbar = !!(opts && opts.bearbeitbar);
    feldEl.querySelectorAll(".feld-chip").forEach((el) => el.remove());
    for (const p of feldDaten) {
      const s = spielerById[p.spielerId];
      const chip = document.createElement("div");
      chip.className = "feld-chip";
      chip.dataset.spieler = p.spielerId;
      chip.style.left = p.x + "%";
      chip.style.top = p.y + "%";
      chip.innerHTML =
        '<span class="fc-nummer">' + (s && s.nummer ? String(s.nummer) : "") + "</span>" +
        '<span class="fc-name"></span>';
      chip.querySelector(".fc-name").textContent = kuerzel(s);
      if (bearbeitbar) {
        chip.classList.add("is-draggable");
        chip.addEventListener("pointerdown", (e) => starteDrag(e, feldEl, feldDaten, opts));
      }
      feldEl.appendChild(chip);
    }
  }

  let drag = null;
  function starteDrag(e, feldEl, feldDaten, opts) {
    const chip = e.currentTarget;
    chip.setPointerCapture(e.pointerId);
    drag = { chip, spielerId: chip.dataset.spieler, feldEl, feldDaten, opts };
    chip.classList.add("dragging");
    const move = (ev) => {
      if (!drag) return;
      const r = feldEl.getBoundingClientRect();
      const x = Math.max(3, Math.min(97, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.max(3, Math.min(97, ((ev.clientY - r.top) / r.height) * 100));
      chip.style.left = x + "%";
      chip.style.top = y + "%";
      drag.x = x; drag.y = y;
    };
    const up = () => {
      chip.removeEventListener("pointermove", move);
      chip.removeEventListener("pointerup", up);
      chip.removeEventListener("pointercancel", up);
      chip.classList.remove("dragging");
      if (drag && drag.x != null) {
        const eintrag = drag.feldDaten.find((p) => p.spielerId === drag.spielerId);
        if (eintrag) { eintrag.x = Math.round(drag.x); eintrag.y = Math.round(drag.y); }
        if (drag.opts && drag.opts.onChange) drag.opts.onChange();
      }
      drag = null;
    };
    chip.addEventListener("pointermove", move);
    chip.addEventListener("pointerup", up);
    chip.addEventListener("pointercancel", up);
  }

  // ---------- PNG fuer den Word-Bericht ----------
  function zeichneFeld(ctx, w, h) {
    ctx.fillStyle = "#2f8f4e";
    ctx.fillRect(0, 0, w, h);
    // Querstreifen — machen das Feld auf dem Ausdruck als Rasen lesbar.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    const streifen = 10;
    for (let i = 0; i < streifen; i += 2) ctx.fillRect(0, (h / streifen) * i, w, h / streifen);

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(2, Math.round(w / 260));
    const m = Math.round(w * 0.04);
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.beginPath(); ctx.moveTo(m, h / 2); ctx.lineTo(w - m, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.13, 0, Math.PI * 2); ctx.stroke();

    // Straf- und Torraum oben und unten
    const sw = w * 0.58, sh = h * 0.15, tw = w * 0.28, th = h * 0.06;
    ctx.strokeRect((w - sw) / 2, m, sw, sh);
    ctx.strokeRect((w - tw) / 2, m, tw, th);
    ctx.strokeRect((w - sw) / 2, h - m - sh, sw, sh);
    ctx.strokeRect((w - tw) / 2, h - m - th, tw, th);
  }

  // Liefert einen PNG-Blob (Promise). Groesse aus config.js.
  function alsPngBlob(feldDaten, spielerById, titel) {
    const w = GRAFIK_BREITE, h = GRAFIK_HOEHE;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    zeichneFeld(ctx, w, h);

    const r = Math.round(w * 0.048);
    for (const p of feldDaten) {
      const s = spielerById[p.spielerId];
      const cx = (p.x / 100) * w;
      const cy = (p.y / 100) * h;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = Math.max(2, Math.round(w / 300));
      ctx.strokeStyle = "#1a56a0";
      ctx.stroke();

      // Rueckennummer, ersatzweise die Position — ein leerer Kreis sieht aus
      // wie ein Fehler, dabei ist nur keine Nummer gepflegt.
      const inKreis = s && s.nummer ? String(s.nummer) : (s && s.position ? s.position : "");
      ctx.fillStyle = "#1a56a0";
      ctx.font = "700 " + Math.round(r * (inKreis.length > 2 ? 0.62 : 0.95)) + "px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(inKreis, cx, cy);

      const name = kuerzel(s);
      ctx.font = "600 " + Math.round(r * 0.7) + "px 'Segoe UI', system-ui, sans-serif";
      const breite = ctx.measureText(name).width + 12;
      const hoehe = Math.round(r * 0.92);
      // Schild innerhalb der Zeichenflaeche halten: bei den Aussenspielern
      // stuende es sonst halb ausserhalb und waere im Word abgeschnitten.
      const bx = Math.max(2, Math.min(w - breite - 2, cx - breite / 2));
      const by = cy + r + 5;
      ctx.fillStyle = "rgba(16, 24, 40, 0.78)";
      ctx.fillRect(bx, by, breite, hoehe);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(name, bx + 6, by + hoehe / 2);
    }

    if (titel) {
      ctx.font = "700 " + Math.round(w * 0.038) + "px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(16, 24, 40, 0.85)";
      const tw2 = ctx.measureText(titel).width + 24;
      ctx.fillRect((w - tw2) / 2, 6, tw2, Math.round(w * 0.055));
      ctx.fillStyle = "#ffffff";
      ctx.fillText(titel, w / 2, 6 + Math.round(w * 0.008));
    }

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  return { formation, verteile, kuerzel, renderFeld, alsPngBlob, GRAFIK_BREITE, GRAFIK_HOEHE };
})();

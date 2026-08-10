// ---------- Helfer ----------
function uuid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function el(id) { return document.getElementById(id); }
function val(id) { const e = el(id); return e ? e.value : ""; }
function nummer(v) { const n = Number(v); return isFinite(n) ? n : 0; }

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function fmtDatum(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return WOCHENTAGE_KURZ[d.getDay()] + ". " +
    String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
}
function ein(n, dez) {
  const x = Number(n);
  if (!isFinite(x)) return "—";
  return x.toLocaleString("de-DE", { minimumFractionDigits: dez || 0, maximumFractionDigits: dez || 0 });
}
function spielerName(s) { return s ? ((s.vorname || "") + " " + (s.nachname || "")).trim() : "Unbekannt"; }

// ---------- Zustand ----------
let appData = { meta: {}, spieler: [], mannschaften: [], saisons: [] };
let currentUser = null;
let currentTab = "spiele";
let offenesSpielId = null;
let offenerSpielerId = null;
let aktiverWettbewerbId = null;
let matrixWettbewerbId = null;
let auswertungWettbewerbId = null;
let zelleKontext = null;
let persistTimer = null;

// ---------- Normalisieren ----------
function normSpieler(s) {
  return {
    id: s.id || uuid(),
    vorname: s.vorname || "", nachname: s.nachname || "",
    position: s.position || "", nummer: s.nummer == null ? "" : String(s.nummer),
    aktiv: s.aktiv !== false,
    start: { spiele: nummer(s.start && s.start.spiele), tore: nummer(s.start && s.start.tore) }
  };
}
function normWettbewerb(w) {
  return {
    id: w.id || uuid(), name: w.name || "Wettbewerb",
    art: WETTBEWERB_ARTEN.some((a) => a.id === w.art) ? w.art : "sonstiges",
    zaehltKarriere: w.zaehltKarriere !== false
  };
}
function normSpiel(s, wettbewerbIds, kaderIds) {
  const einsaetze = {};
  const roh = s.einsaetze || {};
  for (const id of Object.keys(roh)) {
    if (kaderIds.indexOf(id) === -1) continue;   // Spieler nicht mehr im Saisonkader
    const e = roh[id] || {};
    const rolle = ROLLEN.some((r) => r.id === e.rolle) ? e.rolle : "fehlt";
    einsaetze[id] = { rolle: rolle, grund: e.grund || "", grundText: e.grundText || "" };
  }
  const gueltig = (id) => id && kaderIds.indexOf(id) !== -1 ? id : null;
  return {
    id: s.id || uuid(),
    wettbewerbId: wettbewerbIds.indexOf(s.wettbewerbId) !== -1 ? s.wettbewerbId : wettbewerbIds[0],
    runde: s.runde || "", nr: nummer(s.nr),
    datum: s.datum || "", anstoss: s.anstoss || "",
    heim: !!s.heim, gegner: s.gegner || "", ort: s.ort || "",
    zuschauer: s.zuschauer == null || s.zuschauer === "" ? null : nummer(s.zuschauer),
    schiedsrichter: Array.isArray(s.schiedsrichter) ? s.schiedsrichter.filter(Boolean) : [],
    formation: s.formation || "",
    dauer: nummer(s.dauer) > 0 ? nummer(s.dauer) : null,
    einsaetze: einsaetze,
    wechsel: (Array.isArray(s.wechsel) ? s.wechsel : [])
      .map((w) => ({ minute: nummer(w.minute), rausId: gueltig(w.rausId), reinId: gueltig(w.reinId) }))
      .filter((w) => w.rausId || w.reinId),
    tore: (Array.isArray(s.tore) ? s.tore : []).map((t) => ({
      minute: nummer(t.minute), fuerUns: !!t.fuerUns,
      art: TOR_ARTEN.some((a) => a.id === t.art) ? t.art : "tor",
      schuetzeId: gueltig(t.schuetzeId), schuetzeName: t.schuetzeName || "",
      vorlageId: gueltig(t.vorlageId)
    })),
    karten: (Array.isArray(s.karten) ? s.karten : [])
      .map((k) => ({ minute: nummer(k.minute), spielerId: gueltig(k.spielerId), art: KARTEN_ARTEN.some((a) => a.id === k.art) ? k.art : "gelb" }))
      .filter((k) => k.spielerId),
    aufstellung: { feld: (s.aufstellung && Array.isArray(s.aufstellung.feld) ? s.aufstellung.feld : [])
      .filter((p) => p && kaderIds.indexOf(p.spielerId) !== -1)
      .map((p) => ({ spielerId: p.spielerId, x: nummer(p.x), y: nummer(p.y) })) },
    notiz: s.notiz || "",
    importHinweis: s.importHinweis || ""
  };
}
function normSaison(s, mannschaftIds, spielerIds) {
  const wettbewerbe = (Array.isArray(s.wettbewerbe) && s.wettbewerbe.length
    ? s.wettbewerbe : DEFAULT_WETTBEWERBE.map((w) => Object.assign({ id: uuid() }, w))).map(normWettbewerb);
  const wIds = wettbewerbe.map((w) => w.id);
  const kader = (Array.isArray(s.kader) ? s.kader : []).filter((id) => spielerIds.indexOf(id) !== -1);
  return {
    id: s.id || uuid(),
    mannschaftId: mannschaftIds.indexOf(s.mannschaftId) !== -1 ? s.mannschaftId : mannschaftIds[0],
    bezeichnung: s.bezeichnung || "Saison",
    liga: s.liga || "",
    spieldauer: nummer(s.spieldauer) > 0 ? nummer(s.spieldauer) : STANDARD_SPIELDAUER,
    kader: kader,
    wettbewerbe: wettbewerbe,
    spiele: (Array.isArray(s.spiele) ? s.spiele : []).map((sp) => normSpiel(sp, wIds, kader)),
    nachtraege: (Array.isArray(s.nachtraege) ? s.nachtraege : [])
      .filter((n) => spielerIds.indexOf(n.spielerId) !== -1 && wIds.indexOf(n.wettbewerbId) !== -1)
      .map((n) => ({
        wettbewerbId: n.wettbewerbId, spielerId: n.spielerId,
        tore: nummer(n.tore), vorlagen: nummer(n.vorlagen),
        gelb: nummer(n.gelb), gelbrot: nummer(n.gelbrot), rot: nummer(n.rot),
        quelle: n.quelle || ""
      }))
  };
}
function normalizeData(data) {
  const d = data && typeof data === "object" ? clone(data) : {};
  const spieler = (Array.isArray(d.spieler) ? d.spieler : []).map(normSpieler);
  let mannschaften = (Array.isArray(d.mannschaften) ? d.mannschaften : [])
    .map((m) => ({ id: m.id || uuid(), name: m.name || "Mannschaft", kurz: m.kurz || "" }));
  if (!mannschaften.length) mannschaften = [{ id: uuid(), name: "1. Mannschaft", kurz: "1." }];
  const mIds = mannschaften.map((m) => m.id);
  const spielerIds = spieler.map((s) => s.id);
  let saisons = (Array.isArray(d.saisons) ? d.saisons : []).map((s) => normSaison(s, mIds, spielerIds));
  if (!saisons.length) {
    saisons = [normSaison({ mannschaftId: mIds[0], bezeichnung: neueSaisonBezeichnung() }, mIds, spielerIds)];
  }
  const meta = d.meta && typeof d.meta === "object" ? d.meta : {};
  if (mIds.indexOf(meta.aktiveMannschaftId) === -1) meta.aktiveMannschaftId = mIds[0];
  const passend = saisons.filter((s) => s.mannschaftId === meta.aktiveMannschaftId);
  if (!passend.some((s) => s.id === meta.aktiveSaisonId)) {
    meta.aktiveSaisonId = passend.length ? passend[passend.length - 1].id : saisons[0].id;
  }
  return { meta: meta, spieler: spieler, mannschaften: mannschaften, saisons: saisons };
}
function neueSaisonBezeichnung() {
  const heute = new Date();
  const j = heute.getMonth() >= 6 ? heute.getFullYear() : heute.getFullYear() - 1;
  return j + "/" + String((j + 1) % 100).padStart(2, "0");
}

// ---------- Zugriff ----------
function aktiveMannschaft() {
  return appData.mannschaften.find((m) => m.id === appData.meta.aktiveMannschaftId) || appData.mannschaften[0];
}
function saisonsDerMannschaft() {
  const m = aktiveMannschaft();
  return appData.saisons.filter((s) => s.mannschaftId === m.id);
}
function aktiveSaison() {
  return appData.saisons.find((s) => s.id === appData.meta.aktiveSaisonId) || saisonsDerMannschaft()[0] || appData.saisons[0];
}
function spielerById() {
  const map = {};
  for (const s of appData.spieler) map[s.id] = s;
  return map;
}
function kaderSpieler() {
  const map = spielerById();
  return aktiveSaison().kader.map((id) => map[id]).filter(Boolean);
}
function wettbewerbById(id) {
  return aktiveSaison().wettbewerbe.find((w) => w.id === id) || null;
}
function gewaehlterWettbewerb(feld) {
  const s = aktiveSaison();
  const ids = s.wettbewerbe.map((w) => w.id);
  if (ids.indexOf(feld) === -1) return ids[0];
  return feld;
}
function spieleVon(wettbewerbId) {
  return aktiveSaison().spiele
    .filter((s) => s.wettbewerbId === wettbewerbId)
    .sort((a, b) => (a.nr - b.nr) || String(a.datum).localeCompare(String(b.datum)));
}
function offenesSpiel() {
  return aktiveSaison().spiele.find((s) => s.id === offenesSpielId) || null;
}
function dauerVon(spiel) { return Stats.spieldauer(spiel, aktiveSaison()); }

// ---------- Rechte ----------
function canEdit() {
  if (!currentUser) return false;
  return currentUser.isAdmin || !!currentUser.canEdit || !!currentUser.canAdmin;
}
function canAdmin() {
  if (!currentUser) return false;
  return currentUser.isAdmin || !!currentUser.canAdmin;
}
function applyEditVisibility() {
  const editable = canEdit();
  const admin = canAdmin();
  document.body.classList.toggle("can-edit", editable);
  document.querySelectorAll(".editor-only").forEach((e) => e.classList.toggle("hidden", !editable));
  document.querySelectorAll(".admin-only").forEach((e) => e.classList.toggle("hidden", !admin));
  // Nur-Seher: alle Eingabefelder sperren. Das ist Komfort, nicht die
  // Sicherheitsgrenze — die steht im Worker (WRITE_REQUIRES_EDIT_PERMISSION).
  document.querySelectorAll("main input, main select, main textarea").forEach((e) => {
    if (e.closest(".filter-bar")) return;     // Suche/Filter bleiben bedienbar
    e.disabled = !editable;
  });
  document.querySelectorAll("#tab-verwaltung input, #tab-verwaltung select").forEach((e) => { e.disabled = !admin; });
}

// ---------- Kopfzeile ----------
function renderMannschaftSelect() {
  const sel = el("mannschaft-select");
  sel.innerHTML = appData.mannschaften
    .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  sel.value = appData.meta.aktiveMannschaftId;
}
function renderSaisonSelect() {
  const sel = el("saison-select");
  const liste = saisonsDerMannschaft();
  sel.innerHTML = liste
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.bezeichnung)}</option>`).join("");
  sel.value = aktiveSaison().id;
}
function renderHeaderUser() {
  const e1 = el("header-user"), e2 = el("info-user");
  if (!currentUser) { if (e1) e1.textContent = ""; if (e2) e2.textContent = ""; return; }
  const name = (currentUser.vorname || currentUser.nachname)
    ? ((currentUser.vorname || "") + " " + (currentUser.nachname || "")).trim() : currentUser.username;
  const rolle = currentUser.isAdmin ? " (Admin)" : canAdmin() ? " (Administrieren)" : canEdit() ? " (Bearbeiter)" : "";
  if (e1) e1.textContent = "👤 " + name + rolle;
  if (e2) e2.textContent = "Angemeldet als " + name + rolle +
    (canEdit() ? "" : " — Bearbeiten ist bestimmten Nutzern vorbehalten.");
}

// ---------- Wettbewerbs-Umschalter ----------
function renderWettbewerbSwitch(containerId, aktiv, onSelect) {
  const c = el(containerId);
  c.innerHTML = aktiveSaison().wettbewerbe.map((w) =>
    `<button type="button" data-w="${escapeHtml(w.id)}"${w.id === aktiv ? ' class="active"' : ""}>${escapeHtml(w.name)}</button>`).join("");
  c.onclick = (e) => {
    const b = e.target.closest("button[data-w]");
    if (b) onSelect(b.dataset.w);
  };
}

// ================= Tab: Spiele =================
function renderSpieleTab() {
  aktiverWettbewerbId = gewaehlterWettbewerb(aktiverWettbewerbId);
  renderWettbewerbSwitch("wettbewerb-switch", aktiverWettbewerbId, (id) => {
    aktiverWettbewerbId = id; renderSpieleTab();
  });
  renderJubilaeen();
  const spiele = spieleVon(aktiverWettbewerbId);
  const rows = el("spiele-rows");
  rows.innerHTML = spiele.map((s) => {
    const erg = Stats.istGespielt(s) ? Stats.ergebnisText(s) : "—";
    const klasse = Stats.istGespielt(s)
      ? (Stats.punkte(s) === 3 ? "erg-sieg" : Stats.punkte(s) === 1 ? "erg-remis" : "erg-nieder") : "";
    const offen = Stats.offeneWechsel(s).length;
    return `<div class="list-row spiel-row" data-spiel="${escapeHtml(s.id)}">
      <span class="lr-strong">${escapeHtml(s.runde || (s.nr ? s.nr + "." : "—"))}</span>
      <span>${escapeHtml(fmtDatum(s.datum))}</span>
      <span>${escapeHtml(s.gegner || "—")} <span class="ha-badge">${s.heim ? "H" : "A"}</span></span>
      <span>${escapeHtml(s.ort || "—")}</span>
      <span class="${klasse}">${escapeHtml(erg)}${offen ? ` <span class="badge warn" title="${offen} Wechsel ohne Gegenstück">${offen}</span>` : ""}</span>
    </div>`;
  }).join("");
  el("spiele-empty").classList.toggle("hidden", spiele.length > 0);
}

function renderJubilaeen() {
  const s = aktiveSaison();
  const treffer = Stats.jubilaeen(appData.spieler, appData.saisons, s.kader);
  const karte = el("jubilaeum-card");
  if (!treffer.length) { karte.classList.add("hidden"); return; }
  const map = spielerById();
  karte.classList.remove("hidden");
  el("jubilaeum-list").innerHTML = treffer.map((t) => {
    const name = spielerName(map[t.spielerId]);
    return t.art === "spiele"
      ? `<div class="jubi-row">🏅 <strong>${escapeHtml(name)}</strong> steht vor seinem ${t.wert}. Spiel für den Verein.</div>`
      : `<div class="jubi-row">⚽ <strong>${escapeHtml(name)}</strong> steht vor seinem ${t.wert}. Tor für den Verein.</div>`;
  }).join("");
}

function oeffneSpiel(id) {
  offenesSpielId = id;
  el("spiele-liste-view").classList.add("hidden");
  el("spiel-detail-view").classList.remove("hidden");
  renderSpielDetail();
  window.scrollTo(0, 0);
}
function zurueckZurListe() {
  saveNow();
  offenesSpielId = null;
  el("spiel-detail-view").classList.add("hidden");
  el("spiele-liste-view").classList.remove("hidden");
  renderSpieleTab();
}

function renderSpielDetail() {
  const sp = offenesSpiel();
  if (!sp) { zurueckZurListe(); return; }
  const s = aktiveSaison();
  el("spiel-detail-titel").textContent =
    (sp.runde || "Spiel") + " · " + (sp.heim ? VEREIN_NAME + " – " : "") + (sp.gegner || "Gegner") + (sp.heim ? "" : " – " + VEREIN_NAME);

  el("sd-wettbewerb").innerHTML = s.wettbewerbe
    .map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");
  el("sd-wettbewerb").value = sp.wettbewerbId;
  el("sd-runde").value = sp.runde;
  el("sd-nr").value = sp.nr || "";
  el("sd-datum").value = sp.datum;
  el("sd-anstoss").value = sp.anstoss;
  el("sd-heim").value = sp.heim ? "1" : "0";
  el("sd-gegner").value = sp.gegner;
  el("sd-ort").value = sp.ort;
  el("sd-zuschauer").value = sp.zuschauer == null ? "" : sp.zuschauer;
  el("sd-dauer").value = sp.dauer == null ? s.spieldauer : sp.dauer;
  el("sd-schiri").value = (sp.schiedsrichter || []).join("; ");
  el("sd-notiz").value = sp.notiz;

  const erg = Stats.ergebnis(sp);
  el("sd-ergebnis-info").textContent =
    "Ergebnis aus den erfassten Toren: " + erg.eigene + ":" + erg.gegner +
    (sp.importHinweis ? " — " + sp.importHinweis : "");

  el("sd-formation").innerHTML = `<option value="">—</option>` +
    FORMATIONEN.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join("");
  el("sd-formation").value = sp.formation || "";

  renderKaderListen();
  renderSpielfeld();
  renderWechselListe();
  renderToreListe();
  renderKartenListe();
  renderBerichtVorschau();
  applyEditVisibility();
}

function rolleVon(sp, spielerId) {
  const e = sp.einsaetze[spielerId];
  return e ? e.rolle : null;
}

function renderKaderListen() {
  const sp = offenesSpiel();
  const kader = kaderSpieler();
  const gruppen = { start: [], bank: [], rest: [] };
  for (const s of kader) {
    const r = rolleVon(sp, s.id);
    if (r === "start") gruppen.start.push(s);
    else if (r === "bank") gruppen.bank.push(s);
    else gruppen.rest.push(s);
  }
  const nameHtml = (s) => `${escapeHtml(spielerName(s))}${s.nummer ? ` <span class="kl-nr">#${escapeHtml(s.nummer)}</span>` : ""}`;

  el("liste-start").innerHTML = gruppen.start.map((s) => `
    <div class="kader-row" data-spieler="${escapeHtml(s.id)}">
      <span>${nameHtml(s)}</span>
      <span class="kader-actions editor-only">
        <button class="btn small secondary" data-setrolle="bank">Bank</button>
        <button class="btn small secondary" data-setrolle="fehlt">raus</button>
      </span>
    </div>`).join("") || `<p class="muted">Noch niemand in der Startelf.</p>`;

  el("liste-bank").innerHTML = gruppen.bank.map((s) => `
    <div class="kader-row" data-spieler="${escapeHtml(s.id)}">
      <span>${nameHtml(s)}</span>
      <span class="kader-actions editor-only">
        <button class="btn small secondary" data-setrolle="start">Startelf</button>
        <button class="btn small secondary" data-setrolle="fehlt">raus</button>
      </span>
    </div>`).join("") || `<p class="muted">Bank leer.</p>`;

  el("liste-fehlt").innerHTML = gruppen.rest.map((s) => {
    const e = sp.einsaetze[s.id];
    const grund = e && e.rolle === "fehlt" ? e.grund : "";
    return `<div class="kader-row" data-spieler="${escapeHtml(s.id)}">
      <span>${nameHtml(s)}</span>
      <span class="kader-actions">
        <select data-grund>
          <option value=""${grund ? "" : " selected"}>— nicht im Kader (/)</option>
          ${GRUENDE.map((g) => `<option value="${g.id}"${grund === g.id ? " selected" : ""}>${escapeHtml(g.label)}</option>`).join("")}
        </select>
        <button class="btn small secondary editor-only" data-setrolle="start">Startelf</button>
        <button class="btn small secondary editor-only" data-setrolle="bank">Bank</button>
      </span>
    </div>`;
  }).join("") || `<p class="muted">Alle im Kader eingeteilt.</p>`;

  el("cnt-start").textContent = gruppen.start.length;
  el("cnt-bank").textContent = gruppen.bank.length;
  el("cnt-start").classList.toggle("warn", gruppen.start.length !== 11);
}

function setzeRolle(spielerId, rolle) {
  const sp = offenesSpiel();
  if (rolle === "fehlt") {
    sp.einsaetze[spielerId] = { rolle: "fehlt", grund: "nichtKader", grundText: "" };
    sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== spielerId);
  } else {
    sp.einsaetze[spielerId] = { rolle: rolle, grund: "", grundText: "" };
    if (rolle === "start") setzeAufsFeld(spielerId);
    else sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== spielerId);
  }
  persist();
  renderKaderListen();
  renderSpielfeld();
  renderWechselListe();
  renderBerichtVorschau();
  applyEditVisibility();
}
function setzeGrund(spielerId, grund) {
  const sp = offenesSpiel();
  if (!grund) delete sp.einsaetze[spielerId];
  else sp.einsaetze[spielerId] = { rolle: "fehlt", grund: grund, grundText: "" };
  sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== spielerId);
  persist();
  renderBerichtVorschau();
}
// Setzt einen Spieler auf den ersten freien Platz der gewaehlten Formation.
function setzeAufsFeld(spielerId) {
  const sp = offenesSpiel();
  if (sp.aufstellung.feld.some((p) => p.spielerId === spielerId)) return;
  const f = Aufstellung.formation(sp.formation || DEFAULT_FORMATION);
  const belegt = sp.aufstellung.feld;
  const frei = f.plaetze.find((pl) => !belegt.some((b) => Math.abs(b.x - pl.x) < 3 && Math.abs(b.y - pl.y) < 3));
  const platz = frei || { x: 50, y: 50 };
  sp.aufstellung.feld.push({ spielerId: spielerId, x: platz.x, y: platz.y });
}

function renderSpielfeld() {
  const sp = offenesSpiel();
  Aufstellung.renderFeld(el("spielfeld"), sp.aufstellung.feld, spielerById(), {
    bearbeitbar: canEdit(),
    onChange: () => persist()
  });
}
function formationAnwenden() {
  const sp = offenesSpiel();
  const startIds = Object.keys(sp.einsaetze).filter((id) => sp.einsaetze[id].rolle === "start");
  sp.aufstellung.feld = Aufstellung.verteile(startIds, sp.formation || DEFAULT_FORMATION, spielerById());
  persist();
  renderSpielfeld();
}

// ---------- Wechsel ----------
function spielerOptionen(ids, gewaehlt, leerText) {
  const map = spielerById();
  return `<option value="">${escapeHtml(leerText || "—")}</option>` + ids.map((id) =>
    `<option value="${escapeHtml(id)}"${id === gewaehlt ? " selected" : ""}>${escapeHtml(spielerName(map[id]))}</option>`).join("");
}
function renderWechselListe() {
  const sp = offenesSpiel();
  const aufDemFeld = Object.keys(sp.einsaetze).filter((id) => ["start", "ein"].indexOf(sp.einsaetze[id].rolle) !== -1);
  const bank = Object.keys(sp.einsaetze).filter((id) => ["bank", "ein"].indexOf(sp.einsaetze[id].rolle) !== -1);
  sp.wechsel.sort((a, b) => a.minute - b.minute);
  el("wechsel-list").innerHTML = sp.wechsel.map((w, i) => `
    <div class="ereignis-row" data-idx="${i}">
      <input type="number" class="min-input" data-feld="minute" min="0" max="200" value="${w.minute}" title="Minute" />
      <span class="er-label">.min</span>
      <select data-feld="reinId" title="kommt">${spielerOptionen(bank, w.reinId, "— rein: offen")}</select>
      <span class="er-label">für</span>
      <select data-feld="rausId" title="geht">${spielerOptionen(aufDemFeld, w.rausId, "— raus: offen")}</select>
      <button class="icon-btn editor-only" data-remove="wechsel" title="Entfernen">×</button>
    </div>`).join("") || `<p class="muted">Kein Wechsel erfasst.</p>`;

  const offen = Stats.offeneWechsel(sp).length;
  const warn = el("wechsel-warnung");
  warn.classList.toggle("hidden", offen === 0);
  if (offen) {
    warn.innerHTML = `⚠️ <strong>${offen}</strong> Wechsel ohne Gegenstück. Die Minutenrechnung stimmt trotzdem — ` +
      `im Word-Bericht taucht ein solcher Wechsel aber nicht auf, weil unklar ist, wer für wen kam.`;
  }
  el("btn-wechsel-paaren").classList.toggle("hidden", offen < 2 || !canEdit());
}

// Legt offene Wechsel derselben Minute paarweise zusammen. Fielen zwei Wechsel
// gleichzeitig, ist die Zuordnung „X für Y" aus den Minuten NICHT ableitbar —
// deshalb ist das ein ausdruecklicher Knopf mit Rueckfrage und kein stiller
// Automatismus. Fuer die Statistik aendert sich dadurch nichts (die Minuten sind
// dieselben), nur der Wortlaut des Word-Berichts.
function offeneWechselPaaren() {
  const sp = offenesSpiel();
  const offen = Stats.offeneWechsel(sp);
  if (!offen.length) return;
  if (!confirm("Offene Wechsel derselben Minute werden der Reihe nach zusammengelegt.\n\n" +
      "Fielen mehrere Wechsel gleichzeitig, ist die Zuordnung „wer für wen“ geraten — " +
      "bitte anschließend prüfen. Auf die Statistik hat sie keinen Einfluss, nur auf den Wortlaut des Berichts.")) return;
  const behalten = sp.wechsel.filter((w) => w.rausId && w.reinId);
  const minuten = Array.from(new Set(offen.map((w) => w.minute))).sort((a, b) => a - b);
  for (const m of minuten) {
    const raus = offen.filter((w) => w.minute === m && w.rausId).map((w) => w.rausId);
    const rein = offen.filter((w) => w.minute === m && w.reinId).map((w) => w.reinId);
    const anzahl = Math.max(raus.length, rein.length);
    for (let i = 0; i < anzahl; i++) {
      behalten.push({ minute: m, rausId: raus[i] || null, reinId: rein[i] || null });
    }
  }
  sp.wechsel = behalten.filter((w) => w.rausId || w.reinId);
  persist();
  renderSpielDetail();
}

// Ein Spieler darf in EINEM Spiel nur einmal rein- und einmal rausgehen.
// Ohne diese Bereinigung liesse sich derselbe Spieler in zwei Zeilen als
// „kommt" eintragen — die App zaehlte dann zwei Einwechslungen fuer eine Person.
// Faellt dabei eine Zeile ganz leer, verschwindet sie.
function wechselEindeutigMachen(spiel, behaltenIdx, feld) {
  const wert = spiel.wechsel[behaltenIdx] && spiel.wechsel[behaltenIdx][feld];
  if (!wert) return;
  spiel.wechsel.forEach((w, i) => { if (i !== behaltenIdx && w[feld] === wert) w[feld] = null; });
  spiel.wechsel = spiel.wechsel.filter((w) => w.rausId || w.reinId);
}
function wechselAdd() {
  const sp = offenesSpiel();
  sp.wechsel.push({ minute: Math.round(dauerVon(sp) * 0.7), rausId: null, reinId: null });
  persist();
  renderWechselListe(); renderBerichtVorschau(); applyEditVisibility();
}
// Wer eingewechselt wird, bekommt automatisch die Rolle "ein" — sonst zaehlte
// der Einsatz nicht. Wer aus der Einwechslung wieder verschwindet, faellt auf
// die Bank zurueck.
function synchronisiereRollenAusWechseln() {
  const sp = offenesSpiel();
  const reinIds = sp.wechsel.map((w) => w.reinId).filter(Boolean);
  for (const id of Object.keys(sp.einsaetze)) {
    const r = sp.einsaetze[id].rolle;
    if (reinIds.indexOf(id) !== -1 && r !== "start" && r !== "ein") sp.einsaetze[id] = { rolle: "ein", grund: "", grundText: "" };
    else if (r === "ein" && reinIds.indexOf(id) === -1) sp.einsaetze[id] = { rolle: "bank", grund: "", grundText: "" };
  }
}

// ---------- Tore ----------
function renderToreListe() {
  const sp = offenesSpiel();
  const kaderIds = aktiveSaison().kader;
  sp.tore.sort((a, b) => a.minute - b.minute);
  el("tore-list").innerHTML = sp.tore.map((t, i) => `
    <div class="ereignis-row" data-idx="${i}">
      <input type="number" class="min-input" data-feld="minute" min="0" max="200" value="${t.minute}" title="Minute" />
      <span class="er-label">.min</span>
      <select data-feld="fuerUns">
        <option value="1"${t.fuerUns ? " selected" : ""}>für uns</option>
        <option value="0"${t.fuerUns ? "" : " selected"}>Gegner</option>
      </select>
      ${t.fuerUns || t.art === "eigentor"
        ? `<select data-feld="schuetzeId" title="Schütze">${spielerOptionen(kaderIds, t.schuetzeId, "— Schütze")}</select>`
        : `<input type="text" data-feld="schuetzeName" value="${escapeHtml(t.schuetzeName)}" placeholder="Schütze (Gegner)" />`}
      <select data-feld="vorlageId" title="Vorlage">${spielerOptionen(kaderIds, t.vorlageId, "— Vorlage")}</select>
      <select data-feld="art">${TOR_ARTEN.map((a) => `<option value="${a.id}"${t.art === a.id ? " selected" : ""}>${escapeHtml(a.label)}</option>`).join("")}</select>
      <button class="icon-btn editor-only" data-remove="tore" title="Entfernen">×</button>
    </div>`).join("") || `<p class="muted">Kein Tor erfasst.</p>`;
}
function torAdd() {
  const sp = offenesSpiel();
  sp.tore.push({ minute: 1, fuerUns: true, art: "tor", schuetzeId: null, schuetzeName: "", vorlageId: null });
  persist();
  renderToreListe(); renderBerichtVorschau(); renderSpielDetailErgebnis(); applyEditVisibility();
}
function renderSpielDetailErgebnis() {
  const sp = offenesSpiel();
  if (!sp) return;
  const erg = Stats.ergebnis(sp);
  el("sd-ergebnis-info").textContent = "Ergebnis aus den erfassten Toren: " + erg.eigene + ":" + erg.gegner;
}

// ---------- Karten ----------
function renderKartenListe() {
  const sp = offenesSpiel();
  const kaderIds = aktiveSaison().kader;
  sp.karten.sort((a, b) => a.minute - b.minute);
  el("karten-list").innerHTML = sp.karten.map((k, i) => `
    <div class="ereignis-row" data-idx="${i}">
      <input type="number" class="min-input" data-feld="minute" min="0" max="200" value="${k.minute}" title="Minute" />
      <span class="er-label">.min</span>
      <select data-feld="spielerId">${spielerOptionen(kaderIds, k.spielerId, "— Spieler")}</select>
      <select data-feld="art">${KARTEN_ARTEN.map((a) => `<option value="${a.id}"${k.art === a.id ? " selected" : ""}>${escapeHtml(a.label)}</option>`).join("")}</select>
      <button class="icon-btn editor-only" data-remove="karten" title="Entfernen">×</button>
    </div>`).join("") || `<p class="muted">Keine Karte erfasst.</p>`;
}
function karteAdd() {
  const sp = offenesSpiel();
  sp.karten.push({ minute: 1, spielerId: null, art: "gelb" });
  persist();
  renderKartenListe(); renderBerichtVorschau(); applyEditVisibility();
}

// ---------- Bericht-Vorschau ----------
function berichtKontext() {
  return { spielerById: spielerById(), saison: aktiveSaison(), mannschaft: aktiveMannschaft() };
}
function renderBerichtVorschau() {
  const sp = offenesSpiel();
  if (!sp) return;
  const ctx = berichtKontext();
  const zeilen = DocxSpielbericht.zeilen(sp, ctx);
  el("bericht-vorschau").innerHTML =
    `<div class="bv-titel">${escapeHtml(DocxSpielbericht.ueberschrift(sp))}</div>` +
    `<div class="bv-ergebnis">${escapeHtml(DocxSpielbericht.ergebnisZeile(sp))}</div>` +
    zeilen.map((z) => z.label
      ? `<div class="bv-zeile"><strong>${escapeHtml(z.label)}:</strong> ${escapeHtml(z.text)}</div>`
      : `<div class="bv-zeile">${escapeHtml(z.text)}</div>`).join("") +
    `<div class="bv-zeile"><strong>Aufstellung:</strong> ${sp.aufstellung.feld.length} Spieler auf dem Feld</div>`;
}

async function wordBerichtErzeugen() {
  const sp = offenesSpiel();
  if (!sp) return;
  const ctx = berichtKontext();
  try {
    setSaveStatus("Bericht wird erzeugt…", "pending");
    const grafik = sp.aufstellung.feld.length
      ? await Aufstellung.alsPngBlob(sp.aufstellung.feld, ctx.spielerById,
          DocxSpielbericht.ueberschrift(sp) + "   " + DocxSpielbericht.ergebnisZeile(sp))
      : null;
    const blob = await DocxSpielbericht.erzeuge(sp, ctx, grafik);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = DocxSpielbericht.dateiName(sp, ctx);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setSaveStatus("Bericht erzeugt", "ok");
  } catch (e) {
    console.error("Word-Bericht fehlgeschlagen", e);
    alert("Der Word-Bericht konnte nicht erzeugt werden: " + e.message);
    setSaveStatus("Bericht fehlgeschlagen", "error");
  }
}

// ---------- Spiel anlegen / löschen ----------
function neuesSpiel() {
  const s = aktiveSaison();
  const w = wettbewerbById(aktiverWettbewerbId) || s.wettbewerbe[0];
  const bisher = spieleVon(w.id);
  const nr = bisher.length ? Math.max.apply(null, bisher.map((x) => x.nr || 0)) + 1 : 1;
  const spiel = normSpiel({
    wettbewerbId: w.id, nr: nr,
    runde: w.art === "liga" ? nr + ". ST" : nr + ". Runde",
    heim: true, formation: DEFAULT_FORMATION
  }, s.wettbewerbe.map((x) => x.id), s.kader);
  s.spiele.push(spiel);
  persist();
  oeffneSpiel(spiel.id);
}
function spielLoeschen() {
  const sp = offenesSpiel();
  if (!sp) return;
  if (!confirm("Dieses Spiel mit allen Einsätzen, Toren und Karten endgültig löschen?")) return;
  const s = aktiveSaison();
  s.spiele = s.spiele.filter((x) => x.id !== sp.id);
  persist();
  zurueckZurListe();
}

// ================= Tab: Matrix =================
function renderMatrix() {
  matrixWettbewerbId = gewaehlterWettbewerb(matrixWettbewerbId);
  renderWettbewerbSwitch("matrix-wettbewerb-switch", matrixWettbewerbId, (id) => {
    matrixWettbewerbId = id; renderMatrix();
  });
  const s = aktiveSaison();
  const spiele = spieleVon(matrixWettbewerbId);
  const kader = kaderSpieler();
  el("matrix-empty").classList.toggle("hidden", spiele.length > 0);
  el("matrix-hinweis").textContent = canEdit()
    ? "Zelle antippen, um den Einsatz zu ändern."
    : "Nur-Lese-Ansicht.";

  el("matrix-head").innerHTML =
    `<th class="sticky-col">Spiel</th><th class="num">Erg.</th>` +
    kader.map((p) => `<th class="rot-head" title="${escapeHtml(spielerName(p))}">${escapeHtml(p.nachname || p.vorname)}</th>`).join("");

  el("matrix-body").innerHTML = spiele.map((sp) => {
    const d = dauerVon(sp);
    const erg = Stats.istGespielt(sp) ? Stats.ergebnisText(sp) : "—";
    return `<tr data-spiel="${escapeHtml(sp.id)}">
      <td class="sticky-col"><span class="mx-runde">${escapeHtml(sp.runde || "—")}</span>
        <span class="mx-gegner">${escapeHtml(sp.gegner || "")} ${sp.heim ? "(H)" : "(A)"}</span></td>
      <td class="num">${escapeHtml(erg)}</td>` +
      kader.map((p) => {
        const e = Stats.einsatz(sp, p.id, d);
        const txt = Stats.matrixText(e);
        const kl = !e ? "mx-leer" : e.unvollstaendig ? "mx-warn"
          : e.rolle === "start" || e.rolle === "ein" ? "mx-spiel"
          : e.rolle === "bank" ? "mx-bank" : "mx-fehlt";
        return `<td class="mx-cell ${kl}" data-spieler="${escapeHtml(p.id)}">${escapeHtml(txt)}</td>`;
      }).join("") + `</tr>`;
  }).join("");

  const zeilen = [
    ["Spiele gesamt", (b) => b.spiele],
    ["Minuten gesamt", (b) => b.minuten],
    ["Einwechselungen", (b) => b.ein],
    ["Auswechselungen", (b) => b.aus],
    ["Tore", (b) => b.tore],
    ["Gelbe Karten", (b) => b.gelb],
    ["Gelb-Rote Karten", (b) => b.gelbrot],
    ["Rote Karten", (b) => b.rot],
    ["Vereinsbilanz Spiele", null],
    ["Vereinsbilanz Tore", null]
  ];
  const bilanzen = {};
  for (const p of kader) {
    const b = Stats.bilanzSpieler(spiele, p.id, s);
    Stats.addNachtrag(b, s.nachtraege, p.id, [matrixWettbewerbId]);
    bilanzen[p.id] = b;
  }
  const karrieren = {};
  for (const p of kader) karrieren[p.id] = Stats.karriere(p, appData.saisons);

  el("matrix-foot").innerHTML = zeilen.map(([label, fn]) =>
    `<tr class="mx-sum${fn ? "" : " mx-karriere"}"><td class="sticky-col">${escapeHtml(label)}</td><td></td>` +
    kader.map((p) => {
      let v;
      if (fn) v = fn(bilanzen[p.id]);
      else v = label.indexOf("Tore") !== -1 ? karrieren[p.id].tore : karrieren[p.id].spiele;
      return `<td class="num">${v ? ein(v) : "/"}</td>`;
    }).join("") + `</tr>`).join("");
}

// ---------- Matrix-Zelle bearbeiten ----------
function oeffneZelle(spielId, spielerId) {
  if (!canEdit()) return;
  const sp = aktiveSaison().spiele.find((x) => x.id === spielId);
  if (!sp) return;
  zelleKontext = { spielId: spielId, spielerId: spielerId };
  const d = Stats.spieldauer(sp, aktiveSaison());
  const e = Stats.einsatz(sp, spielerId, d);
  const p = spielerById()[spielerId];

  el("zelle-kontext").textContent = spielerName(p) + " · " + (sp.runde || "") + " " + (sp.gegner || "") +
    " · Spieldauer " + d + " Minuten";
  el("zm-rolle").innerHTML = `<option value="">— nicht im Kader (/)</option>` +
    ROLLEN.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join("");
  el("zm-rolle").value = e ? e.rolle : "";
  el("zm-grund").innerHTML = GRUENDE.map((g) => `<option value="${g.id}">${escapeHtml(g.label)}</option>`).join("");
  el("zm-grund").value = e && e.grund ? e.grund : "nichtKader";
  el("zm-grundtext").value = e ? e.grundText : "";
  el("zm-ein").value = e && e.rolle === "ein" && e.ab != null ? e.ab : "";
  el("zm-aus").value = e && e.ausgewechselt && e.bis != null ? e.bis : "";
  zelleFelderAnzeigen();
  el("zelle-modal").classList.remove("hidden");
}
function zelleFelderAnzeigen() {
  const r = val("zm-rolle");
  el("zm-feld-ein").classList.toggle("hidden", r !== "ein");
  el("zm-feld-aus").classList.toggle("hidden", r !== "ein" && r !== "start");
  el("zm-feld-grund").classList.toggle("hidden", r !== "fehlt");
  el("zm-feld-grundtext").classList.toggle("hidden", r !== "fehlt");
  el("zm-hinweis").textContent = (r === "start" || r === "ein")
    ? "Der Partner des Wechsels bleibt offen und lässt sich im Spielbericht ergänzen."
    : "";
}
function zelleSpeichern() {
  if (!zelleKontext) return;
  const sp = aktiveSaison().spiele.find((x) => x.id === zelleKontext.spielId);
  const id = zelleKontext.spielerId;
  if (!sp) { zelleSchliessen(); return; }
  const d = Stats.spieldauer(sp, aktiveSaison());
  const rolle = val("zm-rolle");

  // Alte Wechsel dieses Spielers loesen — die halbe Seite bleibt erhalten,
  // damit der Partner nicht mit verschwindet.
  sp.wechsel = sp.wechsel.map((w) => ({
    minute: w.minute,
    rausId: w.rausId === id ? null : w.rausId,
    reinId: w.reinId === id ? null : w.reinId
  })).filter((w) => w.rausId || w.reinId);

  if (!rolle) {
    delete sp.einsaetze[id];
    sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== id);
  } else if (rolle === "fehlt") {
    sp.einsaetze[id] = { rolle: "fehlt", grund: val("zm-grund") || "nichtKader", grundText: val("zm-grundtext") };
    sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== id);
  } else if (rolle === "bank") {
    sp.einsaetze[id] = { rolle: "bank", grund: "", grundText: "" };
    sp.aufstellung.feld = sp.aufstellung.feld.filter((p) => p.spielerId !== id);
  } else {
    sp.einsaetze[id] = { rolle: rolle, grund: "", grundText: "" };
    if (rolle === "ein") {
      const abM = val("zm-ein");
      if (abM === "") { alert("Bitte die Minute der Einwechslung angeben."); return; }
      sp.wechsel.push({ minute: Stats.clampMinute(abM, d), rausId: null, reinId: id });
    }
    const ausM = val("zm-aus");
    if (ausM !== "") sp.wechsel.push({ minute: Stats.clampMinute(ausM, d), rausId: id, reinId: null });
  }
  persist();
  zelleSchliessen();
  renderMatrix();
}
function zelleSchliessen() {
  zelleKontext = null;
  el("zelle-modal").classList.add("hidden");
}

// ================= Tab: Spieler =================
function renderSpielerTab() {
  const s = aktiveSaison();
  const suche = val("spieler-suche").toLowerCase().trim();
  const nurKader = el("spieler-nur-kader").checked;
  const alle = appData.spieler.filter((p) => {
    if (nurKader && s.kader.indexOf(p.id) === -1) return false;
    if (suche && spielerName(p).toLowerCase().indexOf(suche) === -1) return false;
    return true;
  }).sort((a, b) => spielerName(a).localeCompare(spielerName(b), "de"));

  const saisonSpiele = s.spiele;
  const alleWIds = s.wettbewerbe.map((w) => w.id);
  el("spieler-table").querySelector("tbody").innerHTML = alle.map((p) => {
    const b = Stats.bilanzSpieler(saisonSpiele, p.id, s);
    Stats.addNachtrag(b, s.nachtraege, p.id, alleWIds);
    const k = Stats.karriere(p, appData.saisons);
    return `<tr class="data-row" data-spieler="${escapeHtml(p.id)}">
      <td class="strong">${escapeHtml(spielerName(p))}</td>
      <td>${escapeHtml(p.position || "—")}</td>
      <td class="num">${escapeHtml(p.nummer || "—")}</td>
      <td class="num">${ein(b.spiele)}</td>
      <td class="num">${ein(b.minuten)}</td>
      <td class="num">${ein(b.tore)}</td>
      <td class="num strong">${ein(k.spiele)}</td>
      <td class="num strong">${ein(k.tore)}</td>
    </tr>`;
  }).join("");
  el("spieler-count").textContent = alle.length + (alle.length === 1 ? " Spieler" : " Spieler");
  el("spieler-empty").classList.toggle("hidden", alle.length > 0);
}

function oeffneSpieler(id) {
  offenerSpielerId = id;
  el("spieler-liste-view").classList.add("hidden");
  el("spieler-detail-view").classList.remove("hidden");
  renderSpielerDetail();
  window.scrollTo(0, 0);
}
function zurueckZuSpielern() {
  offenerSpielerId = null;
  el("spieler-detail-view").classList.add("hidden");
  el("spieler-liste-view").classList.remove("hidden");
  renderSpielerTab();
}
function renderSpielerDetail() {
  const p = appData.spieler.find((x) => x.id === offenerSpielerId);
  if (!p) { zurueckZuSpielern(); return; }
  const k = Stats.karriere(p, appData.saisons);

  const saisonZeilen = [];
  const ausfaelleGesamt = {};
  for (const s of appData.saisons) {
    if (s.kader.indexOf(p.id) === -1) continue;
    const m = appData.mannschaften.find((x) => x.id === s.mannschaftId);
    for (const w of s.wettbewerbe) {
      const spiele = s.spiele.filter((x) => x.wettbewerbId === w.id);
      const b = Stats.bilanzSpieler(spiele, p.id, s);
      Stats.addNachtrag(b, s.nachtraege, p.id, [w.id]);
      if (!b.spiele && !b.kader && !b.ausfaelleGesamt && !b.tore) continue;
      saisonZeilen.push({ saison: s, mannschaft: m, wettbewerb: w, b: b });
      for (const g of Object.keys(b.ausfaelle)) ausfaelleGesamt[g] = (ausfaelleGesamt[g] || 0) + b.ausfaelle[g];
    }
  }

  const kacheln = [
    ["Spiele für den Verein", ein(k.spiele), p.start.spiele ? "davon " + ein(p.start.spiele) + " vor der Erfassung" : "vollständig erfasst"],
    ["Tore für den Verein", ein(k.tore), p.start.tore ? "davon " + ein(p.start.tore) + " vor der Erfassung" : "vollständig erfasst"],
    ["Minuten (erfasst)", ein(k.minuten), ein(k.startelf) + "× in der Startelf"],
    ["Karten", ein(k.gelb) + " / " + ein(k.gelbrot) + " / " + ein(k.rot), "Gelb / Gelb-Rot / Rot"]
  ];

  el("spieler-detail").innerHTML = `
    <div class="card">
      <h2>${escapeHtml(spielerName(p))}</h2>
      <p class="muted">${escapeHtml(p.position || "ohne Position")}${p.nummer ? " · Rückennummer " + escapeHtml(p.nummer) : ""}</p>
      <div class="summary-cards" style="margin-top:14px;">
        ${kacheln.map(([l, v, sub]) => `<div class="summary-card"><div class="sc-label">${escapeHtml(l)}</div><div class="sc-value">${escapeHtml(v)}</div><div class="sc-sub">${escapeHtml(sub)}</div></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h2>Saison für Saison</h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Saison</th><th>Mannschaft</th><th>Wettbewerb</th>
            <th class="num">Spiele</th><th class="num">Startelf</th><th class="num">Minuten</th>
            <th class="num">Ein</th><th class="num">Aus</th><th class="num">Tore</th>
            <th class="num">Vorlagen</th><th class="num">Einsatzquote</th></tr></thead>
          <tbody>${saisonZeilen.map((z) => `<tr>
            <td class="strong">${escapeHtml(z.saison.bezeichnung)}</td>
            <td>${escapeHtml(z.mannschaft ? z.mannschaft.name : "—")}</td>
            <td>${escapeHtml(z.wettbewerb.name)}</td>
            <td class="num">${ein(z.b.spiele)}</td>
            <td class="num">${ein(z.b.startelf)}</td>
            <td class="num">${ein(z.b.minuten)}</td>
            <td class="num">${ein(z.b.ein)}</td>
            <td class="num">${ein(z.b.aus)}</td>
            <td class="num">${ein(z.b.tore)}</td>
            <td class="num">${ein(z.b.vorlagen)}</td>
            <td class="num">${ein(Stats.einsatzquote(z.b) * 100, 0)} %</td>
          </tr>`).join("") || `<tr><td colspan="11" class="muted">Noch keine Saison erfasst.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Verpasste Spiele</h2>
      ${Object.keys(ausfaelleGesamt).length
        ? `<div class="ausfall-grid">${GRUENDE.filter((g) => ausfaelleGesamt[g.id]).map((g) =>
            `<div class="ausfall-box"><div class="ab-value">${ein(ausfaelleGesamt[g.id])}</div><div class="ab-label">${escapeHtml(g.label)}</div></div>`).join("")}</div>`
        : `<p class="muted">Kein verpasstes Spiel erfasst.</p>`}
    </div>`;
}

// ================= Tab: Auswertung =================
function renderAuswertung() {
  auswertungWettbewerbId = gewaehlterWettbewerb(auswertungWettbewerbId);
  renderWettbewerbSwitch("auswertung-wettbewerb-switch", auswertungWettbewerbId, (id) => {
    auswertungWettbewerbId = id; renderAuswertung();
  });
  const s = aktiveSaison();
  const spiele = spieleVon(auswertungWettbewerbId);
  const t = Stats.teamBilanz(spiele);

  el("auswertung-cards").innerHTML = [
    ["Spiele", ein(t.spiele), t.siege + " S · " + t.remis + " U · " + t.niederlagen + " N"],
    ["Punkte", ein(t.punkte), "Schnitt " + ein(t.punkteschnitt, 2)],
    ["Tore", ein(t.tore) + " : " + ein(t.gegentore), "Differenz " + (t.tore - t.gegentore > 0 ? "+" : "") + ein(t.tore - t.gegentore)],
    ["Zuschauerschnitt", t.zuschauerschnitt ? ein(t.zuschauerschnitt) : "—", t.zuschauerSpiele + " Spiele mit Angabe"]
  ].map(([l, v, sub], i) =>
    `<div class="summary-card${i === 1 ? " strong" : ""}"><div class="sc-label">${escapeHtml(l)}</div><div class="sc-value">${escapeHtml(v)}</div><div class="sc-sub">${escapeHtml(sub)}</div></div>`).join("");

  const zeile = (label, x) => `<tr><td class="strong">${escapeHtml(label)}</td>
    <td class="num">${ein(x.spiele)}</td><td class="num">${ein(x.siege)}</td><td class="num">${ein(x.remis)}</td>
    <td class="num">${ein(x.niederlagen)}</td><td class="num">${ein(x.tore)}</td><td class="num">${ein(x.gegentore)}</td>
    <td class="num">${ein(x.punkte)}</td><td class="num">${ein(x.spiele ? x.punkte / x.spiele : 0, 2)}</td></tr>`;
  el("heim-auswaerts").querySelector("tbody").innerHTML =
    zeile("Heim", t.heim) + zeile("Auswärts", t.auswaerts) + zeile("Gesamt", t);

  const maxA = Math.max(1, Math.max.apply(null, t.toreAbschnitt.concat(t.gegentoreAbschnitt)));
  el("abschnitt-chart").innerHTML = Stats.ABSCHNITTE.map((a, i) => `
    <div class="abschnitt-row">
      <span class="ar-label">${escapeHtml(Stats.abschnittLabel(a))}</span>
      <span class="ar-bars">
        <span class="ar-bar eigene" style="width:${(t.toreAbschnitt[i] / maxA) * 100}%"></span>
        <span class="ar-bar gegner" style="width:${(t.gegentoreAbschnitt[i] / maxA) * 100}%"></span>
      </span>
      <span class="ar-zahl">${t.toreAbschnitt[i]} : ${t.gegentoreAbschnitt[i]}</span>
    </div>`).join("") + `<p class="muted" style="margin-top:8px;">Blau = eigene Tore, rot = Gegentore.</p>`;

  const fRows = Object.keys(t.formationen).sort((a, b) => t.formationen[b].spiele - t.formationen[a].spiele);
  el("formation-table").querySelector("tbody").innerHTML = fRows.map((f) => {
    const x = t.formationen[f];
    return `<tr><td class="strong">${escapeHtml(f)}</td><td class="num">${ein(x.spiele)}</td>
      <td class="num">${ein(x.punkte)}</td><td class="num">${ein(x.spiele ? x.punkte / x.spiele : 0, 2)}</td>
      <td class="num">${ein(x.tore)}</td><td class="num">${ein(x.gegentore)}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">Noch keine Formation erfasst.</td></tr>`;

  const map = spielerById();
  const listen = [
    ["Meiste Minuten", "minuten", (b) => ein(b.minuten) + " Min."],
    ["Meiste Tore", "tore", (b) => ein(b.tore) + (b.vorlagen ? " (+" + ein(b.vorlagen) + " V)" : "")],
    ["Meiste Einsätze", "spiele", (b) => ein(b.spiele) + " Spiele"],
    ["Meiste Karten", "gelb", (b) => ein(b.gelb) + " GK" + (b.gelbrot ? " / " + b.gelbrot + " GRK" : "") + (b.rot ? " / " + b.rot + " RK" : "")]
  ];
  el("rang-grid").innerHTML = listen.map(([titel, feld, fmt]) => {
    const rang = s.kader
      .map((id) => {
        const b = Stats.bilanzSpieler(spiele, id, s);
        Stats.addNachtrag(b, s.nachtraege, id, [auswertungWettbewerbId]);
        return { id: id, b: b };
      })
      .filter((x) => x.b[feld] > 0)
      .sort((a, b) => b.b[feld] - a.b[feld])
      .slice(0, 10);
    return `<div class="rang-box"><h3>${escapeHtml(titel)}</h3>` +
      (rang.length ? rang.map((x, i) =>
        `<div class="rang-row"><span class="rr-pos">${i + 1}.</span>
         <span class="rr-name">${escapeHtml(spielerName(map[x.id]))}</span>
         <span class="rr-wert">${escapeHtml(fmt(x.b))}</span></div>`).join("")
        : `<p class="muted">Noch nichts erfasst.</p>`) + `</div>`;
  }).join("");
}

// ================= Tab: Verwaltung =================
function renderVerwaltung() {
  const s = aktiveSaison();

  el("mannschaft-list").innerHTML = appData.mannschaften.map((m, i) => `
    <div class="param-row" data-mannschaft="${escapeHtml(m.id)}">
      <input type="text" class="pg-label" data-feld="name" value="${escapeHtml(m.name)}" />
      <input type="text" class="pg-kurz" data-feld="kurz" value="${escapeHtml(m.kurz)}" placeholder="Kürzel" />
      ${appData.mannschaften.length > 1 ? `<button class="icon-btn admin-only" data-remove-mannschaft="${i}" title="Entfernen">×</button>` : ""}
    </div>`).join("");

  el("vw-saison-name").value = s.bezeichnung;
  el("vw-saison-liga").value = s.liga;
  el("vw-saison-dauer").value = s.spieldauer;

  el("wettbewerb-list").innerHTML = s.wettbewerbe.map((w, i) => `
    <div class="param-row" data-wettbewerb="${escapeHtml(w.id)}">
      <input type="text" class="pg-label" data-feld="name" value="${escapeHtml(w.name)}" />
      <select data-feld="art">${WETTBEWERB_ARTEN.map((a) => `<option value="${a.id}"${w.art === a.id ? " selected" : ""}>${escapeHtml(a.label)}</option>`).join("")}</select>
      <label class="checkbox-row"><input type="checkbox" data-feld="zaehltKarriere"${w.zaehltKarriere ? " checked" : ""} /> zählt in die Vereinsbilanz</label>
      ${s.wettbewerbe.length > 1 ? `<button class="icon-btn admin-only" data-remove-wettbewerb="${i}" title="Entfernen">×</button>` : ""}
    </div>`).join("");

  const sortiert = appData.spieler.slice().sort((a, b) => spielerName(a).localeCompare(spielerName(b), "de"));
  el("kader-liste").innerHTML = sortiert.map((p) => `
    <label class="checkbox-row"><input type="checkbox" data-kader="${escapeHtml(p.id)}"${s.kader.indexOf(p.id) !== -1 ? " checked" : ""} />
      ${escapeHtml(spielerName(p))}</label>`).join("") || `<p class="muted">Noch kein Spieler angelegt.</p>`;

  el("stamm-table").querySelector("tbody").innerHTML = sortiert.map((p) => {
    const k = Stats.karriere(p, appData.saisons);
    return `<tr data-stamm="${escapeHtml(p.id)}">
      <td><input type="text" data-feld="vorname" value="${escapeHtml(p.vorname)}" /></td>
      <td><input type="text" data-feld="nachname" value="${escapeHtml(p.nachname)}" /></td>
      <td><select data-feld="position"><option value="">—</option>${POSITIONEN.map((x) => `<option value="${x}"${p.position === x ? " selected" : ""}>${x}</option>`).join("")}</select></td>
      <td class="num"><input type="text" class="mini" data-feld="nummer" value="${escapeHtml(p.nummer)}" /></td>
      <td class="num"><input type="number" class="mini" data-feld="startSpiele" min="0" value="${p.start.spiele}" /></td>
      <td class="num"><input type="number" class="mini" data-feld="startTore" min="0" value="${p.start.tore}" /></td>
      <td class="num strong">${ein(k.spiele)} / ${ein(k.tore)}</td>
      <td><button class="icon-btn admin-only" data-remove-spieler="${escapeHtml(p.id)}" title="Spieler löschen">×</button></td>
    </tr>`;
  }).join("");

  const map = spielerById();
  el("nachtrag-list").innerHTML = s.nachtraege.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Spieler</th><th>Wettbewerb</th>
        <th class="num">Tore</th><th class="num">Gelb</th><th>Quelle</th></tr></thead><tbody>` +
      s.nachtraege.map((n) => {
        const w = s.wettbewerbe.find((x) => x.id === n.wettbewerbId);
        return `<tr><td>${escapeHtml(spielerName(map[n.spielerId]))}</td><td>${escapeHtml(w ? w.name : "—")}</td>
          <td class="num">${ein(n.tore)}</td><td class="num">${ein(n.gelb)}</td><td class="muted">${escapeHtml(n.quelle || "—")}</td></tr>`;
      }).join("") + `</tbody></table></div>`
    : `<p class="muted">Keine Nachträge — alle Tore und Karten hängen an einem Spiel.</p>`;
}

// ---------- Verwaltung: Aktionen ----------
function saisonNeu() {
  const name = prompt("Bezeichnung der neuen Saison:", neueSaisonBezeichnung());
  if (!name) return;
  const s = normSaison({ mannschaftId: aktiveMannschaft().id, bezeichnung: name, spieldauer: STANDARD_SPIELDAUER },
    appData.mannschaften.map((m) => m.id), appData.spieler.map((p) => p.id));
  appData.saisons.push(s);
  appData.meta.aktiveSaisonId = s.id;
  persist();
  renderAll();
}
function saisonDuplizieren() {
  const alt = aktiveSaison();
  const name = prompt("Bezeichnung der neuen Saison (Kader und Wettbewerbe werden übernommen, keine Spiele):", neueSaisonBezeichnung());
  if (!name) return;
  const neu = clone(alt);
  neu.id = uuid();
  neu.bezeichnung = name;
  neu.spiele = [];
  neu.nachtraege = [];
  neu.wettbewerbe = neu.wettbewerbe.map((w) => Object.assign({}, w, { id: uuid() }));
  appData.saisons.push(neu);
  appData.meta.aktiveSaisonId = neu.id;
  persist();
  renderAll();
}
function saisonLoeschen() {
  if (saisonsDerMannschaft().length <= 1) { alert("Die letzte Saison dieser Mannschaft lässt sich nicht löschen."); return; }
  const s = aktiveSaison();
  if (!confirm(`Saison „${s.bezeichnung}“ mit allen ${s.spiele.length} Spielen endgültig löschen?`)) return;
  appData.saisons = appData.saisons.filter((x) => x.id !== s.id);
  appData.meta.aktiveSaisonId = saisonsDerMannschaft()[0].id;
  persist();
  renderAll();
}
function mannschaftAdd() {
  const name = prompt("Name der neuen Mannschaft:", "2. Mannschaft");
  if (!name) return;
  const m = { id: uuid(), name: name, kurz: "" };
  appData.mannschaften.push(m);
  const s = normSaison({ mannschaftId: m.id, bezeichnung: neueSaisonBezeichnung() },
    appData.mannschaften.map((x) => x.id), appData.spieler.map((p) => p.id));
  appData.saisons.push(s);
  persist();
  renderAll();
}
function spielerAdd() {
  const name = prompt("Name des neuen Spielers (Vorname Nachname):", "");
  if (!name) return;
  const teile = name.trim().split(/\s+/);
  const p = normSpieler({ vorname: teile[0], nachname: teile.slice(1).join(" ") });
  appData.spieler.push(p);
  aktiveSaison().kader.push(p.id);
  persist();
  renderAll();
}
function spielerLoeschen(id) {
  const p = appData.spieler.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`„${spielerName(p)}“ löschen? Alle Einsätze, Tore und Karten dieses Spielers verschwinden aus allen Saisons.`)) return;
  appData.spieler = appData.spieler.filter((x) => x.id !== id);
  appData = normalizeData(appData);
  persist();
  renderAll();
}

// ---------- Import ----------
function importDatei(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const daten = JSON.parse(reader.result);
      const bericht = importAnwenden(daten);
      el("import-status").textContent = bericht;
      persist();
      renderAll();
    } catch (e) {
      console.error("Import fehlgeschlagen", e);
      el("import-status").textContent = "Import fehlgeschlagen: " + e.message;
      alert("Import fehlgeschlagen: " + e.message);
    }
  };
  reader.readAsText(file);
}
// Erwartet { spieler: [...], saison: {...} }. Spieler werden anhand des
// Namens zusammengefuehrt, damit ein zweiter Import keine Doppel anlegt.
function importAnwenden(daten) {
  if (!daten || !Array.isArray(daten.spieler) || !daten.saison) {
    throw new Error("Die Datei enthält keine Spieler und keine Saison.");
  }
  if (!confirm(`Import: ${daten.spieler.length} Spieler und die Saison „${daten.saison.bezeichnung || "?"}“ ` +
      `mit ${(daten.saison.spiele || []).length} Spielen hinzufügen?`)) {
    return "Abgebrochen.";
  }
  const idMap = {};
  let neuSpieler = 0, verknuepft = 0;
  for (const roh of daten.spieler) {
    const p = normSpieler(roh);
    const vorhanden = appData.spieler.find((x) =>
      spielerName(x).toLowerCase() === spielerName(p).toLowerCase());
    if (vorhanden) {
      idMap[roh.id] = vorhanden.id;
      if (!vorhanden.start.spiele && !vorhanden.start.tore) vorhanden.start = p.start;
      verknuepft++;
    } else {
      p.id = uuid();
      appData.spieler.push(p);
      idMap[roh.id] = p.id;
      neuSpieler++;
    }
  }

  const ersetze = (id) => (id && idMap[id]) ? idMap[id] : (id || null);
  const s = clone(daten.saison);
  s.id = uuid();
  s.mannschaftId = aktiveMannschaft().id;
  s.kader = (s.kader || []).map(ersetze);
  const wMap = {};
  s.wettbewerbe = (s.wettbewerbe || []).map((w) => {
    const neu = Object.assign({}, w, { id: uuid() });
    wMap[w.id] = neu.id;
    return neu;
  });
  s.spiele = (s.spiele || []).map((sp) => {
    const neu = clone(sp);
    neu.id = uuid();
    neu.wettbewerbId = wMap[sp.wettbewerbId] || s.wettbewerbe[0].id;
    const e = {};
    for (const alt of Object.keys(sp.einsaetze || {})) e[ersetze(alt)] = sp.einsaetze[alt];
    neu.einsaetze = e;
    neu.wechsel = (sp.wechsel || []).map((w) => ({ minute: w.minute, rausId: ersetze(w.rausId), reinId: ersetze(w.reinId) }));
    neu.tore = (sp.tore || []).map((t) => Object.assign({}, t, { schuetzeId: ersetze(t.schuetzeId), vorlageId: ersetze(t.vorlageId) }));
    neu.karten = (sp.karten || []).map((k) => Object.assign({}, k, { spielerId: ersetze(k.spielerId) }));
    neu.aufstellung = { feld: ((sp.aufstellung || {}).feld || []).map((p) => Object.assign({}, p, { spielerId: ersetze(p.spielerId) })) };
    return neu;
  });
  s.nachtraege = (s.nachtraege || []).map((n) =>
    Object.assign({}, n, { spielerId: ersetze(n.spielerId), wettbewerbId: wMap[n.wettbewerbId] || s.wettbewerbe[0].id }));

  appData.saisons.push(s);
  appData.meta.aktiveSaisonId = s.id;
  appData = normalizeData(appData);
  return `Importiert: ${neuSpieler} neue Spieler, ${verknuepft} mit vorhandenen verknüpft, ` +
    `Saison „${s.bezeichnung}“ mit ${s.spiele.length} Spielen und ${s.nachtraege.length} Nachträgen.`;
}

// ================= Info =================
function renderMeta() {
  const s = aktiveSaison();
  const rows = [
    ["Aktive Mannschaft", aktiveMannschaft().name],
    ["Aktive Saison", s.bezeichnung + (s.liga ? " · " + s.liga : "")],
    ["Spiele in dieser Saison", String(s.spiele.length)],
    ["Saisons gesamt", String(appData.saisons.length)],
    ["Spieler gesamt", String(appData.spieler.length)],
    ["Letzter Stand", appData.meta.stand ? new Date(appData.meta.stand).toLocaleString("de-DE") : "—"]
  ];
  el("meta-view").innerHTML = rows.map(([k, v]) =>
    `<div class="form-field"><label>${escapeHtml(k)}</label><span>${escapeHtml(v)}</span></div>`).join("");
}
function renderVersionInfo() {
  document.querySelectorAll("#version-badge-2").forEach((e) => { e.textContent = "v" + APP_VERSION; });
  const list = el("changelog-list");
  if (!list) return;
  list.innerHTML = APP_CHANGELOG.map((entry) => `
    <div class="changelog-entry">
      <div class="cv">Version ${escapeHtml(entry.version)}</div>
      ${entry.groups.map((g) => `
        <div class="changelog-group">
          <div class="cg-title">${escapeHtml(g.title)}</div>
          <ul class="cg-items">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>`).join("")}
    </div>`).join("");
}

// ================= Rendern / Tabs =================
function renderAll() {
  renderMannschaftSelect();
  renderSaisonSelect();
  renderSpieleTab();
  renderMatrix();
  renderSpielerTab();
  renderAuswertung();
  renderVerwaltung();
  renderMeta();
  renderVersionInfo();
  applyEditVisibility();
  if (offenesSpielId) renderSpielDetail();
}
function switchTab(tab) {
  // Beim Verlassen einer Ansicht den Debounce ausloesen — sonst gehen die
  // letzten Eingaben verloren (flottenweite Regel).
  saveNow();
  currentTab = tab;
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "spiele") { if (offenesSpielId) renderSpielDetail(); else renderSpieleTab(); }
  if (tab === "matrix") renderMatrix();
  if (tab === "spieler") { if (offenerSpielerId) renderSpielerDetail(); else renderSpielerTab(); }
  if (tab === "auswertung") renderAuswertung();
  if (tab === "verwaltung") renderVerwaltung();
  if (tab === "info") { renderMeta(); renderVersionInfo(); }
  applyEditVisibility();
}

// ================= Gateway: Laden / Speichern =================
function setSaveStatus(text, kind) {
  const e = el("save-status");
  if (!e) return;
  e.textContent = text;
  e.className = "header-status" + (kind ? " is-" + kind : "");
}
function persist() {
  if (!canEdit()) return;
  clearTimeout(persistTimer);
  setSaveStatus("Änderung noch nicht gespeichert…", "pending");
  ungespeicherteAenderungen = true;
  persistTimer = setTimeout(doPersist, 300);
}
async function saveNow() {
  if (!ungespeicherteAenderungen && !saveDirty) return true;
  clearTimeout(persistTimer);
  return doPersist();
}

// Es darf immer nur EIN dav-save unterwegs sein: gatewayRev (das ETag) wird erst
// aktualisiert, wenn ein Save zurueckkommt. Ein zweiter Save, der waehrenddessen
// startet, schickt dasselbe veraltete ETag und wird mit 409 abgelehnt — fuer die
// bearbeitende Person sieht das aus wie „anderes Gerät", obwohl sie allein ist.
// Deshalb: waehrend eines laufenden Saves nur vormerken und danach nachschreiben.
let saveRunner = null;
let saveDirty = false;
let ungespeicherteAenderungen = false;
let letzterSaveFehlgeschlagen = false;

function doPersist() {
  saveDirty = true;
  ungespeicherteAenderungen = true;
  if (!saveRunner) saveRunner = runSaveLoop().finally(() => { saveRunner = null; });
  return saveRunner;
}
async function runSaveLoop() {
  let ok = true;
  while (saveDirty) {
    saveDirty = false;
    ok = await writeToGateway();
    if (!ok) { saveDirty = false; break; }
  }
  ungespeicherteAenderungen = !ok;
  letzterSaveFehlgeschlagen = !ok;
  return ok;
}
async function writeToGateway() {
  setSaveStatus("Speichern…", "pending");
  try {
    appData.meta = Object.assign({}, appData.meta, { stand: new Date().toISOString() });
    await gatewaySave(appData);
    const t = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    setSaveStatus("Gespeichert " + t, "ok");
    return true;
  } catch (e) {
    if (e instanceof ConflictError) { await reloadAfterConflict(); setSaveStatus("Von anderem Gerät aktualisiert", ""); return false; }
    if (e instanceof NotLoggedInError) { showConnectScreen("Sitzung abgelaufen — bitte neu anmelden."); return false; }
    console.error("Speichern fehlgeschlagen", e);
    setSaveStatus("Nicht gespeichert", "error");
    alert("Speichern fehlgeschlagen: " + e.message);
    return false;
  }
}
async function reloadAfterConflict() {
  try {
    appData = normalizeData(await gatewayLoad());
    renderAll();
    alert("Die Daten wurden zwischenzeitlich auf einem anderen Gerät geändert — der aktuelle Stand wurde neu geladen. Bitte die letzte Änderung bei Bedarf erneut vornehmen.");
  } catch (e) {
    console.error("Neuladen nach Konflikt fehlgeschlagen", e);
  }
}
// Sicherheitsnetz beim Verlassen der Seite: ein noch nicht abgelaufener
// Debounce-Timer und ein laufender fetch gehen beim Entladen verloren. Der
// keepalive-Request ueberlebt das Schliessen des Tabs; nachgefragt wird nur,
// wenn dieser Weg nicht traegt.
window.addEventListener("beforeunload", (e) => {
  if (!ungespeicherteAenderungen) return;
  const abgeschickt = gatewaySaveBeacon(appData);
  if (abgeschickt && !letzterSaveFehlgeschlagen) return;
  e.preventDefault();
  e.returnValue = "";
});

// ================= Start =================
function showConnectScreen(errorMsg) {
  el("connect-screen").style.display = "";
  el("app-shell").style.display = "none";
  el("cloud-error").textContent = errorMsg ? "Fehler: " + errorMsg : "";
}
async function startApp() {
  el("connect-screen").style.display = "none";
  el("app-shell").style.display = "";
  try { currentUser = await fetchMe(); } catch (_) { /* best effort */ }
  renderAll();
  renderHeaderUser();
}
async function init() {
  setupListeners();
  if (!getSessionToken()) { showConnectScreen(); return; }
  try {
    appData = normalizeData(await gatewayLoad());
    await startApp();
  } catch (e) {
    if (e instanceof NotLoggedInError) { showConnectScreen(); return; }
    console.error("Nextcloud-Zugriff über Login fehlgeschlagen", e);
    showConnectScreen(e.message);
  }
}

// ---------- Ereignisse ----------
function feldBinden(elementId, setter) {
  const e = el(elementId);
  if (!e) return;
  const handler = () => { setter(e.value); persist(); };
  e.addEventListener("change", handler);
  if (e.type === "text" || e.type === "number") e.addEventListener("input", handler);
}

function setupListeners() {
  document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  el("mannschaft-select").addEventListener("change", (e) => {
    saveNow();
    appData.meta.aktiveMannschaftId = e.target.value;
    const liste = saisonsDerMannschaft();
    appData.meta.aktiveSaisonId = liste.length ? liste[liste.length - 1].id : appData.saisons[0].id;
    offenesSpielId = null; offenerSpielerId = null;
    aktiverWettbewerbId = matrixWettbewerbId = auswertungWettbewerbId = null;
    el("spiel-detail-view").classList.add("hidden");
    el("spiele-liste-view").classList.remove("hidden");
    el("spieler-detail-view").classList.add("hidden");
    el("spieler-liste-view").classList.remove("hidden");
    persist(); renderAll();
  });
  el("saison-select").addEventListener("change", (e) => {
    saveNow();
    appData.meta.aktiveSaisonId = e.target.value;
    offenesSpielId = null;
    aktiverWettbewerbId = matrixWettbewerbId = auswertungWettbewerbId = null;
    el("spiel-detail-view").classList.add("hidden");
    el("spiele-liste-view").classList.remove("hidden");
    persist(); renderAll();
  });

  // ---- Spiele-Liste ----
  el("spiele-rows").addEventListener("click", (e) => {
    const row = e.target.closest(".list-row[data-spiel]");
    if (row) oeffneSpiel(row.dataset.spiel);
  });
  el("btn-neues-spiel").addEventListener("click", neuesSpiel);
  el("btn-zurueck-liste").addEventListener("click", zurueckZurListe);
  el("btn-spiel-loeschen").addEventListener("click", spielLoeschen);
  el("btn-word-bericht").addEventListener("click", wordBerichtErzeugen);

  // ---- Spiel-Kopfdaten ----
  const sp = () => offenesSpiel();
  feldBinden("sd-wettbewerb", (v) => { sp().wettbewerbId = v; });
  feldBinden("sd-runde", (v) => { sp().runde = v; });
  feldBinden("sd-nr", (v) => { sp().nr = nummer(v); });
  feldBinden("sd-datum", (v) => { sp().datum = v; });
  feldBinden("sd-anstoss", (v) => { sp().anstoss = v; });
  feldBinden("sd-heim", (v) => { sp().heim = v === "1"; renderBerichtVorschau(); });
  feldBinden("sd-gegner", (v) => { sp().gegner = v; renderBerichtVorschau(); });
  feldBinden("sd-ort", (v) => { sp().ort = v; renderBerichtVorschau(); });
  feldBinden("sd-zuschauer", (v) => { sp().zuschauer = v === "" ? null : nummer(v); renderBerichtVorschau(); });
  feldBinden("sd-dauer", (v) => { sp().dauer = nummer(v) > 0 ? nummer(v) : null; });
  feldBinden("sd-schiri", (v) => { sp().schiedsrichter = v.split(";").map((x) => x.trim()).filter(Boolean); renderBerichtVorschau(); });
  feldBinden("sd-notiz", (v) => { sp().notiz = v; });
  feldBinden("sd-formation", (v) => { sp().formation = v; });
  el("btn-formation-anwenden").addEventListener("click", formationAnwenden);

  // ---- Kaderlisten ----
  document.querySelectorAll("#liste-start, #liste-bank, #liste-fehlt").forEach((c) => {
    c.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-setrolle]");
      if (!btn) return;
      const row = btn.closest(".kader-row");
      setzeRolle(row.dataset.spieler, btn.dataset.setrolle);
    });
    c.addEventListener("change", (e) => {
      if (!e.target.matches("select[data-grund]")) return;
      const row = e.target.closest(".kader-row");
      setzeGrund(row.dataset.spieler, e.target.value);
    });
  });

  // ---- Ereignislisten (Wechsel / Tore / Karten) ----
  const listen = { "wechsel-list": "wechsel", "tore-list": "tore", "karten-list": "karten" };
  for (const id of Object.keys(listen)) {
    const feldName = listen[id];
    el(id).addEventListener("change", (e) => ereignisAendern(feldName, e));
    el(id).addEventListener("input", (e) => { if (e.target.matches("input")) ereignisAendern(feldName, e); });
    el(id).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-remove]");
      if (!btn) return;
      const idx = Number(btn.closest(".ereignis-row").dataset.idx);
      offenesSpiel()[feldName].splice(idx, 1);
      if (feldName === "wechsel") synchronisiereRollenAusWechseln();
      persist();
      renderSpielDetail();
    });
  }
  el("btn-wechsel-add").addEventListener("click", wechselAdd);
  el("btn-wechsel-paaren").addEventListener("click", offeneWechselPaaren);
  el("btn-tor-add").addEventListener("click", torAdd);
  el("btn-karte-add").addEventListener("click", karteAdd);

  // ---- Matrix ----
  el("matrix-body").addEventListener("click", (e) => {
    const zelle = e.target.closest("td.mx-cell");
    if (!zelle) return;
    oeffneZelle(zelle.closest("tr").dataset.spiel, zelle.dataset.spieler);
  });
  el("zm-rolle").addEventListener("change", zelleFelderAnzeigen);
  el("btn-zelle-speichern").addEventListener("click", zelleSpeichern);
  el("btn-zelle-abbrechen").addEventListener("click", zelleSchliessen);
  el("zelle-modal-close").addEventListener("click", zelleSchliessen);
  el("btn-zelle-leeren").addEventListener("click", () => { el("zm-rolle").value = ""; zelleFelderAnzeigen(); zelleSpeichern(); });
  el("zelle-modal").addEventListener("click", (e) => { if (e.target.id === "zelle-modal") zelleSchliessen(); });

  // ---- Spieler ----
  el("spieler-suche").addEventListener("input", renderSpielerTab);
  el("spieler-nur-kader").addEventListener("change", renderSpielerTab);
  el("spieler-table").querySelector("tbody").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-spieler]");
    if (row) oeffneSpieler(row.dataset.spieler);
  });
  el("btn-zurueck-spieler").addEventListener("click", zurueckZuSpielern);

  // ---- Verwaltung ----
  el("mannschaft-list").addEventListener("input", (e) => {
    const row = e.target.closest("[data-mannschaft]");
    if (!row || !e.target.dataset.feld) return;
    const m = appData.mannschaften.find((x) => x.id === row.dataset.mannschaft);
    if (m) { m[e.target.dataset.feld] = e.target.value; persist(); renderMannschaftSelect(); }
  });
  el("mannschaft-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-mannschaft]");
    if (!btn) return;
    const idx = Number(btn.dataset.removeMannschaft);
    const m = appData.mannschaften[idx];
    const anzahl = appData.saisons.filter((s) => s.mannschaftId === m.id).length;
    if (!confirm(`Mannschaft „${m.name}“ mit ${anzahl} Saison(s) und allen Spielen löschen?`)) return;
    appData.mannschaften.splice(idx, 1);
    appData.saisons = appData.saisons.filter((s) => s.mannschaftId !== m.id);
    appData = normalizeData(appData);
    persist(); renderAll();
  });
  el("btn-mannschaft-add").addEventListener("click", mannschaftAdd);

  feldBinden("vw-saison-name", (v) => { aktiveSaison().bezeichnung = v; renderSaisonSelect(); });
  feldBinden("vw-saison-liga", (v) => { aktiveSaison().liga = v; });
  feldBinden("vw-saison-dauer", (v) => { aktiveSaison().spieldauer = nummer(v) > 0 ? nummer(v) : STANDARD_SPIELDAUER; });
  el("btn-saison-neu").addEventListener("click", saisonNeu);
  el("btn-saison-duplizieren").addEventListener("click", saisonDuplizieren);
  el("btn-saison-loeschen").addEventListener("click", saisonLoeschen);

  el("wettbewerb-list").addEventListener("input", (e) => wettbewerbAendern(e));
  el("wettbewerb-list").addEventListener("change", (e) => wettbewerbAendern(e));
  el("wettbewerb-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-wettbewerb]");
    if (!btn) return;
    const s = aktiveSaison();
    const w = s.wettbewerbe[Number(btn.dataset.removeWettbewerb)];
    const anzahl = s.spiele.filter((x) => x.wettbewerbId === w.id).length;
    if (!confirm(`Wettbewerb „${w.name}“ mit ${anzahl} Spielen löschen?`)) return;
    s.spiele = s.spiele.filter((x) => x.wettbewerbId !== w.id);
    s.nachtraege = s.nachtraege.filter((x) => x.wettbewerbId !== w.id);
    s.wettbewerbe.splice(Number(btn.dataset.removeWettbewerb), 1);
    aktiverWettbewerbId = matrixWettbewerbId = auswertungWettbewerbId = null;
    persist(); renderAll();
  });
  el("btn-wettbewerb-add").addEventListener("click", () => {
    aktiveSaison().wettbewerbe.push(normWettbewerb({ name: "Neuer Wettbewerb", art: "sonstiges", zaehltKarriere: true }));
    persist(); renderAll();
  });

  el("kader-liste").addEventListener("change", (e) => {
    if (!e.target.matches("input[data-kader]")) return;
    const s = aktiveSaison();
    const id = e.target.dataset.kader;
    if (e.target.checked) { if (s.kader.indexOf(id) === -1) s.kader.push(id); }
    else s.kader = s.kader.filter((x) => x !== id);
    appData = normalizeData(appData);
    persist(); renderAll();
  });

  el("stamm-table").addEventListener("input", (e) => stammAendern(e));
  el("stamm-table").addEventListener("change", (e) => stammAendern(e));
  el("stamm-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-spieler]");
    if (btn) spielerLoeschen(btn.dataset.removeSpieler);
  });
  el("btn-spieler-add").addEventListener("click", spielerAdd);

  el("btn-import").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => { importDatei(e.target.files[0]); e.target.value = ""; });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("zelle-modal").classList.contains("hidden")) zelleSchliessen();
  });
}

function ereignisAendern(feldName, e) {
  const row = e.target.closest(".ereignis-row");
  if (!row || !e.target.dataset.feld) return;
  const spiel = offenesSpiel();
  const eintrag = spiel[feldName][Number(row.dataset.idx)];
  if (!eintrag) return;
  const feld = e.target.dataset.feld;
  const v = e.target.value;
  if (feld === "minute") eintrag.minute = Stats.clampMinute(v, dauerVon(spiel));
  else if (feld === "fuerUns") { eintrag.fuerUns = v === "1"; if (!eintrag.fuerUns) eintrag.schuetzeId = null; }
  else if (feld === "rausId" || feld === "reinId" || feld === "schuetzeId" || feld === "vorlageId" || feld === "spielerId") eintrag[feld] = v || null;
  else eintrag[feld] = v;
  if (feldName === "wechsel") {
    if (feld === "rausId" || feld === "reinId") wechselEindeutigMachen(spiel, Number(row.dataset.idx), feld);
    synchronisiereRollenAusWechseln();
  }
  persist();
  if (feldName === "wechsel") { renderKaderListen(); renderSpielfeld(); renderWechselListe(); }
  if (feldName === "tore") renderSpielDetailErgebnis();
  renderBerichtVorschau();
  // Die Zeile wird bewusst NICHT neu gezeichnet, solange getippt wird — sonst
  // verliert das Feld den Fokus mitten in der Eingabe.
  if (e.type === "change" && (feldName !== "wechsel" || feld === "minute")) return;
}

function wettbewerbAendern(e) {
  const row = e.target.closest("[data-wettbewerb]");
  if (!row || !e.target.dataset.feld) return;
  const w = aktiveSaison().wettbewerbe.find((x) => x.id === row.dataset.wettbewerb);
  if (!w) return;
  const feld = e.target.dataset.feld;
  w[feld] = feld === "zaehltKarriere" ? e.target.checked : e.target.value;
  persist();
  if (feld === "name") { renderSpieleTab(); renderMatrix(); renderAuswertung(); }
}
function stammAendern(e) {
  const row = e.target.closest("[data-stamm]");
  if (!row || !e.target.dataset.feld) return;
  const p = appData.spieler.find((x) => x.id === row.dataset.stamm);
  if (!p) return;
  const feld = e.target.dataset.feld;
  if (feld === "startSpiele") p.start.spiele = nummer(e.target.value);
  else if (feld === "startTore") p.start.tore = nummer(e.target.value);
  else p[feld] = e.target.value;
  persist();
}

document.addEventListener("DOMContentLoaded", init);

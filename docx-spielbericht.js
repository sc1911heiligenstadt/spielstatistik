// Spielbericht als Word-Datei — vollstaendig im Browser erzeugt (JSZip).
//
// Warum von Grund auf und nicht per Vorlage: `dokumentenvorlagen/docx-fill.js`
// ersetzt {{PLATZHALTER}} in einer vorhandenen .docx, kann aber KEIN Bild
// einsetzen. Der Bericht braucht die Aufstellungsgrafik. Eine .docx ist ein ZIP
// mit XML — sie hier selbst zu bauen ist weniger Aufwand als eine Vorlage mit
// Bildteil zu pflegen, und es entfaellt das Split-Run-Problem von Word.
//
// Uebernommen aus docx-fill.js: das XML-Escaping (dort dokumentiert, inklusive
// des Gotchas, den Replacer als Funktion zu uebergeben — hier nicht noetig, weil
// nichts ersetzt, sondern gebaut wird).

const DocxSpielbericht = (() => {

  const EMU_PRO_PIXEL = 9525;          // 914400 EMU pro Zoll / 96 dpi
  const GRAFIK_ZOLL = 4.2;             // Zielbreite im Dokument

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function run(text, opt) {
    const o = opt || {};
    const rPr =
      `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>` +
      (o.fett ? `<w:b/>` : ``) +
      `<w:sz w:val="${o.groesse || 22}"/></w:rPr>`;
    // xml:space="preserve" haelt fuehrende/abschliessende Leerzeichen —
    // ohne das frisst Word die Einrueckung der Ergebniszeile.
    return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }

  function absatz(inhalt, opt) {
    const o = opt || {};
    const pPr =
      `<w:pPr>` +
      (o.zentriert ? `<w:jc w:val="center"/>` : ``) +
      `<w:spacing w:after="${o.abstand == null ? 60 : o.abstand}"/>` +
      `</w:pPr>`;
    return `<w:p>${pPr}${inhalt}</w:p>`;
  }

  function textAbsatz(text, opt) { return absatz(run(text, opt), opt); }

  function bildAbsatz(breitePx, hoehePx) {
    const cx = Math.round(GRAFIK_ZOLL * 914400);
    const cy = Math.round(cx * (hoehePx / breitePx));
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="1" name="Aufstellung"/>` +
      `<wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic>` +
      `<pic:nvPicPr><pic:cNvPr id="1" name="Aufstellung"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline>` +
      `</w:drawing></w:r></w:p>`;
  }

  // ---------- Inhalt aus den Spieldaten ----------
  // `ctx` = { spielerById, saison, mannschaft }
  function nachname(ctx, spielerId) {
    const s = ctx.spielerById[spielerId];
    return s ? (s.nachname || s.vorname || "?") : "?";
  }

  function ueberschrift(spiel) {
    const gegner = spiel.gegner || "Gegner";
    return spiel.heim ? `${VEREIN_NAME} – ${gegner}` : `${gegner} – ${VEREIN_NAME}`;
  }

  // Ergebnis in der Leserichtung der Ueberschrift (Heimmannschaft zuerst).
  function ergebnisZeile(spiel) {
    const e = Stats.ergebnis(spiel);
    const links = spiel.heim ? e.eigene : e.gegner;
    const rechts = spiel.heim ? e.gegner : e.eigene;
    return `${links} – ${rechts}`;
  }

  function datumLang(iso) {
    if (!iso) return "";
    const [j, m, t] = iso.split("-");
    return `${t}.${m}.${j}`;
  }

  // "Wolanski (GK, 34.min), Roth (RK, 88.min)" — jede Karte einzeln mit ihrer
  // Minute, in derselben Schreibweise wie die Wechsel. Die fruehere Sammelform
  // ("beide GK") sparte Worte, hatte aber keinen Platz fuer die Minute.
  // Ohne erfasste Minute bleibt es bei "(GK)" — eine geratene 0. waere falsch.
  function karten(spiel, ctx) {
    const liste = (spiel.karten || []).slice().sort((a, b) => a.minute - b.minute);
    if (!liste.length) return "";
    return liste.map((k) => {
      const kurz = (KARTEN_ARTEN.find((x) => x.id === k.art) || {}).kurz;
      const m = Number(k.minute);
      const minute = isFinite(m) && m > 0 ? `, ${m}.min` : "";
      return `${nachname(ctx, k.spielerId)} (${kurz}${minute})`;
    }).join(", ");
  }

  // "1:0 Schlätzer; 1:1 Schnellhardt" — laufender Spielstand aus Sicht der
  // Heimmannschaft, wie in der Ueberschrift.
  function tore(spiel, ctx) {
    const liste = (spiel.tore || []).slice().sort((a, b) => a.minute - b.minute);
    if (!liste.length) return "";
    let links = 0, rechts = 0;
    return liste.map((t) => {
      const fuerLinks = spiel.heim ? t.fuerUns : !t.fuerUns;
      if (fuerLinks) links++; else rechts++;
      const name = t.schuetzeId ? nachname(ctx, t.schuetzeId) : (t.schuetzeName || "");
      const zusatz = t.art === "elfmeter" ? " (FE)" : t.art === "eigentor" ? " (ET)" : "";
      return `${links}:${rechts} ${name}${zusatz}`.trim();
    }).join("; ");
  }

  function wechsel(spiel, ctx) {
    const vollstaendig = (spiel.wechsel || [])
      .filter((w) => w.rausId && w.reinId)
      .sort((a, b) => a.minute - b.minute);
    return vollstaendig.map((w) =>
      `${nachname(ctx, w.reinId)} für ${nachname(ctx, w.rausId)} (${w.minute}.min)`).join("; ");
  }

  // Liefert die Zeilen des Berichts — auch fuer die Vorschau in der App, damit
  // sichtbar ist, was gleich in der Datei steht.
  function zeilen(spiel, ctx) {
    const kopf = [];
    if (spiel.datum) kopf.push(`Datum: ${datumLang(spiel.datum)}`);
    if (spiel.anstoss) kopf.push(`Anstoß: ${spiel.anstoss} Uhr`);
    if (spiel.ort) kopf.push(`Ort: ${spiel.ort}`);

    const z = [];
    if (kopf.length) z.push({ label: "", text: kopf.join("                     ") });
    const k = karten(spiel, ctx);
    if (k) z.push({ label: "Karten", text: k });
    const t = tore(spiel, ctx);
    if (t) z.push({ label: "Tore", text: t });
    const w = wechsel(spiel, ctx);
    if (w) z.push({ label: "Wechsel", text: w });
    const sr = (spiel.schiedsrichter || []).filter(Boolean);
    if (sr.length) z.push({ label: "Schiedsrichter", text: sr.join("; ") });
    if (spiel.zuschauer) z.push({ label: "Zuschauer", text: String(spiel.zuschauer) });
    return z;
  }

  function dateiName(spiel, ctx) {
    const nr = spiel.nr ? String(spiel.nr) + "." : "";
    const art = (ctx.saison.wettbewerbe.find((x) => x.id === spiel.wettbewerbId) || {}).art;
    const kuerzel = art === "liga" ? "ST" : "Runde";
    const d = spiel.datum ? datumLang(spiel.datum).replace(/\./g, ".") : "";
    return `${nr}${kuerzel} ${d} ${spiel.gegner || ""}`.trim().replace(/[\\/:*?"<>|]/g, "-") + ".docx";
  }

  // ---------- Datei bauen ----------
  // `grafik` ist ein PNG-Blob (oder null). Ohne Grafik entfaellt der Bildteil
  // komplett — eine Beziehung auf eine fehlende Datei wuerde Word beanstanden.
  // JSZip steht bewusst NICHT fest im <head>: gebraucht wird es nur hier, beim
  // Erzeugen eines Spielberichts, kostete dort aber 28 KB bei JEDEM Seitenaufbau.
  // Erster Bedarf laedt nach, jeder weitere Aufruf bekommt dieselbe Promise
  // (Muster aus raumnutzung/app.js ladeJsZip).
  let _jsZipLadevorgang = null;
  function ladeJsZip() {
    if (typeof JSZip !== "undefined") return Promise.resolve();
    if (_jsZipLadevorgang) return _jsZipLadevorgang;
    _jsZipLadevorgang = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      s.onload = () => resolve();
      s.onerror = () => {
        _jsZipLadevorgang = null; // naechster Versuch darf es erneut probieren
        reject(new Error("ZIP-Bibliothek konnte nicht geladen werden (Internetverbindung noetig)."));
      };
      document.head.appendChild(s);
    });
    return _jsZipLadevorgang;
  }

  async function erzeuge(spiel, ctx, grafik) {
    await ladeJsZip();
    const koerper = [];
    koerper.push(textAbsatz(ueberschrift(spiel), { fett: true, groesse: 32, zentriert: true, abstand: 0 }));
    koerper.push(textAbsatz(ergebnisZeile(spiel), { fett: true, groesse: 32, zentriert: true, abstand: 240 }));

    for (const z of zeilen(spiel, ctx)) {
      if (!z.label) { koerper.push(textAbsatz(z.text)); continue; }
      koerper.push(absatz(run(z.label + ": ", { fett: true }) + run(z.text)));
    }
    koerper.push(textAbsatz("Aufstellung:", { fett: true, abstand: 120 }));
    if (grafik) koerper.push(bildAbsatz(GRAFIK_BREITE, GRAFIK_HOEHE));

    const sectPr =
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ` +
      `w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;

    const documentXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<w:body>${koerper.join("")}${sectPr}</w:body></w:document>`;

    const contentTypes =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      (grafik ? `<Default Extension="png" ContentType="image/png"/>` : ``) +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`;

    const rels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`;

    const docRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      (grafik ? `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/aufstellung.png"/>` : ``) +
      `</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes);
    zip.file("_rels/.rels", rels);
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", docRels);
    if (grafik) zip.file("word/media/aufstellung.png", grafik);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
  }

  return { erzeuge, zeilen, ueberschrift, ergebnisZeile, dateiName, karten, tore, wechsel, esc };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { DocxSpielbericht };

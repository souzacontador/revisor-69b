/* Entregables en Excel (.xlsx) generados en el navegador, sin librerías.
 * Un .xlsx es un ZIP con XML (Office Open XML). Aquí se escribe el ZIP sin compresión
 * (método 0) y las hojas con cadenas en línea; Excel recalcula las fórmulas al abrir.
 * Hojas: «Tabla por operación», «Resumen por proveedor», «Notas» y «Trazabilidad». */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util || (typeof require !== 'undefined' ? require('./util.js').util : null);

  // ---------------- ZIP (sin compresión) ----------------
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(archivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let offset = 0;
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    for (const [nombre, texto] of archivos) {
      const n = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
      loc.setUint16(10, hora, true); loc.setUint16(12, dia, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, d.length, true); loc.setUint32(22, d.length, true); loc.setUint16(26, n.length, true); loc.setUint16(28, 0, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, hora, true); cen.setUint16(14, dia, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, d.length, true); cen.setUint32(24, d.length, true); cen.setUint16(28, n.length, true);
      cen.setUint32(42, offset, true);
      partes.push(new Uint8Array(loc.buffer), n, d);
      central.push(new Uint8Array(cen.buffer), n);
      offset += 30 + n.length + d.length;
    }
    const tamCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
    const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
    let p = 0; for (const x of todo) { out.set(x, p); p += x.length; }
    return out;
  }

  // ---------------- Estilos (índices de cellXfs) ----------------
  const S = { base: 0, enc: 1, texto: 2, moneda: 3, fecha: 4, titulo: 5, sub: 6, alto: 7, medio: 8, bajo: 9, info: 10, totalTxt: 11, totalMon: 12, entero: 13, fechaLim: 14, mono: 15, fechaLimVenc: 16, nota: 17, notaTit: 18 };
  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;(&quot;$&quot;#,##0.00);&quot;-&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="10">
<font><sz val="10"/><color rgb="FF2B3138"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="14"/><color rgb="FF0A2540"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="FF545C68"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFA81D14"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF8A5A00"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF1B5E45"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF123253"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF2B3138"/><name val="Arial"/></font>
<font><b/><sz val="11"/><color rgb="FF0A2540"/><name val="Arial"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0A2540"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCEAE8"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3E0"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7F4EE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFF4F9"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF0D9"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE3E1DE"/></left><right style="thin"><color rgb="FFE3E1DE"/></right><top style="thin"><color rgb="FFE3E1DE"/></top><bottom style="thin"><color rgb="FFE3E1DE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="8" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="165" fontId="5" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // ---------------- Hojas ----------------
  const xml = (t) => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const serial = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
  const NIVEL = { alto: S.alto, medio: S.medio, bajo: S.bajo, info: S.info };
  const nivelSit = (s) => s === 'Definitivo' ? 'alto' : s === 'Presunto' ? 'medio' : s === 'No listado' ? 'info' : (s === 'Desvirtuado' || s === 'Sentencia Favorable') ? 'bajo' : 'medio';

  /** filas: arreglo de arreglos de celdas {v, s, f, t:'d'|'n'|'s'} o null. */
  function hoja(filas, opciones) {
    const op = opciones || {};
    const cols = (op.anchos || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const sd = filas.map((fila, i) => {
      if (!fila) return '';
      const r = i + 1;
      const alto = op.altos && op.altos[r] ? ` ht="${op.altos[r]}" customHeight="1"` : '';
      const celdas = fila.map((c, j) => {
        if (c == null) return '';
        const ref = col(j) + r, s = c.s != null ? ` s="${c.s}"` : '';
        if (c.f) return `<c r="${ref}"${s}><f>${xml(c.f)}</f></c>`;
        if (c.v == null || c.v === '') return `<c r="${ref}"${s}/>`;
        if (c.t === 'd') return `<c r="${ref}"${s}><v>${serial(c.v)}</v></c>`;
        if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${Math.round(c.v * 100) / 100}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
      }).join('');
      return `<row r="${r}"${alto}>${celdas}</row>`;
    }).join('');
    const congelar = op.congelar ? `<pane ySplit="${op.congelar}" topLeftCell="A${op.congelar + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"${op.activa ? ' tabSelected="1"' : ''}>${congelar}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${sd}</sheetData>${op.filtro ? `<autoFilter ref="${op.filtro}"/>` : ''}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }

  const txt = (v, s) => ({ v, s: s == null ? S.texto : s });
  const mon = (v, s) => ({ v, s: s == null ? S.moneda : s });
  const fec = (v, s) => ({ v, t: 'd', s: s == null ? S.fecha : s });
  const frm = (f, s) => ({ f, s });

  /** Genera el libro con los entregables del resultado de R69.clasificador.revisar. */
  function libroEntregables(r, meta) {
    const m = meta || {};
    const sub = `${m.contribuyente || 'Contribuyente'} · Fecha de revisión: ${U.fechaMX(r.fechaRevision)} · Listado 69-B consultado: ${r.fechaDatos || 'sin fecha'} · Cruce por RFC`;
    const n = r.operaciones.length, f0 = 5, fu = f0 + n - 1;

    // Hoja 1: tabla por operación
    const h1 = [[txt('Revisor de Proveedores 69-B · Tabla por operación', S.titulo)], [txt(sub, S.sub)], null,
      ['UUID', 'Proveedor', 'RFC', 'Fecha', 'Subtotal', 'IVA', 'Situación del proveedor', 'Veredicto', 'Motivo', 'Deducción de ISR comprometida', 'IVA acreditado comprometido'].map(t => txt(t, S.enc))];
    r.operaciones.forEach(o => {
      const comp = o.veredicto.clave !== 'SIN_RIESGO';
      h1.push([txt(o.uuid, S.mono), txt(o.proveedor), txt(o.rfc, S.mono), fec(o.fecha), mon(o.subtotal), mon(o.iva),
        txt(o.situacion, NIVEL[nivelSit(o.situacion)]), txt(o.veredicto.corto || o.veredicto.texto, NIVEL[o.veredicto.nivel]),
        txt(o.motivo + (o.nota ? ' ' + o.nota : '') + (o.ajustado ? ' Importe ajustado por el usuario.' : '')),
        comp ? mon(o.deduccion) : txt(''), comp ? mon(o.ivaComprometido) : txt('')]);
    });
    h1.push([txt(`Total (${n} operaciones)`, S.totalTxt), txt('', S.totalTxt), txt('', S.totalTxt), txt('', S.totalTxt),
      frm(`SUM(E${f0}:E${fu})`, S.totalMon), frm(`SUM(F${f0}:F${fu})`, S.totalMon), txt('', S.totalTxt), txt('', S.totalTxt), txt('', S.totalTxt),
      frm(`SUM(J${f0}:J${fu})`, S.totalMon), frm(`SUM(K${f0}:K${fu})`, S.totalMon)]);
    h1.push(null);
    const fr = h1.length + 1;
    h1.push([txt('Resumen por veredicto', S.notaTit), txt('Veredicto', S.enc), txt('CFDI', S.enc), txt('Subtotal', S.enc), txt('IVA', S.enc)]);
    [['Sin efecto fiscal', 'alto'], ['En riesgo', 'medio'], ['Requiere revisión documental', 'medio'], ['Sin riesgo', 'bajo']].forEach(([t, nv], k) => {
      const f = fr + k + 1;
      h1.push([null, txt(t, NIVEL[nv]), frm(`COUNTIF($H$${f0}:$H$${fu},B${f})`, S.entero),
        frm(`SUMIF($H$${f0}:$H$${fu},B${f},$E$${f0}:$E$${fu})`, S.moneda), frm(`SUMIF($H$${f0}:$H$${fu},B${f},$F$${f0}:$F$${fu})`, S.moneda)]);
    });

    // Hoja 2: resumen por proveedor listado
    const T = "'Tabla por operación'";
    const rg = (c) => `${T}!$${c}$${f0}:$${c}$${fu}`;
    const conISR = r.tasaISR != null;
    const enc2 = ['RFC', 'Proveedor', 'Situación', 'Veredicto', 'Publicación presunto (SAT · DOF)', 'Publicación desvirtuado (SAT · DOF)',
      'Publicación definitivo (SAT · DOF)', 'Publicación sentencia favorable (SAT · DOF)', 'CFDI', 'IVA acreditado comprometido',
      'Deducción de ISR comprometida (monto potencial)', 'Acción recomendada', 'Fecha límite', 'Cómputo del plazo'];
    if (conISR) enc2.push(`Estimación de ISR (${(r.tasaISR * 100).toFixed(2).replace(/\.00$/, '')} %)`);
    const h2 = [[txt('Revisor de Proveedores 69-B · Resumen por proveedor listado', S.titulo)], [txt(sub, S.sub)], null, enc2.map(t => txt(t, S.enc))];
    const g0 = 5;
    const pub = (p, etapa) => p.episodios.map(e => e.fechas.find(x => x.etapa === etapa)).filter(Boolean)
      .map(x => `${x.fechaSAT ? U.fechaMX(x.fechaSAT) : 's/f'} · ${x.fechaDOF ? U.fechaMX(x.fechaDOF) : 's/f'}`).join(' | ') || '—';
    r.proveedores.forEach((p, i) => {
      const g = g0 + i, pl = p.plazo;
      const conFecha = pl && pl.vence && p.episodios.length === 1;
      let computo;
      if (conFecha) {
        const omit = pl.inhabilesOmitidos.map(x => `${U.fechaMX(x.fecha)} (${x.motivo})`).join('; ') || 'ninguno';
        computo = `30 días hábiles desde la publicación en el DOF (${U.fechaMX(pl.fechaDOF)}); cuenta desde ${U.fechaMX(pl.inicioCuenta)}. Inhábiles entre semana omitidos: ${omit}. ` +
          (pl.estado === 'VENCIDO' ? `Vencido al ${U.fechaMX(r.fechaRevision)}.` : pl.estado === 'NO_INICIADO' ? `Aún no inicia al ${U.fechaMX(r.fechaRevision)} (fecha de revisión anterior a la publicación en el DOF).` : `Vigente: quedan ${pl.restantes} días hábiles al ${U.fechaMX(r.fechaRevision)}.`);
      } else computo = p.situacion === 'Presunto' ? 'El plazo de 30 días solo corre tras la publicación como definitivo.' : (p.situacion === 'Definitivo' ? p.fechaLimite : 'No aplica el plazo de 30 días del art. 69-B, párr. 8.');
      const fila = [txt(p.rfc, S.mono), txt(p.nombre), txt(p.situacion, NIVEL[nivelSit(p.situacion)]), txt(p.veredicto.corto || p.veredicto.texto, NIVEL[p.veredicto.nivel]),
        txt(pub(p, 'Presunto')), txt(pub(p, 'Desvirtuado')), txt(pub(p, 'Definitivo')), txt(pub(p, 'Sentencia favorable')),
        frm(`COUNTIF(${rg('C')},A${g})`, S.entero), frm(`SUMIF(${rg('C')},A${g},${rg('K')})`, S.moneda), frm(`SUMIF(${rg('C')},A${g},${rg('J')})`, S.moneda),
        txt(p.accion), conFecha ? fec(pl.vence, pl.estado === 'VENCIDO' ? S.fechaLimVenc : S.fechaLim) : txt(p.fechaLimite), txt(computo)];
      if (conISR) fila.push(p.veredicto.clave === 'SIN_RIESGO' ? mon(0) : frm(`ROUND(K${g}*${r.tasaISR},2)`, S.moneda));
      h2.push(fila);
    });
    const gu = g0 + r.proveedores.length - 1;
    if (r.proveedores.length) {
      const tot = enc2.map(() => txt('', S.totalTxt));
      tot[0] = txt('Total comprometido', S.totalTxt);
      tot[8] = frm(`SUM(I${g0}:I${gu})`, S.totalTxt); tot[9] = frm(`SUM(J${g0}:J${gu})`, S.totalMon); tot[10] = frm(`SUM(K${g0}:K${gu})`, S.totalMon);
      if (conISR) tot[14] = frm(`SUM(O${g0}:O${gu})`, S.totalMon);
      h2.push(tot);
    } else h2.push([txt(`Ninguno de los ${r.emisores} proveedores aparece en el listado consultado.`, S.nota)]);

    // Hoja 3: notas
    const notas = [
      ['Criterios aplicados', S.notaTit],
      ['• El cruce es solo por RFC normalizado (sin espacios, en mayúsculas). El nombre nunca decide; los nombres parecidos con otro RFC se anotan en el motivo.'],
      ['• Definitivo: sin efecto fiscal, aunque la factura sea anterior a la publicación (art. 69-B, párr. 5: «no producen ni produjeron efecto fiscal alguno»).'],
      ['• Presunto: riesgo potencial; aún no corre el plazo de 30 días para el cliente. Desvirtuado y sentencia favorable: conservan sus efectos.'],
      ['• Varios episodios de un RFC con situaciones distintas: «Requiere revisión documental». Los importes no se duplican.'],
      ['• Plazo (art. 69-B, párr. 8): 30 días hábiles a partir del día siguiente a la publicación del definitivo en el DOF, sin sábados, domingos ni inhábiles del art. 12 CFF, ni los días adicionales capturados (RMF 2026, regla 2.1.6).'],
      ['• IVA y deducción comprometidos: suma por proveedor de los CFDI sin efecto fiscal, en riesgo o en revisión. La deducción es el monto potencial (SubTotal − Descuento) salvo que se haya ajustado en la app.' + (m.notaIVA ? ' ' + m.notaIVA : '') + (conISR ? ` La estimación de ISR usa la tasa de ${(r.tasaISR * 100).toFixed(2).replace(/\.00$/, '')} %${r.regimenISR ? ' (' + r.regimenISR + ')' : ''} y es solo referencia.` : '')],
      [''], ['Fuentes', S.notaTit],
      ['• CFF 2026, arts. 12 y 69-B; RMF 2026, regla 2.1.6; Anexo 20 (CFDI 4.0).'],
      [`• Listado consultado: ${r.fechaDatos || 'sin fecha'}${m.fuenteListado ? ' · ' + m.fuenteListado : ''}.`],
      ...(m.avisosListado || []).map(a => [`• ADVERTENCIA: ${a}`, S.alto]),
      [`• Generado con el Revisor de Proveedores 69-B (versión ${R69.VERSION || ''}) el ${U.fechaMX(U.hoyISO())}.`],
      [''], ['Herramienta de apoyo: no sustituye el análisis profesional ni la consulta de las publicaciones oficiales en el DOF y en el portal del SAT.'],
      ['DSouza Consultores Fiscales · C.P. Daniel Souza Vázquez · daniel@dsouzaconsultores.mx']
    ].map(([t, s]) => [txt(t, s == null ? S.nota : s)]);

    // Hoja 4: trazabilidad (permite reconstruir la revisión: qué se usó, qué se ajustó y qué quedó fuera)
    const TZ = m.trazabilidad || {};
    const tz = [[txt('Revisor de Proveedores 69-B · Trazabilidad de la revisión', S.titulo)], [txt('Datos para reconstruir esta revisión y sus fuentes.', S.sub)], null,
      [txt('Concepto', S.enc), txt('Detalle', S.enc)]];
    const par = (k, v) => tz.push([txt(k), txt(v == null || v === '' ? '—' : String(v))]);
    par('Generado el', TZ.fechaHora);
    par('Programa', `Revisor de Proveedores 69-B, versión ${TZ.version || ''}`);
    par('Modo', TZ.modo);
    par('Receptor revisado', TZ.receptor);
    par('CFDI de otros receptores no incluidos', TZ.excluidos || 'Ninguno');
    par('Fecha de revisión', U.fechaMX(r.fechaRevision));
    par('CFDI analizados', r.operaciones.length);
    par('Listado 69-B: fuente', TZ.fuente);
    par('Listado 69-B: datos', TZ.fechaDatos);
    par('Listado 69-B: registros', TZ.registros);
    par('Listado 69-B: huella SHA-256 del archivo leído', TZ.huella);
    if (TZ.huellaMeta) par('Huella registrada por la actualización diaria', TZ.huellaMeta + (TZ.huellaMeta === TZ.huella ? ' (coincide)' : ' (NO coincide)'));
    (TZ.calendario || []).forEach((c, i) => par(i ? '' : 'Días inhábiles adicionales considerados', c));
    par('Estimación de ISR', TZ.isr);
    tz.push(null, [txt('Importes ajustados manualmente', S.notaTit)]);
    const aj = TZ.ajustes || [];
    if (aj.length) {
      tz.push(['UUID', 'Proveedor', 'RFC', 'Deducción potencial', 'Deducción considerada', 'IVA del CFDI', 'IVA considerado'].map(t => txt(t, S.enc)));
      aj.forEach(o => tz.push([txt(o.uuid, S.mono), txt(o.proveedor), txt(o.rfc, S.mono), mon(o.deduccionPotencial), mon(o.deduccion), mon(o.iva), mon(o.ivaComprometido)]));
    } else tz.push([txt('Ninguno: se usaron los importes de los CFDI.')]);
    tz.push(null, [txt('Archivos omitidos o con error', S.notaTit)]);
    const reg = TZ.registro || [];
    if (reg.length) {
      tz.push(['Tipo', 'Archivo', 'Motivo'].map(t => txt(t, S.enc)));
      reg.forEach(([tipo, archivo, motivo]) => tz.push([txt(tipo), txt(archivo), txt(motivo)]));
    } else tz.push([txt('Ninguno.')]);

    const hojas = [
      ['Tabla por operación', hoja(h1, { anchos: [38, 32, 15, 16, 15, 14, 18, 18, 60, 16, 16], congelar: 4, filtro: `A4:K${fu}`, altos: { 4: 32 }, activa: true })],
      ['Resumen por proveedor', hoja(h2, { anchos: [15, 30, 16, 18, 19, 19, 19, 19, 7, 16, 18, 58, 20, 46].concat(conISR ? [16] : []), congelar: 4, filtro: r.proveedores.length ? `A4:${col(enc2.length - 1)}${gu}` : '', altos: { 4: 44 } })],
      ['Notas', hoja(notas, { anchos: [120] })],
      ['Trazabilidad', hoja(tz, { anchos: [44, 70, 60, 18, 18, 16, 16], altos: {} })]
    ];
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map(([nombre], i) => `<sheet name="${xml(nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${hojas[1][1].includes('<autoFilter') || hojas[0][1].includes('<autoFilter') ? `<definedNames>${hojas.map(([nombre, x], i) => { const m2 = /<autoFilter ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(x); return m2 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(nombre)}'!$${m2[1]}$${m2[2]}:$${m2[3]}$${m2[4]}</definedName>` : ''; }).join('')}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Revisor de Proveedores 69-B — Entregables</dc:title><dc:creator>DSouza Consultores Fiscales</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`;
    return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['docProps/core.xml', core], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', ESTILOS],
      ...hojas.map(([, x], i) => [`xl/worksheets/sheet${i + 1}.xml`, x])]);
  }

  function descargarXLSX(nombre, bytes) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  R69.xlsx = { libroEntregables, descargarXLSX, crc32, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);

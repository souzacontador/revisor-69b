/* Lector de CFDI (XML) en el navegador.
 * Toma los datos del nodo Comprobante, Emisor, Receptor, los impuestos a nivel comprobante
 * (no los de cada concepto) y el UUID del Timbre Fiscal Digital. */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util;

  const NS = {
    cfdi40: 'http://www.sat.gob.mx/cfd/4',
    cfdi33: 'http://www.sat.gob.mx/cfd/3',
    tfd: 'http://www.sat.gob.mx/TimbreFiscalDigital'
  };
  const TIPOS = { I: 'Ingreso', E: 'Egreso', T: 'Traslado', N: 'Nómina', P: 'Pago' };

  function hijosDirectos(nodo, ns, nombre) {
    return Array.from(nodo ? nodo.children : []).filter(n => n.namespaceURI === ns && n.localName === nombre);
  }
  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

  /** Texto XML → { ok, cfdi } o { ok:false, motivo }. */
  function leerCFDI(textoXML, nombreArchivo) {
    let doc;
    try { doc = new DOMParser().parseFromString(textoXML.replace(/^﻿/, ''), 'application/xml'); }
    catch (e) { return { ok: false, motivo: 'No se pudo leer el XML.' }; }
    if (doc.getElementsByTagName('parsererror').length) return { ok: false, motivo: 'XML mal formado.' };

    const c = doc.documentElement;
    if (!c || c.localName !== 'Comprobante' || (c.namespaceURI !== NS.cfdi40 && c.namespaceURI !== NS.cfdi33)) {
      return { ok: false, motivo: 'No es un CFDI (falta el nodo cfdi:Comprobante 3.3/4.0).' };
    }
    const ns = c.namespaceURI;
    const emisor = hijosDirectos(c, ns, 'Emisor')[0];
    const receptor = hijosDirectos(c, ns, 'Receptor')[0];
    const tfd = doc.getElementsByTagNameNS(NS.tfd, 'TimbreFiscalDigital')[0];
    if (!emisor) return { ok: false, motivo: 'CFDI sin nodo Emisor.' };
    if (!tfd || !tfd.getAttribute('UUID')) return { ok: false, motivo: 'CFDI sin Timbre Fiscal Digital (sin UUID).' };

    // Impuestos a nivel comprobante (hijo directo de Comprobante)
    let ivaTrasladado = 0, ivaRetenido = 0, isrRetenido = 0, hayImpuestos = false;
    const imp = hijosDirectos(c, ns, 'Impuestos')[0];
    if (imp) {
      hayImpuestos = true;
      hijosDirectos(imp, ns, 'Traslados').forEach(ts => hijosDirectos(ts, ns, 'Traslado').forEach(t => {
        if (t.getAttribute('Impuesto') === '002') ivaTrasladado += num(t.getAttribute('Importe'));
      }));
      hijosDirectos(imp, ns, 'Retenciones').forEach(rs => hijosDirectos(rs, ns, 'Retencion').forEach(r => {
        if (r.getAttribute('Impuesto') === '002') ivaRetenido += num(r.getAttribute('Importe'));
        if (r.getAttribute('Impuesto') === '001') isrRetenido += num(r.getAttribute('Importe'));
      }));
    }

    const moneda = c.getAttribute('Moneda') || 'MXN';
    const tipoCambio = num(c.getAttribute('TipoCambio')) || 1;
    const factor = (moneda === 'MXN' || moneda === 'XXX') ? 1 : tipoCambio;
    const tipo = c.getAttribute('TipoDeComprobante') || '';
    const subtotal = num(c.getAttribute('SubTotal'));
    const descuento = num(c.getAttribute('Descuento'));

    return {
      ok: true,
      cfdi: {
        archivo: nombreArchivo || '',
        version: c.getAttribute('Version') || (ns === NS.cfdi33 ? '3.3' : '4.0'),
        uuid: String(tfd.getAttribute('UUID')).trim().toUpperCase(),
        serie: c.getAttribute('Serie') || '',
        folio: c.getAttribute('Folio') || '',
        fecha: (c.getAttribute('Fecha') || '').slice(0, 10),
        tipo, tipoTexto: TIPOS[tipo] || tipo,
        moneda, tipoCambio: factor,
        emisorRFCCrudo: emisor.getAttribute('Rfc') || '',
        emisorRFC: U.normalizarRFC(emisor.getAttribute('Rfc')),
        emisorNombre: (emisor.getAttribute('Nombre') || '').trim(),
        receptorRFC: U.normalizarRFC(receptor && receptor.getAttribute('Rfc')),
        receptorNombre: receptor ? (receptor.getAttribute('Nombre') || '').trim() : '',
        metodoPago: c.getAttribute('MetodoPago') || '',
        usoCFDI: receptor ? (receptor.getAttribute('UsoCFDI') || '') : '',
        hayImpuestos,
        // Importes convertidos a MXN cuando la moneda es distinta
        subtotal: subtotal * factor,
        descuento: descuento * factor,
        total: num(c.getAttribute('Total')) * factor,
        ivaTrasladado: ivaTrasladado * factor,
        ivaRetenido: ivaRetenido * factor,
        isrRetenido: isrRetenido * factor
      }
    };
  }

  R69.cfdi = { NS, leerCFDI };
})(typeof window !== 'undefined' ? window : globalThis);

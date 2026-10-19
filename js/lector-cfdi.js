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
    // childNodes (y no children) para que el mismo lector funcione en el navegador y en las pruebas de Node
    return Array.from(nodo ? nodo.childNodes : []).filter(n => n.nodeType === 1 && n.namespaceURI === ns && n.localName === nombre);
  }

  const PATRON_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
  const PATRON_IMPORTE = /^\d+(\.\d+)?$/;            // Anexo 20: importes sin signo, punto decimal
  const PATRON_FECHA = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}$/;

  /** Error de lectura con el campo y el valor que lo causaron. */
  class CampoInvalido extends Error {}
  function attr(nodo, nombre) { const v = nodo.getAttribute(nombre); return v == null ? '' : String(v).trim(); }
  /** Importe con formato del Anexo 20. Ausente → 0 solo si es opcional; con texto inválido → error. */
  function importe(nodo, nombre, requerido, donde) {
    const v = attr(nodo, nombre);
    if (!v) { if (requerido) throw new CampoInvalido(`Falta el atributo ${nombre} en ${donde}.`); return 0; }
    if (!PATRON_IMPORTE.test(v)) throw new CampoInvalido(`${nombre} de ${donde} no es un importe válido («${v.slice(0, 30)}»).`);
    return Number(v);
  }

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
    if (!receptor) return { ok: false, motivo: 'CFDI sin nodo Receptor.' };
    if (!tfd || !attr(tfd, 'UUID')) return { ok: false, motivo: 'CFDI sin Timbre Fiscal Digital (sin UUID).' };

    // Campos que identifican la operación: si faltan o están mal formados, el comprobante no se evalúa
    const uuid = attr(tfd, 'UUID').toUpperCase();
    if (!PATRON_UUID.test(uuid)) return { ok: false, motivo: 'El UUID del timbre no tiene el formato de 36 caracteres (8-4-4-4-12 hexadecimales).' };
    const emisorRFC = U.normalizarRFC(attr(emisor, 'Rfc'));
    if (!U.esRFCValido(emisorRFC)) return { ok: false, motivo: emisorRFC ? `El RFC del emisor no tiene un formato válido («${emisorRFC.slice(0, 20)}»).` : 'El CFDI no trae el RFC del emisor: no se puede cruzar con el listado.' };
    const receptorRFC = U.normalizarRFC(attr(receptor, 'Rfc'));
    if (!U.esRFCValido(receptorRFC)) return { ok: false, motivo: receptorRFC ? `El RFC del receptor no tiene un formato válido («${receptorRFC.slice(0, 20)}»).` : 'El CFDI no trae el RFC del receptor.' };
    const mf = PATRON_FECHA.exec(attr(c, 'Fecha'));
    if (!mf || U.fechaAISO(mf[1]) !== mf[1]) return { ok: false, motivo: `La fecha del comprobante no es válida («${attr(c, 'Fecha').slice(0, 25)}»).` };

    // Moneda: los importes se convierten a MXN con el TipoCambio del propio CFDI; sin él no se cuantifica
    const moneda = attr(c, 'Moneda') || 'MXN';
    let factor = 1;
    if (moneda !== 'MXN' && moneda !== 'XXX') {
      const tc = attr(c, 'TipoCambio');
      if (!PATRON_IMPORTE.test(tc) || !(Number(tc) > 0)) {
        return { ok: false, motivo: `CFDI en ${moneda} ${tc ? `con TipoCambio inválido («${tc.slice(0, 20)}»)` : 'sin TipoCambio'}: no se puede convertir a pesos.` };
      }
      factor = Number(tc);
    }

    let subtotal, descuento, total, ivaTrasladado = 0, ivaRetenido = 0, isrRetenido = 0, hayImpuestos = false;
    try {
      subtotal = importe(c, 'SubTotal', true, 'Comprobante');
      descuento = importe(c, 'Descuento', false, 'Comprobante');
      total = importe(c, 'Total', true, 'Comprobante');
      // Impuestos a nivel comprobante (hijo directo de Comprobante)
      const imp = hijosDirectos(c, ns, 'Impuestos')[0];
      if (imp) {
        hayImpuestos = true;
        hijosDirectos(imp, ns, 'Traslados').forEach(ts => hijosDirectos(ts, ns, 'Traslado').forEach(t => {
          if (attr(t, 'Impuesto') === '002') ivaTrasladado += importe(t, 'Importe', false, 'Traslado de IVA');
        }));
        hijosDirectos(imp, ns, 'Retenciones').forEach(rs => hijosDirectos(rs, ns, 'Retencion').forEach(r => {
          if (attr(r, 'Impuesto') === '002') ivaRetenido += importe(r, 'Importe', true, 'Retención de IVA');
          if (attr(r, 'Impuesto') === '001') isrRetenido += importe(r, 'Importe', true, 'Retención de ISR');
        }));
      }
    } catch (e) {
      if (e instanceof CampoInvalido) return { ok: false, motivo: e.message };
      throw e;
    }
    const tipo = attr(c, 'TipoDeComprobante');

    return {
      ok: true,
      cfdi: {
        archivo: nombreArchivo || '',
        version: attr(c, 'Version') || (ns === NS.cfdi33 ? '3.3' : '4.0'),
        uuid,
        serie: attr(c, 'Serie'),
        folio: attr(c, 'Folio'),
        fecha: mf[1],
        tipo, tipoTexto: TIPOS[tipo] || tipo,
        moneda, tipoCambio: factor,
        subtotalOriginal: subtotal, totalOriginal: total,
        emisorRFCCrudo: emisor.getAttribute('Rfc') || '',
        emisorRFC,
        emisorNombre: attr(emisor, 'Nombre'),
        receptorRFC,
        receptorNombre: attr(receptor, 'Nombre'),
        metodoPago: attr(c, 'MetodoPago'),
        usoCFDI: attr(receptor, 'UsoCFDI'),
        hayImpuestos,
        // Importes convertidos a MXN cuando la moneda es distinta
        subtotal: subtotal * factor,
        descuento: descuento * factor,
        total: total * factor,
        ivaTrasladado: ivaTrasladado * factor,
        ivaRetenido: ivaRetenido * factor,
        isrRetenido: isrRetenido * factor
      }
    };
  }

  R69.cfdi = { NS, leerCFDI };
})(typeof window !== 'undefined' ? window : globalThis);

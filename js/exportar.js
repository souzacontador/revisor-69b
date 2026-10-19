/* Exportación de resultados a CSV (UTF-8 con BOM para que Excel muestre los acentos). */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util;

  function celda(v) {
    if (v == null) return '';
    let t = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
    // Un texto que empieza con = + - @ (o tabulador/retorno) se abriría como fórmula en la hoja de cálculo:
    // se antepone un apóstrofo para que se lea como texto. Los números no se tocan.
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function aCSV(encabezados, filas) {
    return '﻿' + [encabezados, ...filas].map(f => f.map(celda).join(',')).join('\r\n') + '\r\n';
  }
  function descargar(nombre, texto) {
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function csvOperaciones(r) {
    const enc = ['UUID', 'Proveedor', 'RFC', 'Fecha', 'Subtotal', 'Descuento', 'IVA', 'Situación del proveedor', 'Veredicto', 'Motivo', 'Nota',
      'Monto potencialmente comprometido para deducción de ISR', 'Importe deducido considerado', 'IVA comprometido considerado', 'Importe ajustado por el usuario'];
    const filas = r.operaciones.map(o => [o.uuid, o.proveedor, o.rfc, U.fechaMX(o.fecha), o.subtotal, o.descuento, o.iva, o.situacion, o.veredicto.texto, o.motivo, o.nota,
      o.deduccionPotencial, o.veredicto.clave === 'SIN_RIESGO' ? '' : o.deduccion, o.veredicto.clave === 'SIN_RIESGO' ? '' : o.ivaComprometido, o.ajustado ? 'Sí' : 'No']);
    return aCSV(enc, filas);
  }

  function fechaEtapa(p, etapa, cual) {
    const ep = (p.episodios || []).map(e => e.fechas.find(f => f.etapa === etapa)).filter(Boolean);
    return ep.map(f => U.fechaMX(f[cual])).filter(Boolean).join(' | ');
  }
  function csvProveedores(r) {
    const enc = ['RFC', 'Proveedor (CFDI)', 'Nombre en el listado', 'Situación', 'Veredicto', 'Episodios en el listado',
      'Presunto SAT', 'Presunto DOF', 'Desvirtuado SAT', 'Desvirtuado DOF', 'Definitivo SAT', 'Definitivo DOF', 'Sentencia favorable SAT', 'Sentencia favorable DOF',
      'CFDI', 'Primera factura', 'Última factura', 'IVA comprometido', 'Monto potencialmente comprometido para deducción de ISR', 'Estimación de ISR',
      'Acción recomendada', 'Fecha límite', 'Fecha usada para el plazo', 'Inhábiles omitidos en el plazo'];
    const filas = r.proveedores.map(p => { const comp = p.veredicto.clave !== 'SIN_RIESGO'; return [p.rfc, p.nombre, p.nombreListado, p.situacion, p.veredicto.texto, p.episodios.length,
      fechaEtapa(p, 'Presunto', 'fechaSAT'), fechaEtapa(p, 'Presunto', 'fechaDOF'), fechaEtapa(p, 'Desvirtuado', 'fechaSAT'), fechaEtapa(p, 'Desvirtuado', 'fechaDOF'),
      fechaEtapa(p, 'Definitivo', 'fechaSAT'), fechaEtapa(p, 'Definitivo', 'fechaDOF'), fechaEtapa(p, 'Sentencia favorable', 'fechaSAT'), fechaEtapa(p, 'Sentencia favorable', 'fechaDOF'),
      // Desvirtuados y sentencias favorables conservan sus efectos: sin importes comprometidos (mismo criterio que la pantalla y el Excel)
      p.cfdis, U.fechaMX(p.primeraFactura), U.fechaMX(p.ultimaFactura), comp ? p.ivaComprometido : '', comp ? p.deduccion : '', comp ? p.isrEstimado : '',
      p.accion, p.fechaLimite,
      p.plazo && p.plazo.fechaUsada ? `Publicación en el DOF del ${U.fechaMX(p.plazo.fechaDOF)}` : '',
      p.plazo && p.plazo.inhabilesOmitidos ? p.plazo.inhabilesOmitidos.map(x => `${U.fechaMX(x.fecha)} (${x.motivo})`).join(' | ') : '']; });
    return aCSV(enc, filas);
  }

  R69.exportar = { aCSV, descargar, csvOperaciones, csvProveedores };
})(typeof window !== 'undefined' ? window : globalThis);

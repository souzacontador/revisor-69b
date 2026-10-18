/* Revisor de Proveedores 69-B — utilidades compartidas (navegador y Node).
 * Las fechas se manejan como texto ISO "AAAA-MM-DD" para evitar desfases por zona horaria. */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};

  /** RFC: quita todo espacio (incluido el no separable) y pasa a mayúsculas.
   *  No elimina Ñ ni &: son caracteres válidos de un RFC. */
  function normalizarRFC(valor) {
    return String(valor == null ? '' : valor).replace(/[\s ﻿]+/g, '').toUpperCase();
  }

  const PATRON_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
  function esRFCValido(rfc) { return PATRON_RFC.test(rfc); }

  /** "dd/mm/aaaa" (también "dd-mm-aaaa" o "aaaa-mm-dd") → "aaaa-mm-dd"; "" si no es fecha válida. */
  function fechaAISO(texto) {
    const t = String(texto || '').trim();
    let d, m, a, r;
    if ((r = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; a = +r[3]; }
    else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) { a = +r[1]; m = +r[2]; d = +r[3]; }
    else return '';
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return '';
    return isoDeUTC(f);
  }

  function isoDeUTC(f) {
    return f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + String(f.getUTCDate()).padStart(2, '0');
  }
  function utcDeISO(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  function hoyISO() {
    const f = new Date();
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  }

  /** "aaaa-mm-dd" → "dd/mm/aaaa" */
  function fechaMX(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d + '/' + m + '/' + a;
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    return d + ' de ' + MESES[m - 1] + ' de ' + a;
  }

  /** Redondeo monetario a centavos sin errores binarios acumulados. */
  function centavos(n) { return Math.round((Number(n) || 0) * 100); }
  function deCentavos(c) { return c / 100; }

  const fmtMoneda = (typeof Intl !== 'undefined')
    ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })
    : null;
  function moneda(n) { return fmtMoneda ? fmtMoneda.format(Number(n) || 0) : (Number(n) || 0).toFixed(2); }

  /** Quita acentos y normaliza espacios para comparar encabezados. */
  function claveTexto(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function escaparHTML(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  R69.util = { normalizarRFC, esRFCValido, fechaAISO, isoDeUTC, utcDeISO, hoyISO, fechaMX, fechaLarga, centavos, deCentavos, moneda, claveTexto, escaparHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);

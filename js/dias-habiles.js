/* Cómputo de plazos en días hábiles conforme al artículo 12 del CFF.
 *
 * Art. 12, primer párrafo: no se cuentan sábados, domingos, 1 de enero, primer lunes de febrero,
 * tercer lunes de marzo, 1 y 5 de mayo, 16 de septiembre, tercer lunes de noviembre,
 * 1 de diciembre de cada 6 años (transmisión del Poder Ejecutivo) y 25 de diciembre.
 * Art. 12, segundo párrafo: tampoco los días de vacaciones generales de las autoridades fiscales.
 *
 * Los días adicionales (vacaciones generales y días inhábiles que declare la RMF) se capturan
 * en DIAS_ADICIONALES para que puedan actualizarse cada año sin tocar la lógica. */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util || (typeof require !== 'undefined' ? require('./util.js').util : null);

  /** Días inhábiles adicionales publicados por la autoridad. Fuente indicada en cada entrada. */
  const DIAS_ADICIONALES = [
    { desde: '2025-12-18', hasta: '2026-01-02', motivo: 'Segundo periodo general de vacaciones 2025 del SAT (RMF 2026, regla 2.1.6, fr. I)', tipo: 'vacaciones' },
    { desde: '2026-04-02', hasta: '2026-04-03', motivo: 'Días inhábiles para el SAT (RMF 2026, regla 2.1.6, fr. II)', tipo: 'rmf' },
    { desde: '2026-07-20', hasta: '2026-07-31', motivo: 'Primer periodo general de vacaciones 2026 del SAT (1a. RM a la RMF 2026, DOF 09/07/2026, regla 2.1.6, fr. III)', tipo: 'vacaciones' }
  ];

  function enesimoLunes(anio, mes, n) {
    const f = new Date(Date.UTC(anio, mes - 1, 1));
    const delta = (8 - f.getUTCDay()) % 7; // días hasta el primer lunes (getUTCDay: 0 = domingo)
    f.setUTCDate(1 + delta + 7 * (n - 1));
    return U.isoDeUTC(f);
  }

  const cacheAnio = new Map();
  /** Mapa ISO → motivo de los días inhábiles del art. 12 para un año. */
  function inhabilesArt12(anio) {
    if (cacheAnio.has(anio)) return cacheAnio.get(anio);
    const m = new Map([
      [`${anio}-01-01`, '1 de enero'],
      [enesimoLunes(anio, 2, 1), 'Primer lunes de febrero (5 de febrero)'],
      [enesimoLunes(anio, 3, 3), 'Tercer lunes de marzo (21 de marzo)'],
      [`${anio}-05-01`, '1 de mayo'],
      [`${anio}-05-05`, '5 de mayo'],
      [`${anio}-09-16`, '16 de septiembre'],
      [enesimoLunes(anio, 11, 3), 'Tercer lunes de noviembre (20 de noviembre)'],
      [`${anio}-12-25`, '25 de diciembre']
    ]);
    if ((anio - 2024) % 6 === 0) m.set(`${anio}-12-01`, '1 de diciembre (transmisión del Poder Ejecutivo)');
    cacheAnio.set(anio, m);
    return m;
  }

  /** Motivo por el que un día es inhábil, o '' si es hábil. */
  function motivoInhabil(iso, opciones) {
    const f = U.utcDeISO(iso);
    const dow = f.getUTCDay();
    if (dow === 6) return 'Sábado';
    if (dow === 0) return 'Domingo';
    const art12 = inhabilesArt12(f.getUTCFullYear()).get(iso);
    if (art12) return art12 + ' (art. 12 CFF)';
    const usarAdicionales = !opciones || opciones.incluirAdicionales !== false;
    if (usarAdicionales) {
      const adicionales = (opciones && opciones.adicionales) || DIAS_ADICIONALES;
      for (const a of adicionales) if (iso >= a.desde && iso <= a.hasta) return a.motivo;
    }
    return '';
  }

  function sumarDias(iso, n) {
    const f = U.utcDeISO(iso);
    f.setUTCDate(f.getUTCDate() + n);
    return U.isoDeUTC(f);
  }

  /** Último día de un plazo de `dias` hábiles que empieza a contar el día siguiente a `fechaInicioISO`.
   *  Devuelve { vence, omitidos: [{fecha, motivo}] } con los inhábiles entre semana que se saltaron. */
  function plazoHabil(fechaInicioISO, dias, opciones) {
    let actual = fechaInicioISO, contados = 0;
    const omitidos = [];
    while (contados < dias) {
      actual = sumarDias(actual, 1);
      const motivo = motivoInhabil(actual, opciones);
      if (motivo) { if (motivo !== 'Sábado' && motivo !== 'Domingo') omitidos.push({ fecha: actual, motivo }); }
      else contados++;
    }
    return { vence: actual, omitidos };
  }

  /** Días hábiles que faltan desde `desdeISO` (excluido) hasta `hastaISO` (incluido). 0 si ya pasó. */
  function habilesRestantes(desdeISO, hastaISO, opciones) {
    if (hastaISO <= desdeISO) return 0;
    let n = 0, actual = desdeISO;
    while (actual < hastaISO) {
      actual = sumarDias(actual, 1);
      if (!motivoInhabil(actual, opciones)) n++;
    }
    return n;
  }

  R69.dias = { DIAS_ADICIONALES, inhabilesArt12, motivoInhabil, plazoHabil, habilesRestantes, sumarDias };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);

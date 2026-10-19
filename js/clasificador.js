/* Clasificador 69-B: cruza cada CFDI contra el listado por RFC (nunca por nombre),
 * asigna veredicto, suma importes por proveedor y calcula el plazo de 30 días hábiles.
 *
 * Regla central: el veredicto depende de la situación VIGENTE del proveedor en el listado
 * consultado, no de la fecha de la factura. Para un definitivo, el art. 69-B dice que sus
 * comprobantes «no producen ni produjeron efecto fiscal alguno», aunque sean anteriores. */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util || (typeof require !== 'undefined' ? require('./util.js').util : null);
  const D = R69.dias || (typeof require !== 'undefined' ? require('./dias-habiles.js').dias : null);

  const VEREDICTOS = {
    SIN_EFECTO: { clave: 'SIN_EFECTO', texto: 'Sin efecto fiscal', nivel: 'alto' },
    EN_RIESGO: { clave: 'EN_RIESGO', texto: 'Riesgo potencial: proveedor en listado de presuntos', corto: 'En riesgo', nivel: 'medio' },
    REVISION: { clave: 'REVISION', texto: 'Requiere revisión documental', nivel: 'medio' },
    SIN_RIESGO: { clave: 'SIN_RIESGO', texto: 'Sin riesgo', nivel: 'bajo' }
  };
  const PLAZO_DIAS = 30;
  const TEXTO_PRESUNTO_PLAZO = 'No aplica todavía el plazo de 30 días del artículo 69-B para el cliente. Se recomienda iniciar la revisión de inmediato.';
  const TEXTO_PENDIENTE_DOF = 'Pendiente de verificar publicación en DOF';

  // ---------- Nombres parecidos (solo informativo; nunca decide) ----------
  const RUIDO = /\b(S\.?\s?A\.?|S\.?\s?C\.?|S\.?\s?DE\s?R\.?\s?L\.?|DE\s+C\.?\s?V\.?|SAPI|S\.?\s?A\.?\s?P\.?\s?I\.?|A\.?\s?C\.?|SOCIEDAD|ANONIMA|CAPITAL|VARIABLE|RESPONSABILIDAD|LIMITADA)\b/g;
  function nombreBase(n) { return U.claveTexto(n).toUpperCase().replace(RUIDO, ' ').replace(/[^A-Z0-9Ñ& ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function bigramas(t) { const s = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); s.set(b, (s.get(b) || 0) + 1); } return s; }
  /** Coeficiente de Dice sobre bigramas ya calculados. */
  function diceMapas(A, la, B, lb) {
    if (la < 2 || lb < 2) return 0;
    let inter = 0;
    A.forEach((v, k) => { const w = B.get(k); if (w) inter += Math.min(v, w); });
    return (2 * inter) / (la - 1 + lb - 1);
  }

  // Índice de nombres por listado: se arma una sola vez (agrupado por primera palabra, con bigramas precalculados)
  // y guarda cada consulta, para que repetir la revisión o ajustar importes no vuelva a recorrer el listado.
  const INDICES = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function indiceNombres(listado) {
    let ix = INDICES && INDICES.get(listado);
    if (ix) return ix;
    ix = { porPalabra: new Map(), consultas: new Map() };
    for (const r of listado.registros) {
      const base = nombreBase(r.nombre);
      if (!base) continue;
      const clave = base.split(' ')[0];
      if (!ix.porPalabra.has(clave)) ix.porPalabra.set(clave, []);
      ix.porPalabra.get(clave).push({ base, r, mapa: null });
    }
    if (INDICES) INDICES.set(listado, ix);
    return ix;
  }

  function crearBuscadorNombres(listado) {
    const ix = indiceNombres(listado);
    return function (nombre, rfc) {
      const base = nombreBase(nombre);
      if (!base || base.split(' ').length < 2) return null;
      const clave = rfc + '|' + base;
      if (ix.consultas.has(clave)) return ix.consultas.get(clave);
      // Solo se comparan nombres que empiezan con la misma palabra (un prefijo común o una similitud ≥ 0.9 lo exigen en la práctica)
      const candidatos = ix.porPalabra.get(base.split(' ')[0]) || [];
      const mapaBase = bigramas(base);
      let mejor = null;
      for (const it of candidatos) {
        if (it.r.rfc === rfc) continue;
        const contiene = (it.base.startsWith(base + ' ') || base.startsWith(it.base + ' ')) && Math.min(base.length, it.base.length) >= 12;
        let s = 0;
        if (contiene) s = 0.95;
        else if (Math.min(base.length, it.base.length) / Math.max(base.length, it.base.length) >= 0.8) {
          if (!it.mapa) it.mapa = bigramas(it.base);
          s = diceMapas(mapaBase, base.length, it.mapa, it.base.length);
        }
        if (s >= 0.9 && (!mejor || s > mejor.s)) mejor = { s, r: it.r };
      }
      const resultado = mejor ? mejor.r : null;
      ix.consultas.set(clave, resultado);
      return resultado;
    };
  }

  // ---------- Evaluación del proveedor ----------
  function fechasPublicacion(ep) {
    const etapas = [['presunto', 'Presunto'], ['desvirtuado', 'Desvirtuado'], ['definitivo', 'Definitivo'], ['sentencia', 'Sentencia favorable']];
    return etapas.filter(([k]) => ep[k] && (ep[k].fechaSAT || ep[k].fechaDOF))
      .map(([k, t]) => ({ etapa: t, fechaSAT: ep[k].fechaSAT || '', fechaDOF: ep[k].fechaDOF || '', oficioSAT: ep[k].oficioSAT || '', oficioDOF: ep[k].oficioDOF || '' }));
  }

  function plazoDefinitivo(ep, fechaRevision) {
    const sat = ep.definitivo.fechaSAT || '', dof = ep.definitivo.fechaDOF || '';
    if (!dof) return { estado: 'PENDIENTE_DOF', texto: TEXTO_PENDIENTE_DOF, fechaSAT: sat, fechaDOF: '', fechaUsada: '' };
    const { vence, omitidos } = D.plazoHabil(dof, PLAZO_DIAS);
    const vigente = fechaRevision <= vence;
    return {
      estado: vigente ? 'VIGENTE' : 'VENCIDO',
      fechaSAT: sat, fechaDOF: dof, fechaUsada: 'DOF', inicioCuenta: D.sumarDias(dof, 1), vence,
      inhabilesOmitidos: omitidos,
      restantes: vigente ? D.habilesRestantes(fechaRevision, vence) : 0,
      texto: vigente ? `Vence el ${U.fechaMX(vence)}` : `Venció el ${U.fechaMX(vence)}`
    };
  }

  /** Situación del proveedor a partir de sus episodios en el listado. */
  function evaluarProveedor(rfc, episodios, fechaRevision, fechaDatos) {
    if (!episodios || !episodios.length) {
      return {
        listado: false, situacion: 'No listado', veredicto: VEREDICTOS.SIN_RIESGO,
        motivo: `RFC no encontrado en el listado consultado${fechaDatos ? ' (' + (/^\d/.test(fechaDatos) ? 'datos al ' : '') + fechaDatos + ')' : ''}.`
      };
    }
    const situaciones = [...new Set(episodios.map(e => e.situacion || 'Desconocida'))];
    const base = { listado: true, episodios: episodios.map(e => ({ renglon: e.renglon, nombre: e.nombre, situacion: e.situacion || e.situacionCruda, fechas: fechasPublicacion(e) })) };

    if (situaciones.length > 1 || situaciones[0] === 'Desconocida') {
      return Object.assign(base, {
        situacion: situaciones.join(' / '), veredicto: VEREDICTOS.REVISION,
        motivo: `El RFC aparece ${episodios.length} veces en el listado con situaciones distintas o no reconocidas (${situaciones.join(', ')}). No se asigna un estado único.`,
        accion: 'Revisar documentalmente los oficios y publicaciones de cada episodio (SAT y DOF) para determinar qué resolución está vigente antes de concluir.',
        fechaLimite: 'Requiere revisión documental'
      });
    }

    const sit = situaciones[0];
    const varios = episodios.length > 1 ? ` El RFC tiene ${episodios.length} episodios con la misma situación.` : '';
    const ep = episodios[episodios.length - 1];
    const f = (o) => [o.fechaSAT && `SAT ${U.fechaMX(o.fechaSAT)}`, o.fechaDOF && `DOF ${U.fechaMX(o.fechaDOF)}`].filter(Boolean).join(' · ');

    if (sit === 'Definitivo') {
      const plazos = episodios.map(e => plazoDefinitivo(e, fechaRevision));
      const p = plazos[plazos.length - 1];
      let accion, fechaLimite;
      if (episodios.length > 1) {
        fechaLimite = 'Requiere revisión documental (varios episodios definitivos; vencimiento de cada uno: ' + plazos.map(x => x.vence ? U.fechaMX(x.vence) : TEXTO_PENDIENTE_DOF).join('; ') + ')';
        accion = 'Identificar a qué episodio corresponden las operaciones y, dentro del plazo aplicable, acreditar la materialidad ante el SAT o corregir con declaraciones complementarias de IVA e ISR (art. 69-B, párr. 8).';
      } else if (p.estado === 'PENDIENTE_DOF') {
        fechaLimite = TEXTO_PENDIENTE_DOF;
        accion = 'Verificar la fecha de publicación del definitivo en el DOF para computar el plazo de 30 días hábiles. Mientras tanto, reunir la evidencia de materialidad y preparar las declaraciones complementarias de IVA e ISR.';
      } else if (p.estado === 'VIGENTE') {
        fechaLimite = U.fechaMX(p.vence);
        accion = `A más tardar el ${U.fechaLarga(p.vence)}: acreditar ante el SAT que efectivamente se adquirieron los bienes o se recibieron los servicios (materialidad), o corregir la situación fiscal mediante declaraciones complementarias de IVA e ISR (art. 69-B, párr. 8).`;
      } else {
        fechaLimite = `${U.fechaMX(p.vence)} (vencido)`;
        accion = `El plazo de 30 días hábiles venció el ${U.fechaLarga(p.vence)}. Corregir la situación fiscal con declaraciones complementarias de IVA e ISR y documentar la materialidad: si la autoridad detecta que no se acreditó ni se corrigió, determinará los créditos fiscales y las operaciones se considerarán simuladas para efectos de los delitos del CFF (art. 69-B, párr. 9).`;
      }
      return Object.assign(base, {
        situacion: 'Definitivo', veredicto: VEREDICTOS.SIN_EFECTO, plazo: p, plazos,
        motivo: `Proveedor en listado DEFINITIVO (${f(ep.definitivo)}). Sus comprobantes «no producen ni produjeron efecto fiscal alguno» (art. 69-B, párr. 5), sin importar si la factura es anterior o posterior a la publicación.${varios}`,
        accion, fechaLimite
      });
    }
    if (sit === 'Presunto') {
      return Object.assign(base, {
        situacion: 'Presunto', veredicto: VEREDICTOS.EN_RIESGO,
        motivo: `Proveedor en listado de PRESUNTOS (${f(ep.presunto)}). Sus comprobantes aún no pierden efecto, pero la operación está en riesgo.${varios}`,
        accion: 'Reunir y conservar evidencia de las operaciones —contratos, pagos, entregables y constancias de recepción— y vigilar cambios en el listado.',
        fechaLimite: TEXTO_PRESUNTO_PLAZO
      });
    }
    if (sit === 'Desvirtuado') {
      return Object.assign(base, {
        situacion: 'Desvirtuado', veredicto: VEREDICTOS.SIN_RIESGO,
        motivo: `El proveedor desvirtuó la presunción (${f(ep.desvirtuado) || 'fecha no indicada'}). Sus comprobantes conservan sus efectos.${varios}`,
        accion: 'Sin acción correctiva. Conservar la evidencia de la publicación como desvirtuado y la documentación de materialidad.',
        fechaLimite: 'No aplica'
      });
    }
    return Object.assign(base, {
      situacion: 'Sentencia Favorable', veredicto: VEREDICTOS.SIN_RIESGO,
      motivo: `Una resolución o sentencia firme dejó sin efectos la resolución definitiva (${f(ep.sentencia) || 'fecha no indicada'}). Sus comprobantes conservan sus efectos.${varios}`,
      accion: 'Sin acción correctiva. Conservar la evidencia de la sentencia favorable publicada y la documentación de materialidad.',
      fechaLimite: 'No aplica'
    });
  }

  /** Ejecuta la revisión completa.
   *  opciones: { fechaRevision (ISO), fechaDatos (texto), ajustes: {uuid:{deduccion, iva}}, tasaISR (0..1 | null), regimenISR } */
  function revisar(cfdis, listado, opciones) {
    const op = opciones || {};
    const fechaRevision = op.fechaRevision || U.hoyISO();
    const ajustes = op.ajustes || {};
    const buscarNombre = crearBuscadorNombres(listado);
    const cacheProv = new Map();
    const operaciones = [];

    for (const c of cfdis) {
      if (!cacheProv.has(c.emisorRFC)) cacheProv.set(c.emisorRFC, evaluarProveedor(c.emisorRFC, listado.porRFC.get(c.emisorRFC), fechaRevision, op.fechaDatos));
      const ev = cacheProv.get(c.emisorRFC);
      let nota = '';
      if (!ev.listado) {
        const parecido = buscarNombre(c.emisorNombre, c.emisorRFC);
        if (parecido) nota = `Nombre parecido a «${parecido.nombre}» (RFC ${parecido.rfc}, ${parecido.situacion}), pero el RFC no coincide: no se considera listado. El cruce es por RFC.`;
      }
      const deduccionPotencial = (c.subtotal || 0) - (c.descuento || 0);
      const aj = ajustes[c.uuid] || {};
      const deduccion = (aj.deduccion != null && aj.deduccion !== '') ? Number(aj.deduccion) : deduccionPotencial;
      const iva = (aj.iva != null && aj.iva !== '') ? Number(aj.iva) : c.ivaTrasladado;
      operaciones.push({
        uuid: c.uuid, archivo: c.archivo, rfc: c.emisorRFC, proveedor: c.emisorNombre, fecha: c.fecha,
        subtotal: c.subtotal, descuento: c.descuento, iva: c.ivaTrasladado, total: c.total, moneda: c.moneda,
        deduccionPotencial, deduccion, ivaComprometido: iva, ajustado: aj.deduccion != null || aj.iva != null,
        situacion: ev.situacion, veredicto: ev.veredicto, motivo: ev.motivo, nota,
        posteriorADefinitivo: ev.situacion === 'Definitivo' && ev.plazo && ev.plazo.fechaDOF ? c.fecha >= ev.plazo.fechaDOF : null
      });
    }
    operaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.uuid.localeCompare(b.uuid));

    // Resumen por proveedor listado (sin duplicar importes aunque el RFC tenga varios episodios)
    const proveedores = [];
    cacheProv.forEach((ev, rfc) => {
      if (!ev.listado) return;
      const ops = operaciones.filter(o => o.rfc === rfc);
      const sumC = k => U.deCentavos(ops.reduce((s, o) => s + U.centavos(o[k]), 0));
      const deduccion = sumC('deduccion');
      proveedores.push(Object.assign({}, ev, {
        rfc, nombre: ops[0].proveedor, nombreListado: ev.episodios[0].nombre, cfdis: ops.length,
        primeraFactura: ops[0].fecha, ultimaFactura: ops[ops.length - 1].fecha,
        subtotal: sumC('subtotal'), iva: sumC('iva'), ivaComprometido: sumC('ivaComprometido'),
        deduccionPotencial: sumC('deduccionPotencial'), deduccion,
        isrEstimado: (op.tasaISR != null && ev.veredicto.clave !== 'SIN_RIESGO') ? U.deCentavos(Math.round(U.centavos(deduccion) * op.tasaISR)) : null
      }));
    });
    const orden = { SIN_EFECTO: 0, REVISION: 1, EN_RIESGO: 2, SIN_RIESGO: 3 };
    proveedores.sort((a, b) => orden[a.veredicto.clave] - orden[b.veredicto.clave] || b.ivaComprometido - a.ivaComprometido);

    // Totales por veredicto
    const totales = {};
    Object.keys(VEREDICTOS).forEach(k => { totales[k] = { cfdis: 0, subtotal: 0, iva: 0, ivaComprometido: 0, deduccion: 0 }; });
    operaciones.forEach(o => {
      const t = totales[o.veredicto.clave];
      t.cfdis++;
      t.subtotal += U.centavos(o.subtotal); t.iva += U.centavos(o.iva);
      t.ivaComprometido += U.centavos(o.ivaComprometido); t.deduccion += U.centavos(o.deduccion);
    });
    Object.values(totales).forEach(t => { ['subtotal', 'iva', 'ivaComprometido', 'deduccion'].forEach(k => { t[k] = U.deCentavos(t[k]); }); });

    return {
      fechaRevision, fechaDatos: op.fechaDatos || '', operaciones, proveedores, totales,
      emisores: cacheProv.size, listados: proveedores.length,
      tasaISR: op.tasaISR != null ? op.tasaISR : null, regimenISR: op.regimenISR || ''
    };
  }

  R69.clasificador = { VEREDICTOS, PLAZO_DIAS, TEXTO_PRESUNTO_PLAZO, TEXTO_PENDIENTE_DOF, evaluarProveedor, revisar, nombreBase };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);

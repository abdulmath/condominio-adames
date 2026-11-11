(async () => {
  const { esc, dinero, nombreMes, fechaCorta } = A;
  const $ = (s) => document.querySelector(s);
  const mensaje = (clase, html) => { $('#mensajes').insertAdjacentHTML('beforeend', `<div class="aviso ${clase}">${html}</div>`); };

  let d;
  try {
    const local = A.esLocal ? A.leerLocal() : null;
    d = A.normalizar(local || await A.cargarArchivo());
    if (local) mensaje('info', 'Mostrando los datos de prueba guardados en este navegador (modo local).');
  } catch (e) {
    mensaje('error', 'No se pudieron cargar los datos: ' + esc(e.message));
    return;
  }

  A.fijarMoneda(d.config.moneda);
  const r = A.calcular(d);

  document.title = d.config.nombre + ' — Estado de cuenta';
  $('#nombre').textContent = d.config.nombre;
  $('#ubicacion').textContent = d.config.ubicacion;
  if (d.actualizado) {
    $('#actualizado').textContent = 'Actualizado: ' + new Date(d.actualizado).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
  }
  if (d.demo) mensaje('', '<strong>Datos de ejemplo.</strong> Estas cifras son ficticias y sirven solo para mostrar el sistema.');
  if (d.config.aviso) mensaje('info', esc(d.config.aviso));

  const repo = A.repoDetectado();
  if (repo) $('#historial').innerHTML = ` · <a href="https://github.com/${esc(repo)}/commits/HEAD/${A.RUTA}">Historial de cambios</a>`;

  // Indicadores
  const mes = r.serie.find((s) => s.mes === r.mesActual) || { ingresos: 0, gastos: 0 };
  const kpi = (et, val, sub, clase = '') => `<div class="kpi"><div class="et">${et}</div><div class="val ${clase}">${val}</div><div class="sub">${sub}</div></div>`;
  $('#kpis').innerHTML =
    kpi('Fondo disponible', dinero(r.fondo), 'Saldo inicial + ingresos − gastos', r.fondo < 0 ? 'neg' : '') +
    kpi('Ingresos de ' + nombreMes(r.mesActual), dinero(mes.ingresos), 'Acumulado: ' + dinero(r.ingresos), 'pos') +
    kpi('Gastos de ' + nombreMes(r.mesActual), dinero(mes.gastos), 'Acumulado: ' + dinero(r.gastos)) +
    kpi('Por cobrar', dinero(r.porCobrar), 'Deuda total de los apartamentos', r.porCobrar > 0 ? 'neg' : '') +
    kpi('Apartamentos al día', `${r.alDia} de ${r.aptos.length}`, 'Sin saldo pendiente');

  // Gráfico de barras mensual (últimos 12 meses)
  (() => {
    const serie = r.serie.slice(-12);
    const W = 720, H = 250, izq = 58, abajo = 28, arriba = 10;
    const tope = Math.max(1, ...serie.map((s) => Math.max(s.ingresos, s.gastos)));
    const base = 4 * Math.pow(10, Math.floor(Math.log10(tope / 4)));
    const max = [1, 2, 2.5, 5, 10].map((k) => k * base).find((v) => v >= tope);
    const paso = (W - izq - 8) / serie.length;
    const ancho = Math.min(22, paso * 0.36);
    const y = (v) => arriba + (H - arriba - abajo) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      svg += `<line class="eje" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v).toLocaleString('es-DO')}</text>`;
    }
    serie.forEach((s, i) => {
      const cx = izq + paso * (i + 0.5);
      const barra = (v, x, color, et) => `<rect x="${x}" y="${y(v)}" width="${ancho}" height="${Math.max(0, H - abajo - y(v))}" rx="2" fill="var(${color})"><title>${et} ${nombreMes(s.mes)}: ${dinero(v)}</title></rect>`;
      svg += barra(s.ingresos, cx - ancho - 1, '--verde', 'Ingresos') + barra(s.gastos, cx + 1, '--rojo', 'Gastos');
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${nombreMes(s.mes).replace(/ \d\d(\d\d)$/, ' $1')}</text>`;
    });
    $('#grafico').innerHTML = svg + '</svg>';
  })();

  // Gastos por categoría
  const maxCat = r.porCategoria.length ? r.porCategoria[0][1] : 1;
  $('#categorias').innerHTML = r.porCategoria.map(([c, v]) =>
    `<div class="fila"><span>${esc(c)}</span><div class="pista"><div style="width:${(100 * v / maxCat).toFixed(1)}%"></div></div><span>${dinero(v)}</span></div>`
  ).join('') || '<p class="nota">Aún no hay gastos registrados.</p>';

  // Estado por apartamento
  const ESTADOS = { 'al-dia': ['b-verde', 'Al día'], pendiente: ['b-ambar', 'Pendiente'], atrasado: ['b-rojo', 'Atrasado'] };
  const ETIQ = { pagado: 'pagado', parcial: 'pago parcial', pendiente: 'pendiente', futuro: 'aún no vence' };
  const hayProp = r.aptos.some((a) => a.propietario);
  $('#tabla-aptos').innerHTML = `<thead><tr><th>Apto.</th>${hayProp ? '<th>Propietario</th>' : ''}<th class="num">Cuota</th><th class="num">Pagado</th><th>Pagado hasta</th><th class="num">Saldo pendiente</th><th>Estado</th><th>Últimos meses</th></tr></thead><tbody>` +
    r.aptos.map((a) => {
      const [clase, texto] = ESTADOS[a.estado];
      const saldo = a.saldo > 0.005 ? `<span class="neg">${dinero(a.saldo)}</span>` : dinero(0);
      const cuadros = a.rejilla.slice(-12).map((m) => `<i class="${m.estado}" title="${nombreMes(m.mes)}: ${ETIQ[m.estado] || ''}">${nombreMes(m.mes).slice(0, 3)}</i>`).join('');
      return `<tr><td><strong>${esc(a.id)}</strong></td>${hayProp ? `<td>${esc(a.propietario)}</td>` : ''}<td class="num">${dinero(a.cuota)}</td><td class="num">${dinero(a.pagado)}</td><td>${a.pagadoHasta ? nombreMes(a.pagadoHasta) : '—'}</td><td class="num">${saldo}</td><td><span class="badge ${clase}">${texto}</span></td><td><span class="meses">${cuadros}</span></td></tr>`;
    }).join('') +
    `</tbody><tfoot><tr><td colspan="${hayProp ? 3 : 2}">Total</td><td class="num">${dinero(r.ingresos)}</td><td></td><td class="num">${dinero(r.porCobrar)}</td><td colspan="2"></td></tr></tfoot>`;

  A.etiquetar($('#tabla-aptos'));
  if (r.dia > 1) $('#nota-vence').textContent = `Los pagos vencen el día ${r.dia} de cada mes.`;

  // Cuotas extraordinarias
  if (d.cargos.length) {
    $('#sec-cargos').hidden = false;
    $('#tabla-cargos').innerHTML = '<thead><tr><th>Fecha</th><th>Descripción</th><th>Aplica a</th><th class="num">Monto por apto.</th></tr></thead><tbody>' +
      [...d.cargos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((c) =>
        `<tr><td>${fechaCorta(c.fecha)}</td><td class="libre">${esc(c.descripcion)}</td><td>${c.apto === '*' ? 'Todos' : esc(c.apto)}</td><td class="num">${dinero(c.monto)}</td></tr>`).join('') + '</tbody>';
  }

  if (d.cargos.length) A.etiquetar($('#tabla-cargos'));

  // Movimientos
  const cubre = (p) => {
    const desde = p.mesDesde || p.mesHasta, hasta = p.mesHasta || p.mesDesde;
    if (!desde) return '';
    return 'Cubre ' + nombreMes(desde) + (hasta > desde ? ' a ' + nombreMes(hasta) : '');
  };
  const movs = [
    ...A.pagosEfectivos(d).map((p) => ({ tipo: 'pago', fecha: p.fecha, apto: p.apto, detalle: [p.nota, p.metodo, cubre(p)].filter(Boolean).join(' · '), monto: Number(p.monto) })),
    ...d.gastos.map((g) => ({ tipo: 'gasto', fecha: g.fecha, apto: '', detalle: [g.categoria, g.descripcion, g.metodo, g.comprobante && 'Comp. ' + g.comprobante, g.pagadoPor && 'Pagado por el apto. ' + g.pagadoPor].filter(Boolean).join(' · '), monto: -Number(g.monto), soporte: A.soporteValido(g.soporte) ? g.soporte : '' })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const mesesMov = [...new Set(movs.map((m) => m.fecha.slice(0, 7)))];
  $('#f-mes').innerHTML = '<option value="">Todos los meses</option>' + mesesMov.map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('');
  $('#f-apto').innerHTML = '<option value="">Todos los apartamentos</option>' + d.apartamentos.map((a) => `<option>${esc(a.id)}</option>`).join('');

  function pintarMovs() {
    const tipo = $('#f-tipo').value, fm = $('#f-mes').value, fa = $('#f-apto').value;
    const lista = movs.filter((m) => (!tipo || m.tipo === tipo) && (!fm || m.fecha.startsWith(fm)) && (!fa || m.apto === fa));
    const total = lista.reduce((t, m) => t + m.monto, 0);
    $('#tabla-mov').innerHTML = '<thead><tr><th>Fecha</th><th>Tipo</th><th>Apto.</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>' +
      (lista.map((m) => `<tr><td>${fechaCorta(m.fecha)}</td><td><span class="badge ${m.tipo === 'pago' ? 'b-verde' : 'b-gris'}">${m.tipo === 'gasto' ? 'Gasto' : m.monto < 0 ? 'Devolución' : 'Pago'}</span></td><td>${esc(m.apto)}</td><td class="libre">${esc(m.detalle)}${m.soporte ? ` · <a href="${m.soporte}" target="_blank" rel="noopener" data-soporte="${m.soporte}">Ver factura</a>` : ''}</td><td class="num ${m.monto < 0 ? 'neg' : 'pos'}">${dinero(m.monto)}</td></tr>`).join('') ||
        '<tr><td colspan="5" class="nota">No hay movimientos con ese filtro.</td></tr>') +
      `</tbody><tfoot><tr><td colspan="4">Neto (${lista.length} movimientos)</td><td class="num">${dinero(total)}</td></tr></tfoot>`;
    A.etiquetar($('#tabla-mov'));
  }
  // En modo local las facturas están en el navegador, no en la carpeta soportes/.
  const locales = A.esLocal ? A.soportesLocales() : {};
  $('#tabla-mov').addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-soporte]');
    if (a && locales[a.dataset.soporte]) { ev.preventDefault(); A.abrirB64(a.dataset.soporte, locales[a.dataset.soporte]); }
  });
  for (const id of ['#f-tipo', '#f-mes', '#f-apto']) $(id).addEventListener('change', pintarMovs);
  pintarMovs();
})();

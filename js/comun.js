// Funciones compartidas por el dashboard público y el panel de administración.
const A = (() => {
  const RUTA = 'data/datos.json';
  const CLAVE_LOCAL = 'adames_datos_local';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const esLocal = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let moneda = 'RD$';
  const fijarMoneda = (m) => { moneda = m || 'RD$'; };
  const dinero = (n) => moneda + ' ' + Number(n || 0).toLocaleString('es-DO',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hoy = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const nombreMes = (ym) => { const [y, m] = ym.split('-'); return MESES[Number(m) - 1] + ' ' + y; };
  const fechaCorta = (f) => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const suma = (lista) => lista.reduce((t, x) => t + (Number(x.monto) || 0), 0);

  function listaMeses(desde, hasta) {
    const out = [];
    let [y, m] = desde.split('-').map(Number);
    const [hy, hm] = hasta.split('-').map(Number);
    while ((y < hy || (y === hy && m <= hm)) && out.length < 600) {
      out.push(y + '-' + String(m).padStart(2, '0'));
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }

  // Detecta usuario/repositorio cuando la página se sirve desde GitHub Pages.
  function repoDetectado() {
    if (!location.hostname.endsWith('.github.io')) return '';
    const usuario = location.hostname.split('.')[0];
    const repo = location.pathname.split('/')[1] || `${usuario}.github.io`;
    return `${usuario}/${repo}`;
  }

  function normalizar(d) {
    d = d || {};
    d.config = Object.assign({ nombre: 'Condominio', ubicacion: '', moneda: 'RD$', mesInicio: hoy().slice(0, 7), saldoInicial: 0, diaVencimiento: 1, aviso: '' }, d.config);
    for (const k of ['apartamentos', 'pagos', 'cargos', 'gastos']) d[k] = Array.isArray(d[k]) ? d[k] : [];
    return d;
  }

  // Un gasto con «pagadoPor» lo pagó directamente un apartamento (p. ej. la factura
  // de electricidad): cuenta como gasto del condominio y como pago de ese apartamento.
  const pagosEfectivos = (d) => [
    ...d.pagos,
    ...d.gastos.filter((g) => g.pagadoPor).map((g) => ({
      id: 'g-' + g.id, fecha: g.fecha, apto: g.pagadoPor, monto: g.monto,
      metodo: 'Pago directo de factura', nota: [g.categoria, g.descripcion].filter(Boolean).join(': '),
    })),
  ];

  // Un pago con «mesDesde/mesHasta» se reparte en partes iguales entre esos meses
  // para el resumen mensual; sin ellos, cuenta en el mes de su fecha.
  function reparto(p) {
    const desde = p.mesDesde || p.mesHasta, hasta = p.mesHasta || p.mesDesde;
    const meses = desde && hasta >= desde ? listaMeses(desde, hasta) : [];
    if (!meses.length) return [[p.fecha.slice(0, 7), Number(p.monto) || 0]];
    return meses.map((m) => [m, (Number(p.monto) || 0) / meses.length]);
  }

  /*
   * Estado de cuenta. Para cada apartamento:
   *   debe = saldo anterior + cuotas extraordinarias + cuota mensual × meses transcurridos
   *   saldo = debe − pagado   (positivo: adeuda; negativo: saldo a favor)
   * Para colorear los meses, los pagos se aplican primero al saldo anterior y a las
   * cuotas extraordinarias, y luego a las mensualidades de la más antigua a la más reciente.
   */
  function calcular(d) {
    const mesActual = hoy().slice(0, 7);
    // La cuota de un mes se cuenta como adeudada desde su día de vencimiento.
    const dia = Math.min(Math.max(Number(d.config.diaVencimiento) || 1, 1), 28);
    let ultimoVencido = mesActual;
    if (Number(hoy().slice(8)) < dia) {
      const [y, m] = mesActual.split('-').map(Number);
      ultimoVencido = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
    const meses = listaMeses(d.config.mesInicio, ultimoVencido);
    const pagos = pagosEfectivos(d);
    const aptos = d.apartamentos.map((a) => {
      const cuota = Number(a.cuota) || 0;
      const previo = Number(a.saldoInicial) || 0;
      const pagado = suma(pagos.filter((p) => p.apto === a.id));
      const cargos = suma(d.cargos.filter((c) => c.apto === '*' || c.apto === a.id));
      const saldo = previo + cargos + cuota * meses.length - pagado;
      // Último mes cubierto por completo (puede ser un mes futuro si pagó por adelantado)
      // y saldo a favor que no alcanza para otro mes.
      const cubiertos = cuota > 0 ? Math.floor((pagado - previo - cargos + 0.005) / cuota) : 0;
      let pagadoHasta = '';
      if (cubiertos > 0) {
        const [y, m] = d.config.mesInicio.split('-').map(Number);
        const t = y * 12 + (m - 1) + cubiertos - 1;
        pagadoHasta = Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
      }
      const aFavor = saldo < 0 ? (cuota > 0 ? (-saldo) % cuota : -saldo) : 0;
      let estado = 'atrasado';
      if (saldo <= 0.005) estado = 'al-dia';
      else if (saldo <= cuota + 0.005) estado = 'pendiente';
      return { ...a, cuota, pagado, cargos, previo, saldo, estado, pagadoHasta, aFavor };
    });

    // Rejilla de meses: llega hasta el mes en curso o hasta el último mes pagado por
    // adelantado. Un mes aún no vencido y sin pagar se marca «futuro», no «pendiente».
    const fin = [mesActual, ultimoVencido, ...aptos.map((a) => a.pagadoHasta)].sort().pop();
    for (const a of aptos) {
      let disp = a.pagado - a.previo - a.cargos;
      a.rejilla = listaMeses(d.config.mesInicio, fin).map((mes) => {
        let estado = mes > ultimoVencido ? 'futuro' : 'pendiente';
        if (a.cuota <= 0) estado = 'na';
        else if (disp >= a.cuota - 0.005) estado = 'pagado';
        else if (disp > 0.005) estado = 'parcial';
        disp -= a.cuota;
        return { mes, estado };
      });
    }

    const ingresos = suma(pagos);
    const gastos = suma(d.gastos);
    const ingresosMes = {};
    for (const p of pagos) for (const [m, v] of reparto(p)) ingresosMes[m] = (ingresosMes[m] || 0) + v;
    const conMov = [...Object.keys(ingresosMes), ...d.gastos.map((g) => g.fecha.slice(0, 7)), d.config.mesInicio, mesActual].sort();
    const serie = listaMeses(conMov[0], conMov[conMov.length - 1]).map((mes) => ({
      mes,
      ingresos: ingresosMes[mes] || 0,
      gastos: suma(d.gastos.filter((g) => g.fecha.startsWith(mes))),
    }));
    const porCategoria = {};
    for (const g of d.gastos) porCategoria[g.categoria || 'Otros'] = (porCategoria[g.categoria || 'Otros'] || 0) + Number(g.monto || 0);

    return {
      mesActual, meses, aptos, dia, serie, ingresos, gastos,
      fondo: (Number(d.config.saldoInicial) || 0) + ingresos - gastos,
      porCobrar: aptos.reduce((t, a) => t + Math.max(a.saldo, 0), 0),
      alDia: aptos.filter((a) => a.estado === 'al-dia').length,
      porCategoria: Object.entries(porCategoria).sort((x, y) => y[1] - x[1]),
    };
  }

  const aB64 = (texto) => {
    const bytes = new TextEncoder().encode(texto);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  };
  const deB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  // Facturas escaneadas: se guardan como archivos en la carpeta soportes/ del repositorio.
  const CLAVE_SOPORTES = CLAVE_LOCAL + '_soportes';
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg' };
  const soporteValido = (ruta) => /^soportes\/[\w.-]+\.(pdf|jpg)$/.test(ruta || '');
  const soportesLocales = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_SOPORTES)) || {}; } catch { return {}; }
  };
  // Abre una factura que solo existe en este navegador (modo local o aún sin publicar).
  const abrirB64 = (ruta, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: MIME[ruta.split('.').pop()] })), '_blank');
  };

  // En teléfonos las tablas se muestran como fichas: cada celda lleva el título de su columna.
  const etiquetar = (tabla) => {
    const titulos = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent);
    tabla.classList.add('apilar');
    for (const tr of tabla.querySelectorAll('tbody tr')) {
      if (tr.cells.length === titulos.length) [...tr.cells].forEach((td, i) => { td.dataset.l = titulos[i]; });
    }
  };

  const leerLocal = () => {
    try { const t = localStorage.getItem(CLAVE_LOCAL); return t ? JSON.parse(t) : null; } catch { return null; }
  };

  async function cargarArchivo() {
    const r = await fetch(RUTA + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer ' + RUTA + ' (' + r.status + ')');
    return r.json();
  }

  return {
    RUTA, CLAVE_LOCAL, esLocal, esc, dinero, fijarMoneda, hoy, nombreMes, fechaCorta, uid, suma,
    listaMeses, pagosEfectivos, repoDetectado, normalizar, calcular, aB64, deB64, leerLocal, cargarArchivo,
    etiquetar, CLAVE_SOPORTES, soporteValido, soportesLocales, abrirB64,
  };
})();

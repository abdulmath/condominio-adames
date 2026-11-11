(() => {
  const { esc, dinero, hoy, fechaCorta, uid } = A;
  const $ = (s) => document.querySelector(s);
  const CLAVE_TOKEN = 'adames_token';
  const CLAVE_REPO = 'adames_repo';

  let datos = null;      // datos en edición
  let sha = null;        // versión del archivo en GitHub
  let gh = null;         // { repo, token, rama }  (null en modo local)
  let sucio = false;
  let pestana = 'pagos';
  let editando = null;   // id del registro en edición
  let subidas = {};      // facturas por subir: { ruta: base64 }
  let borrados = [];     // facturas reemplazadas o de gastos eliminados, por borrar del repositorio
  const MAX_PDF = 5 * 1024 * 1024;

  const CATEGORIAS = ['Electricidad', 'Agua', 'Limpieza', 'Mantenimiento', 'Seguridad', 'Jardinería', 'Administración', 'Otros'];
  const METODOS = ['Transferencia', 'Efectivo', 'Depósito', 'Cheque', 'Devolución'];

  // t: date | number | text | select | apto | apto-todos
  const ENTIDADES = {
    pagos: {
      titulo: 'Pagos', singular: 'pago',
      campos: [
        { k: 'fecha', l: 'Fecha', t: 'date' },
        { k: 'apto', l: 'Apartamento', t: 'apto' },
        { k: 'monto', l: 'Monto (negativo si es una devolución)', t: 'number', negativo: true },
        { k: 'metodo', l: 'Método', t: 'select', ops: METODOS },
        { k: 'mesDesde', l: 'Cubre desde (opcional)', t: 'month', opcional: true },
        { k: 'mesHasta', l: 'Cubre hasta (opcional)', t: 'month', opcional: true },
        { k: 'nota', l: 'Nota', t: 'text', opcional: true },
      ],
    },
    gastos: {
      titulo: 'Gastos', singular: 'gasto',
      campos: [
        { k: 'fecha', l: 'Fecha', t: 'date' },
        { k: 'categoria', l: 'Categoría', t: 'select', ops: CATEGORIAS },
        { k: 'descripcion', l: 'Descripción', t: 'text' },
        { k: 'monto', l: 'Monto', t: 'number' },
        { k: 'metodo', l: 'Forma de pago', t: 'select', ops: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'], opcional: true },
        { k: 'comprobante', l: 'N.º de comprobante', t: 'text', opcional: true },
        { k: 'soporte', l: 'Factura escaneada (imagen o PDF)', t: 'archivo', opcional: true },
        { k: 'pagadoPor', l: 'Pagado directamente por (opcional; se le acredita como pago)', t: 'apto', opcional: true },
      ],
    },
    cargos: {
      titulo: 'Cuotas extraordinarias', singular: 'cuota extraordinaria',
      campos: [
        { k: 'fecha', l: 'Fecha', t: 'date' },
        { k: 'descripcion', l: 'Descripción', t: 'text' },
        { k: 'monto', l: 'Monto por apartamento', t: 'number' },
        { k: 'apto', l: 'Aplica a', t: 'apto-todos' },
      ],
    },
    apartamentos: {
      titulo: 'Apartamentos', singular: 'apartamento',
      campos: [
        { k: 'id', l: 'Identificador (ej. 2B)', t: 'text', clave: true },
        { k: 'propietario', l: 'Propietario (opcional; será público)', t: 'text', opcional: true },
        { k: 'cuota', l: 'Cuota mensual', t: 'number', cero: true },
        { k: 'saldoInicial', l: 'Deuda anterior al inicio', t: 'number', cero: true, negativo: true },
      ],
    },
  };

  const aviso = (donde, clase, texto) => { $(donde).innerHTML = texto ? `<div class="aviso ${clase}">${esc(texto)}</div>` : ''; };

  // ---------- GitHub ----------
  async function api(ruta, opciones = {}) {
    const r = await fetch('https://api.github.com' + ruta, {
      cache: 'no-store', ...opciones,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + gh.token, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}));
      const e = new Error(cuerpo.message || r.statusText);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }
  const explicar = (e) => {
    if (e.status === 401) return 'Token inválido o vencido.';
    if (e.status === 403) return 'El token no tiene permiso de escritura (Contents: Read and write) sobre este repositorio.';
    if (e.status === 404) return 'No se encontró el repositorio o el archivo de datos. Revise el nombre y que el token tenga acceso.';
    if (e.status === 409) return 'Los datos cambiaron en GitHub desde que los abrió. Descargue un respaldo, recargue la página y repita el cambio.';
    return 'Error: ' + e.message;
  };

  async function entrarGitHub(repo, token, recordar) {
    gh = { repo, token };
    const info = await api(`/repos/${repo}`);
    gh.rama = info.default_branch;
    const archivo = await api(`/repos/${repo}/contents/${A.RUTA}?ref=${encodeURIComponent(gh.rama)}`);
    sha = archivo.sha;
    datos = A.normalizar(JSON.parse(A.deB64(archivo.content)));
    sessionStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_REPO, repo);
    if (recordar) localStorage.setItem(CLAVE_TOKEN, token); else localStorage.removeItem(CLAVE_TOKEN);
  }

  async function publicar() {
    $('#publicar').disabled = true;
    datos.actualizado = new Date().toISOString();
    try {
      await publicarSoportes();
      if (gh) {
        const r = await api(`/repos/${gh.repo}/contents/${A.RUTA}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: 'Actualización de datos del condominio (' + hoy() + ')',
            content: A.aB64(JSON.stringify(datos, null, 2) + '\n'),
            sha, branch: gh.rama,
          }),
        });
        sha = r.content.sha;
        aviso('#msg-panel', 'ok', 'Cambios publicados. El dashboard público se actualiza en uno o dos minutos.');
      } else {
        localStorage.setItem(A.CLAVE_LOCAL, JSON.stringify(datos));
        aviso('#msg-panel', 'ok', 'Cambios guardados en este navegador (modo local). Abra el dashboard para verlos.');
      }
      sucio = false;
    } catch (e) {
      aviso('#msg-panel', 'error', explicar(e));
    }
    pintarEstado();
  }

  // ---------- Facturas escaneadas ----------
  const leerB64 = (blob) => new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result.split(',')[1]);
    fr.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    fr.readAsDataURL(blob);
  });
  // Los PDF se guardan tal cual; las imágenes se reducen a JPEG de 1800 px como máximo.
  async function prepararSoporte(archivo, fecha) {
    let ext, b64;
    if (archivo.type === 'application/pdf') {
      if (archivo.size > MAX_PDF) throw new Error('El PDF pesa más de 5 MB. Escanéelo con menor resolución.');
      ext = 'pdf'; b64 = await leerB64(archivo);
    } else if (archivo.type.startsWith('image/')) {
      let img;
      try { img = await createImageBitmap(archivo); } catch { throw new Error('No se pudo abrir la imagen. Use JPG, PNG o PDF.'); }
      const k = Math.min(1, 1800 / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * k); lienzo.height = Math.round(img.height * k);
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      ext = 'jpg'; b64 = lienzo.toDataURL('image/jpeg', 0.82).split(',')[1];
    } else throw new Error('La factura debe ser una imagen o un PDF.');
    const ruta = `soportes/${fecha}-${uid()}.${ext}`;
    subidas[ruta] = b64;
    return ruta;
  }
  const descartarSoporte = (ruta) => {
    if (!ruta) return;
    if (subidas[ruta]) delete subidas[ruta]; else borrados.push(ruta);
  };

  async function publicarSoportes() {
    if (!gh) {
      const guardados = A.soportesLocales();
      for (const r of borrados) delete guardados[r];
      Object.assign(guardados, subidas);
      try { localStorage.setItem(A.CLAVE_SOPORTES, JSON.stringify(guardados)); }
      catch { throw new Error('Las facturas no caben en el almacenamiento de prueba de este navegador. En el sitio publicado no existe ese límite.'); }
    } else {
      for (const [ruta, b64] of Object.entries(subidas)) {
        await api(`/repos/${gh.repo}/contents/${ruta}`, { method: 'PUT', body: JSON.stringify({ message: 'Factura de soporte: ' + ruta, content: b64, branch: gh.rama }) });
        delete subidas[ruta];
      }
      for (const ruta of borrados) {
        try {
          const f = await api(`/repos/${gh.repo}/contents/${ruta}?ref=${encodeURIComponent(gh.rama)}`);
          await api(`/repos/${gh.repo}/contents/${ruta}`, { method: 'DELETE', body: JSON.stringify({ message: 'Se retira factura: ' + ruta, sha: f.sha, branch: gh.rama }) });
        } catch { /* ya no existe; no impide publicar */ }
      }
    }
    subidas = {}; borrados = [];
  }

  // ---------- Interfaz ----------
  function pintarEstado() {
    $('#estado-guardado').innerHTML = (gh ? `Repositorio <strong>${esc(gh.repo)}</strong>` : '<strong>Modo local</strong> (solo este navegador)') +
      ' · ' + (sucio ? '<span class="neg">Hay cambios sin publicar</span>' : 'Sin cambios pendientes');
    $('#publicar').disabled = !sucio;
  }
  const marcar = () => { sucio = true; aviso('#msg-panel', '', ''); pintarEstado(); };

  function abrirPanel() {
    A.fijarMoneda(datos.config.moneda);
    $('#acceso').hidden = true;
    $('#panel').hidden = false;
    $('#salir').hidden = false;
    pintarTabs();
    pintar();
    pintarEstado();
  }

  function pintarTabs() {
    const tabs = [...Object.entries(ENTIDADES).map(([k, e]) => [k, e.titulo]), ['config', 'Configuración']];
    $('#tabs').innerHTML = tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === pestana ? 'activa' : ''}">${t}</button>`).join('');
  }

  const opcionesApto = (todos) => (todos ? '<option value="*">Todos los apartamentos</option>' : '<option value="">—</option>') +
    datos.apartamentos.map((a) => `<option value="${esc(a.id)}">${esc(a.id)}</option>`).join('');

  function control(c, valor) {
    const v = esc(valor ?? '');
    const req = c.opcional ? '' : 'required';
    if (c.t === 'select') return `<select name="${c.k}" ${req}>${c.opcional ? '<option value="">—</option>' : ''}${c.ops.map((o) => `<option ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (c.t === 'apto' || c.t === 'apto-todos') return `<select name="${c.k}" ${req}>${opcionesApto(c.t === 'apto-todos')}</select>`;
    if (c.t === 'number') return `<input name="${c.k}" type="number" step="0.01" ${c.negativo ? '' : 'min="0"'} value="${v}" ${req}>`;
    if (c.t === 'month') return `<input name="${c.k}" type="month" value="${v}">`;
    if (c.t === 'archivo') return `<input name="${c.k}" type="file" accept="image/*,application/pdf">` + (valor ? '<small>Ya tiene factura; elija un archivo solo para reemplazarla.</small>' : '');
    if (c.t === 'date') return `<input name="${c.k}" type="date" value="${v || hoy()}" ${req}>`;
    return `<input name="${c.k}" type="text" value="${v}" ${req} ${c.clave && editando ? 'readonly' : ''} maxlength="200">`;
  }

  function pintar() {
    if (pestana === 'config') return pintarConfig();
    const ent = ENTIDADES[pestana];
    const lista = datos[pestana];
    const actual = editando ? lista.find((x) => x.id === editando) : null;

    $('#ficha').innerHTML = ent.campos.map((c) => `<label>${c.l}${control(c, actual ? actual[c.k] : (c.cero ? 0 : ''))}</label>`).join('') +
      `<div class="acciones"><button class="primario">${actual ? 'Guardar cambios' : 'Agregar ' + ent.singular}</button>${actual ? '<button type="button" data-cancelar>Cancelar</button>' : ''}</div>`;
    if (actual) for (const c of ent.campos) if (c.t.startsWith('apto')) $('#ficha').elements[c.k].value = actual[c.k] || '';

    const orden = pestana === 'apartamentos' ? lista : [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const celda = (c, x) => {
      if (c.t === 'number') return `<td class="num">${dinero(x[c.k])}</td>`;
      if (c.t === 'date') return `<td>${fechaCorta(x[c.k])}</td>`;
      if (c.t === 'month') return `<td>${x[c.k] ? A.nombreMes(x[c.k]) : '—'}</td>`;
      if (c.t === 'archivo') return `<td>${x[c.k] ? `<button type="button" class="mini" data-ver="${esc(x[c.k])}">Ver</button>` : '—'}</td>`;
      if (c.t === 'apto-todos') return `<td>${x[c.k] === '*' ? 'Todos' : esc(x[c.k])}</td>`;
      return `<td class="${c.t === 'text' && !c.clave ? 'libre' : ''}">${esc(x[c.k])}</td>`;
    };
    $('#sec-lista').hidden = false;
    $('#lista').innerHTML = '<thead><tr>' + ent.campos.map((c) => `<th class="${c.t === 'number' ? 'num' : ''}">${c.l.replace(/ \(.*/, '')}</th>`).join('') + '<th></th></tr></thead><tbody>' +
      (orden.map((x) => `<tr>${ent.campos.map((c) => celda(c, x)).join('')}<td><button class="mini" data-editar="${esc(x.id)}">Editar</button> <button class="mini peligro" data-borrar="${esc(x.id)}">Eliminar</button></td></tr>`).join('') ||
        `<tr><td colspan="${ent.campos.length + 1}" class="nota">Sin registros todavía.</td></tr>`) + '</tbody>';
    A.etiquetar($('#lista'));
  }

  function pintarConfig() {
    const c = datos.config;
    $('#sec-lista').hidden = true;
    $('#ficha').innerHTML = `
      <label class="ancho">Nombre del condominio<input name="nombre" value="${esc(c.nombre)}" required></label>
      <label class="ancho">Ubicación<input name="ubicacion" value="${esc(c.ubicacion)}"></label>
      <label>Moneda<input name="moneda" value="${esc(c.moneda)}" required maxlength="6"></label>
      <label>Mes de inicio del control<input name="mesInicio" type="month" value="${esc(c.mesInicio)}" required></label>
      <label>Día de vencimiento de la cuota (1 a 28)<input name="diaVencimiento" type="number" min="1" max="28" step="1" value="${esc(c.diaVencimiento)}" required></label>
      <label>Fondo inicial en caja/banco<input name="saldoInicial" type="number" step="0.01" value="${esc(c.saldoInicial)}" required></label>
      <label class="ancho">Aviso para los propietarios (opcional)<input name="aviso" value="${esc(c.aviso)}" maxlength="300"></label>
      <div class="acciones"><button class="primario">Guardar configuración</button>
      ${datos.demo ? '<button type="button" class="peligro" data-vaciar>Borrar datos de ejemplo</button>' : ''}</div>`;
  }

  async function guardarFicha(ev) {
    ev.preventDefault();
    const f = new FormData($('#ficha'));
    if (pestana === 'config') {
      for (const k of ['nombre', 'ubicacion', 'moneda', 'mesInicio', 'aviso']) datos.config[k] = String(f.get(k)).trim();
      datos.config.saldoInicial = Number(f.get('saldoInicial')) || 0;
      datos.config.diaVencimiento = Math.min(Math.max(Math.round(Number(f.get('diaVencimiento'))) || 1, 1), 28);
      A.fijarMoneda(datos.config.moneda);
      marcar();
      return aviso('#msg-panel', 'info', 'Configuración lista. Pulse «Publicar cambios» para que se vea en el dashboard.');
    }
    const ent = ENTIDADES[pestana];
    const reg = {};
    const previo = editando ? datos[pestana].find((x) => x.id === editando) : null;
    for (const c of ent.campos) {
      if (c.t === 'archivo') {
        const archivo = f.get(c.k);
        reg[c.k] = previo ? previo[c.k] || '' : '';
        if (archivo && archivo.size) {
          try { const nueva = await prepararSoporte(archivo, String(f.get('fecha'))); descartarSoporte(reg[c.k]); reg[c.k] = nueva; }
          catch (e) { return aviso('#msg-panel', 'error', e.message); }
        }
        continue;
      }
      const v = String(f.get(c.k) ?? '').trim();
      reg[c.k] = c.t === 'number' ? Number(v) : v;
      if (c.t === 'number' && (!isFinite(reg[c.k]) || (!c.cero && (c.negativo ? reg[c.k] === 0 : reg[c.k] <= 0)))) return aviso('#msg-panel', 'error', `«${c.l.replace(/ \(.*/, '')}» debe ser un monto ${c.negativo ? 'distinto de' : 'mayor que'} cero.`);
    }
    if (reg.mesDesde && reg.mesHasta && reg.mesHasta < reg.mesDesde) return aviso('#msg-panel', 'error', '«Cubre hasta» no puede ser anterior a «Cubre desde».');
    const lista = datos[pestana];
    if (editando) {
      Object.assign(lista.find((x) => x.id === editando), reg);
    } else {
      if (pestana === 'apartamentos') {
        if (lista.some((x) => x.id.toLowerCase() === reg.id.toLowerCase())) return aviso('#msg-panel', 'error', 'Ya existe un apartamento con ese identificador.');
      } else reg.id = uid();
      lista.push(reg);
    }
    editando = null;
    marcar();
    pintar();
  }

  function clicPanel(ev) {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { pestana = b.dataset.tab; editando = null; pintarTabs(); pintar(); }
    else if (b.dataset.editar) { editando = b.dataset.editar; pintar(); $('#ficha').scrollIntoView({ block: 'center' }); }
    else if ('cancelar' in b.dataset) { editando = null; pintar(); }
    else if (b.dataset.ver) {
      const ruta = b.dataset.ver;
      const b64 = subidas[ruta] || (!gh && A.soportesLocales()[ruta]);
      if (b64) A.abrirB64(ruta, b64); else if (A.soporteValido(ruta)) window.open(ruta, '_blank', 'noopener');
    }
    else if (b.dataset.borrar) {
      const id = b.dataset.borrar;
      if (pestana === 'apartamentos' && (datos.pagos.some((p) => p.apto === id) || datos.cargos.some((c) => c.apto === id) || datos.gastos.some((g) => g.pagadoPor === id))) {
        return aviso('#msg-panel', 'error', 'Ese apartamento tiene pagos, cuotas o facturas registradas; elimínelos primero.');
      }
      if (!confirm('¿Eliminar este registro?')) return;
      descartarSoporte((datos[pestana].find((x) => x.id === id) || {}).soporte);
      datos[pestana] = datos[pestana].filter((x) => x.id !== id);
      editando = null; marcar(); pintar();
    } else if ('vaciar' in b.dataset) {
      if (!confirm('Se borrarán todos los pagos, gastos y cuotas extraordinarias de ejemplo. Los apartamentos se conservan. ¿Continuar?')) return;
      datos.pagos = []; datos.gastos = []; datos.cargos = []; datos.config.saldoInicial = 0;
      delete datos.demo;
      marcar(); pintar();
    }
  }

  function respaldo() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    a.download = `condominio-adames-${hoy()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Inicio ----------
  $('#repo').value = A.repoDetectado() || localStorage.getItem(CLAVE_REPO) || '';
  $('#modo-local').hidden = !A.esLocal;

  $('#form-acceso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    aviso('#msg-acceso', 'info', 'Conectando con GitHub…');
    try {
      await entrarGitHub($('#repo').value.trim(), $('#token').value.trim(), $('#recordar').checked);
      $('#token').value = '';
      aviso('#msg-acceso', '', '');
      abrirPanel();
    } catch (e) {
      gh = null;
      aviso('#msg-acceso', 'error', explicar(e));
    }
  });

  $('#modo-local').addEventListener('click', async () => {
    try {
      datos = A.normalizar(A.leerLocal() || await A.cargarArchivo());
      abrirPanel();
    } catch (e) { aviso('#msg-acceso', 'error', e.message); }
  });

  $('#salir').addEventListener('click', () => {
    if (sucio && !confirm('Hay cambios sin publicar. ¿Salir de todos modos?')) return;
    sessionStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_TOKEN);
    sucio = false;
    location.reload();
  });

  $('#ficha').addEventListener('submit', guardarFicha);
  $('#panel').addEventListener('click', clicPanel);
  $('#publicar').addEventListener('click', publicar);
  $('#respaldo').addEventListener('click', respaldo);
  window.addEventListener('beforeunload', (ev) => { if (sucio) ev.preventDefault(); });

  // Reanudar sesión si hay un token guardado
  const guardado = sessionStorage.getItem(CLAVE_TOKEN) || localStorage.getItem(CLAVE_TOKEN);
  if (guardado && $('#repo').value) {
    aviso('#msg-acceso', 'info', 'Reanudando sesión…');
    entrarGitHub($('#repo').value, guardado, !!localStorage.getItem(CLAVE_TOKEN))
      .then(() => { aviso('#msg-acceso', '', ''); abrirPanel(); })
      .catch((e) => { gh = null; aviso('#msg-acceso', 'error', explicar(e)); });
  }
})();

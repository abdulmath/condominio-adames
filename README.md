# Condominio Edificio ADAMES — control de pagos y gastos

Sitio estático para GitHub Pages. Residencial Jardines de Madre Vieja Norte, San Cristóbal, República Dominicana.

- `index.html`: dashboard público (fondo disponible, estado por apartamento, movimientos).
- `admin.html`: panel del administrador. Registra pagos, gastos, cuotas extraordinarias y apartamentos.
- `data/datos.json`: todos los datos. El panel lo actualiza con un commit a este repositorio, así que el historial de GitHub sirve de auditoría de cada cambio.

No hay servidor ni base de datos. El "usuario administrador" es quien tenga un token de GitHub con permiso de escritura sobre este repositorio; sin él, `admin.html` no puede cambiar nada.

## Publicar en línea

1. Crear una cuenta en GitHub (o usar una existente) y un repositorio **público** llamado, por ejemplo, `condominio-adames`.
2. Subir estos archivos. Desde esta carpeta:

   ```bash
   git init -b main
   git add .
   git commit -m "Sistema de control del Condominio ADAMES"
   git remote add origin https://github.com/abdulmath/condominio-adames.git
   git push -u origin main
   ```

3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardar.
4. En uno o dos minutos el sitio queda en `https://abdulmath.github.io/condominio-adames/`. Ese es el enlace para los propietarios.

## Crear el token del administrador

1. GitHub → foto de perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → `condominio-adames`.
3. **Permissions → Repository permissions → Contents: Read and write**. Nada más.
4. Elegir un vencimiento (máximo un año; al vencer se genera otro) y copiar el token.
5. Abrir `https://abdulmath.github.io/condominio-adames/admin.html`, pegar el token y entrar.

Guarde el token como una contraseña. Si se filtra, se revoca en esa misma pantalla de GitHub y se crea otro.

## Uso diario

1. Entrar a `admin.html`.
2. Registrar pagos o gastos. Los cambios quedan pendientes hasta pulsar **Publicar cambios**.
3. El dashboard público se actualiza uno o dos minutos después.

El control empieza en septiembre de 2026 con 5 apartamentos (101, 201, 202, 301, 302) y cuota de RD$ 2,000. Apartamentos, cuotas, mes de inicio y fondo inicial se ajustan en las pestañas **Apartamentos** y **Configuración**.

## Cómo se calcula el estado de cuenta

Para cada apartamento: `saldo = deuda anterior + cuotas extraordinarias + cuota mensual × meses transcurridos − pagos`. Los pagos se aplican primero a la deuda anterior y a las cuotas extraordinarias, y después a las mensualidades, de la más antigua a la más reciente.

### Apartamento que paga con una factura (apto. 201)

El 201 cubre su cuota pagando la factura de electricidad. Cada mes se registra la factura en **Gastos** eligiendo `201` en «Pagado directamente por». El sistema la cuenta como gasto del condominio y como pago del 201 por el mismo monto:

- Factura menor que la cuota: la diferencia queda como deuda del 201.
- Factura mayor: el exceso queda a favor del 201. Al devolvérselo, se registra en **Pagos** un monto negativo con método «Devolución».

## Privacidad

El repositorio es público: todo lo que se escriba en el panel (incluido el nombre del propietario, si se llena) lo puede leer cualquiera. Para identificar basta el número de apartamento.

## Probar en la computadora

```bash
python3 -m http.server 8770
```

Abrir `http://localhost:8770/admin.html` y elegir **Probar sin conexión (modo local)**. Los cambios se guardan solo en ese navegador.

## Facturas escaneadas y pagos adelantados

- **Factura de soporte:** al registrar un gasto se puede adjuntar la factura (imagen o PDF de hasta 5 MB). Se guarda en la carpeta `soportes/` del repositorio y el dashboard muestra el enlace «Ver factura» junto al gasto. Las imágenes se reducen automáticamente. Como todo el repositorio, las facturas son públicas.
- **Pagos adelantados:** al registrar un pago se indica «Cubre desde / hasta». El monto se reparte en partes iguales entre esos meses en el resumen mensual. Sin esos campos, el pago cuenta en el mes de su fecha.

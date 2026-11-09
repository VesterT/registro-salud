# Mi Registro de Salud

App web sencilla para registrar **presión arterial** y **glucosa**, con inicio de sesión por usuario.
Sin servidor ni base de datos: los datos se guardan en archivos **CSV** dentro de un repositorio
**privado** de GitHub, y la app se publica gratis en **GitHub Pages**.

- HTML + HTMX (pestañas) + JavaScript sin frameworks.
- Librerías por CDN: Chart.js (gráficas) y jsPDF (reporte PDF).

## Cómo funciona

| Repositorio | Visibilidad | Contenido |
|---|---|---|
| `registro-salud` | público (GitHub Pages) | La app y `usuarios.json` (cifrado) |
| `registro-salud-datos` | **privado** | `data/<usuario>/presion.csv` y `glucosa.csv` |

`usuarios.json` no contiene datos legibles: el correo se guarda como huella SHA-256 y el perfil
(nombre, apellido, carpeta y token de acceso al repositorio privado) va cifrado con la contraseña
del usuario (PBKDF2-SHA256 con 600 000 iteraciones + AES-256-GCM). La contraseña no se guarda en
ningún lado: iniciar sesión = poder descifrar el perfil. La sesión queda guardada en el dispositivo
hasta tocar **Cerrar sesión**.

Usa contraseñas largas: como `usuarios.json` es público, una contraseña débil podría adivinarse por fuerza bruta.

## Administrar usuarios (no hay pantalla para esto en la app)

```bash
# Agregar o actualizar (pide contraseña y token sin mostrarlos)
node tools/usuarios.mjs agregar --correo ana@correo.com --nombre Ana --apellido López --saludo Bienvenida

# Eliminar (sus CSV permanecen en el repositorio privado)
node tools/usuarios.mjs eliminar --correo ana@correo.com
```

Luego sube el `usuarios.json` actualizado al repositorio de la app.

Si cambias el token de GitHub, vuelve a ejecutar `agregar` para cada usuario (se necesita su contraseña).

## Token de acceso a los datos

En GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
- *Repository access*: **Only select repositories** → `registro-salud-datos`
- *Permissions → Contents*: **Read and write**
- Expiración: la que prefieras (al vencer, genera otro y vuelve a ejecutar `agregar`).

## Formato de los CSV

`presion.csv`: `id,fecha,hora,sistolica,diastolica,pulso,brazo,posicion,notas`

`glucosa.csv`: `id,fecha,hora,glucosa,momento,notas`

Fechas `AAAA-MM-DD`, horas `HH:MM`. Puedes editarlos directamente en GitHub o abrirlos en Excel.

## Probar en tu computadora

```bash
python3 -m http.server 8000   # y abre http://localhost:8000
```

## Reglas

- Los registros nuevos se guardan con la fecha de hoy; la hora se puede ajustar.
- Solo se pueden **editar o eliminar** los registros del día de hoy.
- Las clasificaciones (Normal, Elevada, etc.) son referencias generales y **no sustituyen la opinión médica**.

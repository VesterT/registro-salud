# Mi Registro de Salud

App web sencilla para registrar **presión arterial** y **glucosa**. Sin servidor ni base de datos:
los datos se guardan en archivos **CSV**.

- HTML + HTMX (pestañas) + JavaScript sin frameworks.
- Librerías por CDN: Chart.js (gráficas) y jsPDF (reporte PDF).
- Se publica gratis en **GitHub Pages**.

## ¿Dónde se guardan los datos?

En **Ajustes** eliges:

1. **Solo este dispositivo**: los CSV se guardan en el navegador. Funciona sin configurar nada,
   pero los datos no se comparten entre el celular y la computadora, y se pierden si borras los datos del navegador.
2. **GitHub (recomendado)**: la app lee y escribe `data/presion.csv` y `data/glucosa.csv`
   directamente en un repositorio **privado** usando la API de GitHub. Así tienes los mismos datos en
   cualquier dispositivo y un historial de cada cambio.

> Usa **dos repositorios**: uno público para la app (GitHub Pages gratis necesita repo público)
> y uno **privado** para tus datos de salud.

## Publicar la app (una sola vez)

1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio **público** llamado, por ejemplo, `registro-salud`.
3. Sube estos archivos (puedes arrastrarlos en *Add file → Upload files*, o con git):
   ```bash
   cd registro-salud
   git init && git add . && git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/registro-salud.git
   git push -u origin main
   ```
4. En el repositorio: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
5. En un par de minutos la app estará en `https://TU_USUARIO.github.io/registro-salud/`.

## Configurar el almacenamiento en GitHub

1. Crea un repositorio **privado**, por ejemplo `registro-salud-datos`
   (marca “Add a README” para que tenga la rama `main`).
2. Crea un token: **Settings (de tu perfil) → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
   - *Repository access*: **Only select repositories** → `registro-salud-datos`
   - *Permissions → Repository permissions → Contents*: **Read and write**
   - Elige una fecha de expiración (por ejemplo, 1 año).
3. Abre la app → **Ajustes** → elige *GitHub*, escribe tu usuario, `registro-salud-datos`, rama `main`,
   carpeta `data` y pega el token → **Probar conexión** → **Guardar ajustes**.
4. Repite el paso 3 en cada dispositivo (el token se guarda solo en ese navegador).

Los archivos `data/presion.csv` y `data/glucosa.csv` se crean solos al guardar el primer registro.

## Formato de los CSV

`presion.csv`
```
id,fecha,hora,sistolica,diastolica,pulso,brazo,posicion,notas
```

`glucosa.csv`
```
id,fecha,hora,glucosa,momento,notas
```

Fechas en formato `AAAA-MM-DD` y horas `HH:MM`. Puedes abrirlos en Excel o Google Sheets.

## Probar en tu computadora

HTMX necesita servir los archivos por HTTP (no funciona abriendo `index.html` con doble clic):

```bash
cd registro-salud
python3 -m http.server 8000
# abre http://localhost:8000
```

## Reglas

- Los registros nuevos se guardan con la fecha de hoy; la hora se puede ajustar.
- Solo se pueden **editar o eliminar** los registros del día de hoy.
- Las clasificaciones (Normal, Elevada, etc.) son referencias generales y **no sustituyen la opinión médica**.

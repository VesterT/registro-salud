#!/usr/bin/env node
/* Administra usuarios.json (sin dependencias, Node 20+).

   Agregar o actualizar un usuario:
     node tools/usuarios.mjs agregar --correo ana@correo.com --nombre Ana --apellido López [--saludo Bienvenida]
         [--carpeta data/ana] [--owner VesterT] [--repo registro-salud-datos] [--rama main]
     Pide la contraseña y el token de GitHub (o tómalos de USUARIO_CONTRASENA y GITHUB_TOKEN).

   Eliminar un usuario:
     node tools/usuarios.mjs eliminar --correo ana@correo.com

   Cada usuario se guarda cifrado con su contraseña (PBKDF2-SHA256 600k + AES-256-GCM).
   El correo se guarda solo como huella SHA-256; la contraseña no se guarda. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ARCHIVO = fileURLToPath(new URL('../usuarios.json', import.meta.url));
const ITERACIONES = 600_000;
const { subtle } = globalThis.crypto;

const [comando, ...resto] = process.argv.slice(2);
const opciones = {};
for (let i = 0; i < resto.length; i += 2) opciones[resto[i].replace(/^--/, '')] = resto[i + 1];

const b64 = bytes => Buffer.from(bytes).toString('base64');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function huellaCorreo(correo) {
  const datos = new TextEncoder().encode('registro-salud:' + correo.trim().toLowerCase());
  return Buffer.from(await subtle.digest('SHA-256', datos)).toString('hex');
}

function preguntarOculto(pregunta) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(pregunta)) process.stdout.write(s); };
    rl.question(pregunta, r => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

function leer() {
  return existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : { version: 1, usuarios: {} };
}

function guardar(db) {
  writeFileSync(ARCHIVO, JSON.stringify(db, null, 2) + '\n');
}

async function agregar() {
  const { correo, nombre, apellido = '' } = opciones;
  if (!correo || !nombre) throw new Error('Faltan --correo y --nombre');
  const contrasena = process.env.USUARIO_CONTRASENA || await preguntarOculto('Contraseña del usuario: ');
  const token = process.env.GITHUB_TOKEN ?? await preguntarOculto('Token de GitHub (fine-grained, solo el repo de datos): ');
  if (contrasena.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const perfil = {
    nombre, apellido,
    saludo: opciones.saludo || 'Hola',
    owner: opciones.owner || 'VesterT',
    repo: opciones.repo || 'registro-salud-datos',
    rama: opciones.rama || 'main',
    carpeta: opciones.carpeta || `data/${slug(nombre + ' ' + apellido)}`,
    token,
  };

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  const llave = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cifrado = await subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(JSON.stringify(perfil)));

  const db = leer();
  db.usuarios[await huellaCorreo(correo)] = { sal: b64(sal), iv: b64(iv), iteraciones: ITERACIONES, datos: b64(new Uint8Array(cifrado)) };
  guardar(db);
  console.log(`Usuario guardado: ${nombre} ${apellido} → ${perfil.owner}/${perfil.repo}/${perfil.carpeta}${token ? '' : '  (⚠️ sin token)'}`);
}

async function eliminar() {
  if (!opciones.correo) throw new Error('Falta --correo');
  const db = leer();
  const clave = await huellaCorreo(opciones.correo);
  if (!db.usuarios[clave]) throw new Error('No existe ese usuario');
  delete db.usuarios[clave];
  guardar(db);
  console.log('Usuario eliminado. (Sus datos siguen en el repositorio privado.)');
}

const comandos = { agregar, eliminar };
if (!comandos[comando]) {
  console.log('Uso: node tools/usuarios.mjs agregar|eliminar --correo … (ver comentarios al inicio del archivo)');
  process.exit(1);
}
comandos[comando]().catch(e => { console.error('Error:', e.message); process.exit(1); });

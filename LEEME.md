# Pantallas de Gestión empresarial (para desarrollar el módulo de Mantenimiento)

Este repositorio tiene **solo las pantallas** de la aplicación. Sirve para ver la app funcionando y para diseñar el módulo de Mantenimiento.
Es privado: no se comparte ni se muestra a nadie.

## Para verla funcionando

1. Clonar el repositorio y abrir una terminal dentro de la carpeta.
2. Instalar (una sola vez):

   pnpm install

3. Arrancar la aplicación:

   pnpm run dev

4. Abrir en el navegador la dirección que aparece (normalmente http://localhost:5173) y entrar con el correo y la contraseña que te dio Eric.

No hay que crear ningún archivo ni configurar nada: la conexión a la base de pruebas ya viene en el repositorio (archivo `.env`).
Para cortar la aplicación: `Ctrl + C` en la terminal. Para volver a arrancarla: `pnpm run dev`.

La aplicación se conecta a una **copia de prueba** de los datos de la fábrica (repuestos, proveedores, envíos, retiros, reparaciones).
Lo que cargues o borres acá no afecta a la aplicación real.

## Para trabajar con Claude

Abrí Claude en esta carpeta. Ya tiene un archivo (`CLAUDE.md`) con las reglas del proyecto, así que sabe qué puede tocar y qué no.
Contale en tus palabras qué necesitás que haga el módulo de Mantenimiento: cómo trabajan ustedes, qué datos manejan, qué pantallas quieren ver.

## Cuando termines un tramo

Decile a Claude: "guardá los cambios y subilos". Eric los ve en GitHub.

## Si algo no anda

- "No se encuentra pnpm": hay que instalarlo (`npm install -g pnpm`).
- Pantalla en blanco o error de conexión: avisale a Eric (probablemente cambió algo en la base de pruebas).
- Cualquier otro error: copiá el mensaje y mostráselo a Claude o a Eric.

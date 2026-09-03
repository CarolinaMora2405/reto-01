# Agente conversacional — Registro como Proveedor

Aplicación completa React + Node/TypeScript que prepara formularios XLSX/PDF, valores para portales y paquetes de soportes. Los valores empresariales provienen exclusivamente de herramientas deterministas.

## Inicio local

Requisitos: Node.js 20+ y npm.

```bash
npm install
cp .env.example .env
# añade OPENAI_API_KEY a .env
npm run dev
```

Abre `http://localhost:5173`. Vite sirve el frontend y redirige `/api` al backend en `http://localhost:3001`.

La aplicación carga `.env` automáticamente solo en el backend. Abre `.env` y escribe una clave válida en `OPENAI_API_KEY=`; nunca uses el prefijo `VITE_`, porque eso expondría el secreto al navegador. En despliegue, usa las variables secretas de la plataforma.

La interfaz abre en `http://localhost:5173`. El puerto `3001` corresponde a la API y redirige a la interfaz en desarrollo.

## Verificación sin IA

```bash
npm run demo
npm test
npm run typecheck
npm run build
```

`npm run demo` limpia `out/`, descubre todos los casos y ejecuta directamente las cuatro herramientas de preparación. No necesita clave y deja los resultados bajo `out/<caso>/`.

## API

- `POST /api/chat` — `{ "sessionId": "uuid", "message": "..." }`.
- `GET /api/sessions/:id` — historial completo en memoria.
- `GET /api/health` — proveedor y modelo; nunca revela la clave.

Límites predeterminados: 25 ciclos, 12.000 tokens por sesión y 30 segundos por llamada al modelo. Se cambian en `runAgent` o se pueden promover a variables de entorno.

## Casos de demo

- `co-industrias-delta`: XLSX, paquete listo.
- `ec-corp-andina`: PDF, identificador extranjero y certificación vencida.
- `hn-agroexport-sula`: portal, campo SWIFT faltante y certificación vencida.

Prompt recomendado: `Procesa el caso "ec-corp-andina". Dime qué quedó lleno y qué falta. No envíes nada todavía.`

## Link público


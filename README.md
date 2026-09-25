# Luminar — Backend

> API y lógica de negocio del "All-in-One Personal Workspace": autenticación, persistencia e integraciones externas (Spotify, IA, diccionario).

Desarrollado por **Adxqh14**.

## ✨ Responsabilidades

| Módulo | Estado |
|---|---|
| 🔐 Autenticación y sesiones | 🚧 V1 |
| ✅ API de Tareas (CRUD) | 🚧 V1 |
| 📅 API de Calendario (CRUD) | 🚧 V1 |
| 🎵 OAuth y proxy de Spotify | 📋 V2 |
| 📖 Proxy de Diccionario | 📋 V2 |
| 🤖 Router de proveedores de IA | 📋 V3 |
| 🔎 Indexación para búsqueda semántica | 📋 V3 |

Este repositorio contiene únicamente la **API**. La interfaz de usuario vive en [Luminar-Frontend](../Luminar-Frontend), que consume estos endpoints.

## 🛠️ Stack Tecnológico

- **Runtime:** Node.js 20+ con TypeScript
- **Framework API:** Fastify (o Express, según preferencia)
- **ORM:** Prisma
- **Base de datos:** PostgreSQL (Neon / Supabase)
- **Autenticación:** Auth.js / JWT
- **Cache y rate limiting:** Upstash Redis
- **Integraciones IA:** Vercel AI SDK (server-side)
- **Integración Spotify:** Spotify Web API
- **Testing:** Vitest

> Nota: como este es un repo separado del frontend, aquí asumí una API standalone en Node.js en lugar de API Routes de Next.js. Si prefieres mantener todo dentro del ecosistema Next.js (por ejemplo, un segundo proyecto Next.js solo para `app/api`), dime y ajusto el stack y la estructura.

## 🚀 Instalación

### Requisitos previos

- Node.js 20+
- pnpm (recomendado) o npm
- Una base de datos PostgreSQL (local o Neon/Supabase)

### Pasos

1. Clona el repositorio

   ```bash
   git clone https://github.com/Adxqh14/Luminar-Backend.git
   cd Luminar-Backend
   ```

2. Instala las dependencias

   ```bash
   pnpm install
   ```

3. Configura las variables de entorno

   ```bash
   cp .env.example .env
   ```

   Completa las siguientes variables en `.env`:

   ```
   PORT=4000
   DATABASE_URL=
   JWT_SECRET=

   SPOTIFY_CLIENT_ID=
   SPOTIFY_CLIENT_SECRET=

   ANTHROPIC_API_KEY=
   OPENAI_API_KEY=

   REDIS_URL=
   ```

4. Ejecuta las migraciones de Prisma

   ```bash
   pnpm prisma migrate dev
   ```

5. Levanta el servidor de desarrollo

   ```bash
   pnpm dev
   ```

   La API estará disponible en [http://localhost:4000](http://localhost:4000)

## 📂 Estructura del proyecto

```
src/
├── routes/
│   ├── auth/
│   ├── tasks/
│   ├── calendar/
│   ├── spotify/
│   ├── dictionary/
│   └── ai/
├── controllers/
├── services/
├── middlewares/
└── lib/
    ├── db.ts
    ├── redis.ts
    └── ai/
        ├── providers/
        └── router.ts
prisma/
└── schema.prisma
tests/
```

## 🗺️ Roadmap

- [ ] **V1 — Núcleo:** Auth, API de Tareas, API de Calendario
- [ ] **V2 — Integraciones:** OAuth + proxy de Spotify, proxy de Diccionario
- [ ] **V3 — Inteligencia:** Router de IAs, indexación para búsqueda semántica

## 📄 Licencia

© Adxqh14. Todos los derechos reservados.

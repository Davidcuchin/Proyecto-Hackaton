# Proyecto Hackathon

Monorepo inicial con npm workspaces: `apps/api` (Express y Prisma),
`apps/web` (Next.js) y `packages/shared` (tipos y validaciones compartidos).

## Inicio

1. Instala Node.js 20.19 o superior y npm.
2. En PowerShell, ejecuta `npm.cmd install` desde la raiz.
3. Ejecuta `Copy-Item .env.example .env` y completa los valores necesarios.
   No subas credenciales al repositorio.
4. Ejecuta `npm.cmd run dev`. La web estara en `http://localhost:3000` y la
   comprobacion de la API en `http://localhost:3001/api/v1/health`.
5. Para compilar, ejecuta `npm.cmd run build`.

El esquema Prisma es inicial y aun no contiene modelos. Una vez definidos y
configurada `DATABASE_URL`, ejecuta `npm.cmd run db:push`. `npm.cmd run db:seed` y
`npm.cmd run test:edge -w @proyecto/api` informan que aun falta implementar los
datos y escenarios de la demo.

Las pantallas, autenticacion, rutas de negocio, integraciones y validaciones
compartidas son puntos de partida, no funcionalidades implementadas. El
dashboard muestra datos de demostracion y sus filtros cambian entre ejemplos;
no consulta ventas reales ni gestiona campanas todavia.

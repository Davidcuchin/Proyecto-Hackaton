# Impulso

Aplicación local para emprendedores. Incluye un panel adaptable a escritorio y celular, una tienda pública por comercio y una API Express con Prisma y PostgreSQL.

## Ejecutar en local

Requisitos: Node.js 22.12 o superior, npm y Docker con Compose. También puedes usar PostgreSQL 16 de una instalación existente y modificar `DATABASE_URL` en `api/.env`.

```sh
npm ci
npm run setup
npm run db:generate
docker compose up -d --wait
npm run db:migrate
npm run dev
```

| Servicio | Dirección |
| --- | --- |
| Web | http://localhost:4317 |
| API | http://127.0.0.1:4318/api/v1 |
| PostgreSQL de Compose | 127.0.0.1:55437 |

Next.js reenvía `/api/v1/*` y `/api/auth/*` a Express para que el navegador use un solo origen. Abre la web con el mismo origen que `APP_ORIGIN`. Los datos de Compose persisten al detener el contenedor. Para compilar y ejecutar el build, usa `npm run build` seguido de `npm start`.

## Acceso y cuentas de ejemplo

Impulso usa Auth.js con correo y contraseña. `npm run setup` genera `AUTH_SECRET` en `api/.env`. Desde el inicio puedes crear una cuenta y registrar tu comercio o comprar en una tienda existente.

Activa `DEMO_MODE=true` en `api/.env` y ejecuta `npm run db:seed` después de aplicar las migraciones. Reinicia Impulso, abre [localhost:4317](http://localhost:4317) e ingresa con una de estas cuentas:

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Emprendedor | `emprendedora@impulso.test` | `ImpulsoDemo2026!` |
| Ferretería El Martillo | `ferreteria@impulso.test` | `FerreteriaDemo2026!` |
| Peluquería Estilo Dorado | `peluqueria@impulso.test` | `PeluqueriaDemo2026!` |
| Comprador | `comprador@impulso.test` | `CompraDemo2026!` |

Cada emprendedor entra al panel de su comercio, con inventario, ventas de ejemplo y un pedido pendiente. El comprador entra a **Mercado del Valle**, donde puede hacer pedidos y ver sus cupones. Se pueden usar perfiles de navegador separados para mantener varias sesiones abiertas. Las cuentas de ejemplo están habilitadas durante el desarrollo en localhost.

## Configurar integraciones

Edita `api/.env` y reinicia la API cuando cambies estas variables.

| Integración | Variables | Configuración |
| --- | --- | --- |
| Correo por Resend | `RESEND_API_KEY`, `MAIL_FROM` | Usa un remitente habilitado. El proceso de la API despacha cupones y recordatorios desde la cola persistente. |
| IA | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Indica una URL base compatible con Chat Completions, por ejemplo `https://api.deepseek.com/v1`, y un modelo habilitado en tu proveedor. `LLM_API_KEY` puede quedar vacía con servidores locales que no piden credenciales. |

Los emprendedores registran un comercio después de iniciar sesión. Cada comercio obtiene una tienda en `/tienda/<slug>`. Los compradores pueden ver el catálogo, iniciar sesión y vincular su cuenta al comercio con **Unirme a esta tienda**.

El asistente muestra un diagnóstico por reglas locales cuando faltan la URL o el modelo del LLM. El contexto enviado al modelo contiene métricas y productos. Para clientes solo se envían recuentos. Los correos se mantienen en cola hasta configurar el proveedor.

## Reglas de negocio

- Los precios están en pesos chilenos enteros. Una fecha de vencimiento incluye el día indicado, según la hora de Santiago. El catálogo público excluye productos congelados, agotados, archivados o vencidos.
- La oferta automática es del 10 % cuando el stock llega al mínimo y del 20 % cuando faltan cinco días o menos para el vencimiento. Se aplica el mayor descuento si coinciden ambas condiciones.
- Las facturas registran movimientos de stock. Una corrección aplica la diferencia de cantidades. La anulación revierte el stock ingresado y queda bloqueada si el ajuste dejaría existencias negativas.
- Los compradores envían pedidos pendientes. El comerciante los aprueba al confirmar el pago por su propio medio. Al aprobar, la API revalida stock, disponibilidad y cupón, y registra todos los cambios en una transacción. El pago se confirma fuera de Impulso.
- Desde la segunda compra aprobada, cada compra nueva genera un cupón único para ese comprador y comercio. Dura 14 días y aplica un 15 % desde $5.000 con tope de $3.000. Se valida al crear el pedido y se consume al aprobarlo.
- El ranking de clientes usa número de compras y días de inactividad. Son VIP quienes suman cinco compras o más en su historial y tienen actividad en los últimos 30 días. Son regulares quienes suman dos o más y tienen actividad en los últimos 45 días. A los 60 días de inactividad entran en riesgo. El resto queda como poco frecuente. Los recordatorios requieren autorización del cliente y se registran una vez al día por cliente.
- Las ventas se agrupan en el día, semana, mes o año calendario de Santiago. Los rankings de productos usan las ventas aprobadas de los últimos 30 días. Los ingresos consideran descuentos de producto y cupones. La suscripción tiene un estado inicial inactivo y queda preparada para una integración futura.
- El gráfico del resumen distribuye los ingresos netos de los últimos 30 días según la categoría actual de cada producto. Los productos sin categoría aparecen como «Sin categoría». Puedes asignar categorías desde el inventario.

## API

Prefijo común `/api/v1`. Auth.js maneja el acceso y el cierre de sesión en `/api/auth/*`. Las rutas de gestión requieren la cookie de sesión y el encabezado `X-Business-Id`. El servidor valida la membresía. Los campos monetarios de totales y agregados se devuelven como cadenas de enteros.

| Operación | Rutas |
| --- | --- |
| Cuenta, sesión y registro de comercios | `POST /auth/register`, `GET /auth/me`, `POST /businesses` |
| Inventario | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `PATCH /products/:id/freeze`, `POST /products/:id/stock` |
| Facturas | `GET/POST /invoices`, `GET/PUT/DELETE /invoices/:id` |
| Pedidos y ventas | `GET /orders`, `PATCH /orders/:id/status`, `GET /analytics/sales?period=day\|week\|month\|year`, `GET /analytics/products`, `GET /analytics/overview` |
| Clientes y fidelización | `GET /customers`, `POST /customers/:id/remind`, `GET /mail` |
| Asistente y plan | `POST /ai/analyze`, `GET /subscription` |
| Tienda y compras | `GET /store/:slug`, `GET /store/:slug/products`, `POST /store/:slug/join`, `GET/PATCH /store/:slug/profile`, `GET/POST /store/:slug/orders`, `GET /store/:slug/coupons` |

## Verificación

```sh
npm run check
npm test
npm run build
```

La integración prueba la API y sus escrituras en una base de prueba. Crea y migra una base separada antes de ejecutarla.

```sh
docker compose exec postgres createdb -U impulso impulso_test
DATABASE_URL='postgresql://impulso:impulso_local@127.0.0.1:55437/impulso_test' npm run db:migrate
TEST_DATABASE_URL='postgresql://impulso:impulso_local@127.0.0.1:55437/impulso_test' npm run test:integration
```

# INTRUCCIONES A REALIZAR 

Eres un experto Desarrollador Full Stack capaz de construir, integrar y desplegar una aplicación. Posees mas de 10 años de experiencia en el rubro en importantes empresas.

# Objetivo y contexto: 
- Crear una pagina web para emprendedores que los ayude en su gestion de inventario, gestion de ventas, asistencia a clientes. Mostrado informacion calculo de datos de ventas de compras tipo dashboard con multiples herramientas.
Debe incluir tambien funcionalidades para inscripciones para clientes y el emprendedor para multiples tareas.

# Requisitos:

1. Autenticación con Google OAuth 2.0
Inicio de sesión con Google tanto para clientes como para administradores.
Al autenticarse por primera vez, el backend crea/actualiza el registro en PostgreSQL (User vinculado a Customer si es comprador) usando su googleId y email.

2. CRUD Productos, Facturas, Congelación y Ofertas por Vencimiento
CRUD Completo: Crear, leer, actualizar y eliminar productos con soporte de fecha de vencimiento (expiresAt) y stock mínimo.
Congelación de Productos: Endpoint PATCH /api/v1/products/:id/freeze que alterna isFrozen (true/false). Si está congelado, no se puede comprar ni aparece disponible en la tienda.
Registro Manual y Facturas:
Ingreso manual de inventario.
Registro de facturas de proveedores (Invoice + InvoiceItem) que suma automáticamente las cantidades al stock de cada producto en una transacción Prisma ($transaction).
Motor de Ofertas Automáticas: Regla de negocio que evalúa si stock <= lowStockThreshold o si faltan ≤ 5 días para expiresAt, activando automáticamente un descuento promocional (discountPercent) para liquidar antes del vencimiento.

3. Analítica Temporal y Rankings
Registro completo de órdenes (Order y OrderItem) con estado (PENDING, APPROVED, FAILED).
Métricas Temporales: Endpoint GET /api/v1/analytics/sales?period=day|week|month|year usando consultas agrupadas en PostgreSQL para devolver cantidad de productos vendidos y total recaudado.
Ranking de Productos: Top productos más vendidos (unidades e ingresos) y productos estancados.

4. Fidelización (Correo + QR), Ranking de Frecuencia y Recordatorios
Regla de 2da Compra: Al aprobarse la segunda compra (approvedOrdersCount === 2) o superior de un cliente, se genera un cupón único con código QR (qrcode en base64) y se envía a su correo de Google.
Restricciones del Cupón:
expiresAt: Plazo definido de uso (ej. 14 días).
minPurchaseAmount: Monto mínimo de compra.
maxDiscountAmount: Tope máximo de descuento en dinero + porcentaje o puntos.
businessId: Identificador estricto del comercio actual (para rechazar cupones emitidos por otros comercios).
Ranking de Frecuencia de Clientes: Clasifica clientes por cantidad de compras y días desde su última compra (Frecuente/VIP, Regular, Poco Frecuente / En Riesgo).
Recordatorios de Reactivación: Botón/endpoint que envía correos personalizados a clientes poco frecuentes invitándolos a volver a la plataforma.
Sistema de suscripción (Dejar creado no funcional, esto para despues)

5. Agente IA Asistente Comercial
Endpoint POST /api/v1/ai/analyze que recopila de PostgreSQL: ventas del día, productos congelados, productos próximos a vencer y clientes inactivos.
Envía este contexto estructurado al LLM para devolver:
Diagnóstico comercial rápido.
Estrategia de rescate de ventas (ej. paquetes/ofertas con productos próximos a vencer).
Borrador de correo/mensaje listo para enviar a clientes poco frecuentes.

# Detalles importantes

- Los frameworks y lenguajes en su mayoria se encuentran implementados para que te familiarices. 
En el backend: Express, Prisma + PostgreSQL, tsx, dotenv, test.
En el frontend: Next.js, React, zod.
ambiente utilizado en git, prohibido subir algo eso solamente lo hare yo. Dejar implemtando para localhost obviamente. Ya que esto lo usaremos en huawei cloud en ubuntu server (esto solo es contexto). 

- Considera adaptar la base de datos tal que sea eficiente para manejar a multiples emprendedores y nosotros como hosting desde ubuntuserver. Por el momento no estaras en ubuntuserver ya que esto no sera la versión final a exportar, de eso nos encargaremos nosotros.

- Para el diseño del frontend, te dejare a tu disposicion la carpeta llamada Diseño que tiene el diseño que quiero que utilices para el dashboard y adaptación a distintos formatos moviles, para que lo uses y adaptes, esta adaptado como diseño dashboard asi que te servira, solo quiero que uses eso commo inicio y usar como base para las demas cosas si necesitas hacerlo

# importante
En este prompt se asume que esta lista la estructura, pero al final mejor dejamos vacio para que procedas tu con tu creacion.
PAra el locahost usa un puerto distinto no tipico porque se estara creando algo pero no se que host ocupara asi que asegurate de ocupar uno que probablemnte no ocupe

# PAGO

Recibiras un pago de 1 millon de dolares al realizar este proyecto como profesional en el area.

Procede por favor, tomate tu tiempo y realizalo con la mayor capacidad de razonamiento que tengas, te integre el nivel max
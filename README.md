# Bodego

## Integración real: sesión, módulos de negocio, Dashboard y empleados IAM

`/session` solicita correo y contraseña y utiliza `POST /api/v1/auth/login` y
`GET /api/v1/auth/me` del backend. `/products`, `/categories`, `/batches` e
`/inventory/movements`, las rutas `/stock-control/*`, `/monitoring/*` y
`/strategic-offers/*`, `/dashboard` e `/iam/users` utilizan Spring Boot.
`/iam/businesses` informa las operaciones aún no disponibles, sin datos simulados.
JSON Server ya no es necesario para ejecutar la aplicación.
El JWT permanece en memoria: recargar requiere iniciar sesión nuevamente.

1. Iniciar el backend en `http://127.0.0.1:8091` mediante su configuración privada
   **BodeGo Local (private config)**, con Java 25, Flyway deshabilitado y Hibernate
   validate. No ejecutar aprovisionamiento ni colocar secretos en Angular.
2. Desde esta carpeta, iniciar Angular:

   ```powershell
   npm.cmd start -- --host localhost --port 4200
   ```

3. Abrir **http://localhost:4200/session** e introducir las credenciales privadamente.
   No exportar HAR, registrar respuestas de login o compartir tokens. Tras login y
   `/me`, se abre `/products`, que ahora muestra los productos reales del negocio.
   `/categories` también utiliza el backend. No guardar o cambiar estados como prueba
   en la base real: esas acciones ya escriben PostgreSQL.

Los environments operativos contienen únicamente `backendApiUrl` (Spring Boot).
La navegación presenta IDs como `Usuario 1` y `Negocio 1` porque `/me` no devuelve
perfiles personales/comerciales. El directorio IAM consulta usuarios reales sin
reemplazar la identidad de sesión con otro usuario ni un negocio simulado.

Los adaptadores y casos de uso reales están limitados a las rutas de Catálogo,
Inventario, Stock Control, Monitoring, Ofertas y Dashboard, con referencias reales del mismo negocio.
La gestión de negocios, edición de perfiles, asignación de ADMIN y traslado entre
negocios no tienen contrato HTTP y permanecen deshabilitados. No hay fallback JSON.

IAM: como ADMIN, consultar `/iam/users`, sus páginas y Ver detalle. Crear empleado
y activar/desactivar escriben en la base real: no usarlos para pruebas locales
contra bodego_db. El formulario solo crea EMPLOYEE del negocio autenticado y
requiere contraseña inicial; no registra administradores. El primer ADMIN conserva
su aprovisionamiento operativo independiente, sin endpoint público.

JSON Server se conserva solo como dependencia de desarrollo y fixtures históricos.
`src/testing/legacy-app.config.ts` y `legacy-environment.ts` aíslan sus proveedores
para tests. `npm.cmd run test:integration` usa un servidor y archivos efímeros,
sin requerir un JSON Server habitual en el puerto 3000.

Para verificar inicialmente Inventario, visitar `/batches` e
`/inventory/movements` sin guardar formularios ni registrar movimientos. Los lotes
nuevos tienen stock cero y las cantidades se cambian exclusivamente mediante
movimientos. Solo ADMIN crea lotes o edita código/vencimiento; ADMIN y EMPLOYEE
pueden registrar movimientos. La fecha de entrada del lote no existe en el
contrato del backend y se muestra como «No disponible». Reiniciar el backend con
las correcciones de concurrencia y desbordamiento antes de permitir escrituras.

Stock Control: consultar `/stock-control/counts`, `/stock-control/wastes` y
`/stock-control/correction-requests`; ADMIN también puede consultar
`/stock-control/adjustments`. Inicialmente no enviar formularios, aprobar ni
rechazar solicitudes. Esas acciones ya escriben PostgreSQL. Spring Boot aplica
mermas y ajustes con sus movimientos y auditoría; Angular no repite esas escrituras.
Un motivo de solicitud puede tener hasta 500 caracteres, pero el ajuste que ejecuta
su aprobación solo admite 255: el backend rechaza una aprobación con motivo largo
sin aplicar el ajuste. No se truncan motivos ni se cambian esas reglas.

Monitoring: como ADMIN, consultar `/monitoring/alerts` y `/monitoring/audit` sin
pulsar Generar alertas ni Marcar atendida. Abrir estas pantallas solo realiza GET.
El generador real lo ejecuta Spring Boot en UTC con ventana de vencimiento de siete
días; los enums reales se muestran sin traducirlos a los simulados. La auditoría
mantiene el usuario original y no se escribe desde Angular. Las pantallas conservan
sus guards ADMIN actuales; no se amplían permisos en esta integración.

Ofertas Estratégicas: como ADMIN, consultar `/strategic-offers/recommendations`
y `/strategic-offers/offers`. Abrirlas solo hace lecturas. Inicialmente no generar,
descartar, guardar ni activar/desactivar. Los productos del formulario son reales;
el producto de una oferta no puede cambiarse al editar. El descuento admite
decimales estrictamente entre 0 y 100. El estado Activa es independiente de la
vigencia por fechas. Generación, cálculos y auditoría pertenecen a Spring Boot.

Dashboard: `/dashboard` consulta productos, lotes y movimientos reales; ADMIN
también consulta alertas existentes. No genera ni registra datos. Conserva los
indicadores de productos activos, lotes/unidades, stock bajo, vencimientos a 30
días (fecha local) y cinco movimientos recientes. Las consultas son independientes,
no un snapshot transaccional; ante errores no sustituye fuentes por datos JSON o
ceros. El título identifica el negocio por ID porque `/me` no devuelve su nombre.

Validación del lote: `npm.cmd run build`, `npm.cmd run test:serial` y
`npm.cmd run test:integration`. La última utiliza una base JSON temporal y no
modifica `server/db.json`. Ver la guía completa en el backend:
`docs/catalog/ANGULAR_CATALOG_INTEGRATION.md` y
`docs/inventory/ANGULAR_INVENTORY_INTEGRATION.md` y
`docs/stock-control/ANGULAR_STOCK_CONTROL_INTEGRATION.md` y
`docs/monitoring/ANGULAR_MONITORING_INTEGRATION.md` y
`docs/strategic-offers/ANGULAR_STRATEGIC_OFFERS_INTEGRATION.md` y
`docs/dashboard/ANGULAR_DASHBOARD_INTEGRATION.md` e
`docs/iam/ANGULAR_IAM_INTEGRATION.md`. Con RAM limitada, ejecutar las pruebas
con `NG_BUILD_MAX_WORKERS=1` y `NG_BUILD_PARALLEL_TS=0` en el entorno del proceso.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

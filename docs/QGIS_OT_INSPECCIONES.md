# RN174 — OT / Inspecciones georreferenciadas en QGIS

## Fuente única
La capa operativa se almacena en PostgreSQL/PostGIS de Supabase:

- Esquema: `operacion`
- Tabla: `ot_inspecciones`
- Geometría: `POINT`, EPSG:4326
- Borrado: lógico (`eliminado_en`), no físico

La web y QGIS deben leer/escribir **la misma tabla**. No hay exportación periódica ni dos bases para reconciliar.

## Conexión desde QGIS
1. QGIS → Administrador de fuentes de datos → PostgreSQL → Nueva conexión.
2. Usar el host, puerto, base, usuario y SSL entregados por Supabase en **Project Settings → Database**.
3. No guardar ninguna contraseña en este repositorio.
4. Conectar y cargar `operacion.ot_inspecciones`.
5. Fijar el CRS de la capa en EPSG:4326. Para trabajo cartográfico local, QGIS puede reproyectarla al CRS del proyecto.

## Edición
Con una credencial PostgreSQL con permisos de edición, QGIS puede:

- crear puntos;
- modificar geometría y atributos;
- cambiar estado/prioridad/responsable;
- marcar una OT como eliminada lógicamente completando `eliminado_en`.

La aplicación web usa RPC autenticadas y no expone credenciales PostgreSQL.

## Campos principales
- `ot_id`: UUID estable.
- `codigo`: identificador visible RN174-OT-....
- `asset_id` / `asset_codigo`: activo vial relacionado.
- `tipo`: INSPECCION / VERIFICACION / CONSERVACION / REPARACION / OTRA.
- `prioridad`: BAJA / MEDIA / ALTA / URGENTE.
- `tarea`: descripción.
- `responsable` y `vencimiento`.
- `estado`: ABIERTA / EN_PROCESO / CERRADA / CANCELADA.
- `progresiva_m`: referencia lineal opcional.
- `geom`: ubicación puntual.
- `origen`: WEB o QGIS.
- `creado_en`, `actualizado_en`, `eliminado_en`.

## Regla de integridad
No borrar físicamente filas. La trazabilidad se conserva en `operacion.ot_inspecciones_auditoria`.

# RN 174 · Inventario vial piloto

Visor web público de demostración para consultar activos viales de la RN 174
capturados en QGIS y publicados desde Supabase/PostGIS.

## Alcance actual

- Consulta cartográfica de puntos, líneas y superficies.
- Búsqueda, filtros y ficha técnica de cada activo.
- Publicación limitada al lote ficticio `PILOTO_WEB_001`.
- Datos de demostración: no utilizar para decisiones operativas.
- Progresivas pendientes hasta incorporar un eje RN 174 calibrado y versionado.

La aplicación es de solo lectura. La clave incluida es la clave pública de
Supabase; no se utiliza ni se publica la clave secreta o `service_role`.

/*
  RN174 - Migración 012
  PUBLICACIÓN ABIERTA TEMPORAL PARA VISOR WEB V3.2

  Objetivo temporal solicitado:
  - Publicar TODOS los activos operativos RN174 expuestos por las vistas V3.2,
    sin exigir estado_validacion = 'APROBADO'.
  - Conservar el estado de validación real de cada activo.
  - Marcar como preliminar todo registro cuyo estado sea distinto de APROBADO.
  - Mantener fuera solamente los activos ARCHIVADOS, porque las vistas operativas
    edicion.activos_* ya los excluyen por diseño.

  IMPORTANTE:
  Esta migración cambia únicamente la POLÍTICA DE EXPOSICIÓN WEB.
  No aprueba, valida, modifica ni elimina ningún activo.
*/

begin;

create or replace function public.rn174_activos_v32_geojson(
  p_tipo_codigo text default null,
  p_progresiva_desde_m numeric default null,
  p_progresiva_hasta_m numeric default null
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,edicion,extensions
as $$
with activos as (
  select 'PUNTO'::text as clase_geometria,v.asset_id,v.codigo_visible,v.nombre,
         v.tipo_codigo,v.tipo_nombre,v.familia,v.ruta_codigo,v.estado_existencia,
         v.estado_ciclo_vida,v.estado_validacion,v.calidad_dato,v.precision_m,
         v.metodo_posicion,v.observaciones,v.actualizado_en,v.lote_codigo,
         v.progresiva_inicio_m,v.progresiva_fin_m,v.desplazamiento_m,v.lado,
         v.atributos_adicionales,v.geom::extensions.geometry as geom
  from edicion.consulta_activos_punto_v32 v
  where v.ruta_codigo='RN174'

  union all

  select 'LINEA',v.asset_id,v.codigo_visible,v.nombre,v.tipo_codigo,v.tipo_nombre,
         v.familia,v.ruta_codigo,v.estado_existencia,v.estado_ciclo_vida,
         v.estado_validacion,v.calidad_dato,v.precision_m,v.metodo_posicion,
         v.observaciones,v.actualizado_en,v.lote_codigo,v.progresiva_inicio_m,
         v.progresiva_fin_m,v.desplazamiento_m,v.lado,v.atributos_adicionales,
         v.geom::extensions.geometry
  from edicion.consulta_activos_linea_v32 v
  where v.ruta_codigo='RN174'

  union all

  select 'POLIGONO',v.asset_id,v.codigo_visible,v.nombre,v.tipo_codigo,v.tipo_nombre,
         v.familia,v.ruta_codigo,v.estado_existencia,v.estado_ciclo_vida,
         v.estado_validacion,v.calidad_dato,v.precision_m,v.metodo_posicion,
         v.observaciones,v.actualizado_en,v.lote_codigo,v.progresiva_inicio_m,
         v.progresiva_fin_m,v.desplazamiento_m,v.lado,v.atributos_adicionales,
         v.geom::extensions.geometry
  from edicion.consulta_activos_poligono_v32 v
  where v.ruta_codigo='RN174'
), publicados as (
  select *
  from activos a
  where (p_tipo_codigo is null or a.tipo_codigo=p_tipo_codigo)
    and (
      p_progresiva_desde_m is null
      or coalesce(a.progresiva_fin_m,a.progresiva_inicio_m)>=p_progresiva_desde_m
    )
    and (
      p_progresiva_hasta_m is null
      or a.progresiva_inicio_m<=p_progresiva_hasta_m
    )
), features as (
  select jsonb_build_object(
    'type','Feature',
    'id',asset_id::text,
    'geometry',extensions.st_asgeojson(extensions.st_transform(geom,4326),7)::jsonb,
    'properties',jsonb_strip_nulls(jsonb_build_object(
      'codigo',codigo_visible,
      'nombre',nombre,
      'tipo_codigo',tipo_codigo,
      'tipo',tipo_nombre,
      'tipo_activo',tipo_nombre,
      'familia',familia,
      'ruta',ruta_codigo,
      'geometria',clase_geometria,
      'origen_existencia',estado_existencia,
      'estado_ciclo_vida',estado_ciclo_vida,
      'estado_validacion',estado_validacion,
      'calidad_dato',calidad_dato,
      'precision_m',precision_m,
      'metodo_posicion',metodo_posicion,
      'observaciones',observaciones,
      'actualizado_en',actualizado_en,
      'lote_origen',lote_codigo,
      'progresiva_m',progresiva_inicio_m,
      'progresiva',case
        when progresiva_inicio_m is null then null
        else floor(progresiva_inicio_m/1000)::text || '+' ||
             lpad(floor(mod(progresiva_inicio_m,1000))::int::text,3,'0')
      end,
      'progresiva_inicio_m',progresiva_inicio_m,
      'progresiva_fin_m',progresiva_fin_m,
      'desplazamiento_m',desplazamiento_m,
      'lado',lado,
      'atributos',atributos_adicionales,
      'es_preliminar',(estado_validacion<>'APROBADO')
    ))) as feature
  from publicados
  where geom is not null
)
select jsonb_build_object(
  'type','FeatureCollection',
  'features',coalesce(
    jsonb_agg(feature order by feature->'properties'->>'nombre'),
    '[]'::jsonb
  ),
  'metadata',jsonb_build_object(
    'dataset','RN174_V3_2_PUBLICACION_ABIERTA_TEMPORAL',
    'ruta','RN174',
    'politica','PUBLICACION ABIERTA TEMPORAL - todos los activos operativos visibles sin exigir APROBADO',
    'estado_publicacion','PRELIMINAR_NO_VALIDADO',
    'advertencia','DATOS PRELIMINARES: la visibilidad web no implica validacion tecnica. Se publican BORRADOR, EN_REVISION, APROBADO y RECHAZADO; verificar fuente, precision, estado y vigencia antes de utilizar.'
  )
)
from features;
$$;

revoke all on function public.rn174_activos_v32_geojson(text,numeric,numeric) from public;
grant execute on function public.rn174_activos_v32_geojson(text,numeric,numeric) to anon,authenticated;

notify pgrst,'reload schema';
commit;

/*
  CONTROL POST-EJECUCIÓN.
  Con la carga V3.2 actual se espera aproximadamente:
    PUNTO    = 969
    LINEA    = 827
    POLIGONO = 134
    TOTAL    = 1930

  El control calcula el valor real; no fuerza esos números.
*/
with salida as (
  select public.rn174_activos_v32_geojson(null,null,null) as geojson
), elementos as (
  select feature
  from salida
  cross join lateral jsonb_array_elements(geojson->'features') as feature
)
select
  count(*) as total_visible,
  count(*) filter (where feature->'properties'->>'geometria'='PUNTO') as puntos,
  count(*) filter (where feature->'properties'->>'geometria'='LINEA') as lineas,
  count(*) filter (where feature->'properties'->>'geometria'='POLIGONO') as poligonos,
  count(*) filter (where feature->'properties'->>'estado_validacion'='BORRADOR') as borradores,
  count(*) filter (where feature->'properties'->>'estado_validacion'='EN_REVISION') as en_revision,
  count(*) filter (where feature->'properties'->>'estado_validacion'='APROBADO') as aprobados,
  count(*) filter (where feature->'properties'->>'estado_validacion'='RECHAZADO') as rechazados
from elementos;

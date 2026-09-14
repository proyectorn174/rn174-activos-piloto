/*
  RN174 - Migración 013
  OT / INSPECCIONES GEOREFERENCIADAS

  Objetivo:
  - Convertir órdenes de trabajo e inspecciones en objetos GIS persistentes.
  - Una única fuente de verdad en Supabase/PostGIS para WEB y QGIS.
  - Geometría POINT EPSG:4326.
  - Borrado lógico + auditoría; no se destruyen antecedentes.
  - Lectura pública de registros activos.
  - Alta/modificación/baja lógica sólo para usuarios Supabase autenticados.

  IMPORTANTE:
  No guardar contraseñas PostgreSQL/QGIS ni service_role en este repositorio.
*/

begin;

create schema if not exists operacion;

grant usage on schema operacion to anon, authenticated;

create table if not exists operacion.ot_inspecciones (
  ot_id uuid primary key default gen_random_uuid(),
  codigo text not null default ('RN174-OT-' || upper(substr(gen_random_uuid()::text,1,8))),
  ruta_codigo text not null default 'RN174',
  asset_id text,
  asset_codigo text,
  tipo text not null default 'INSPECCION'
    check (tipo in ('INSPECCION','VERIFICACION','CONSERVACION','REPARACION','OTRA')),
  prioridad text not null default 'MEDIA'
    check (prioridad in ('BAJA','MEDIA','ALTA','URGENTE')),
  tarea text not null,
  responsable text,
  vencimiento date,
  estado text not null default 'ABIERTA'
    check (estado in ('ABIERTA','EN_PROCESO','CERRADA','CANCELADA')),
  progresiva_m numeric,
  geom extensions.geometry(Point,4326) not null,
  origen text not null default 'WEB',
  observaciones text,
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  eliminado_en timestamptz,
  eliminado_por uuid
);

create index if not exists ot_inspecciones_geom_gix
  on operacion.ot_inspecciones using gist (geom);
create index if not exists ot_inspecciones_asset_idx
  on operacion.ot_inspecciones(asset_id);
create index if not exists ot_inspecciones_estado_idx
  on operacion.ot_inspecciones(estado) where eliminado_en is null;
create index if not exists ot_inspecciones_pk_idx
  on operacion.ot_inspecciones(progresiva_m) where eliminado_en is null;

create table if not exists operacion.ot_inspecciones_auditoria (
  audit_id bigint generated always as identity primary key,
  ot_id uuid,
  accion text not null,
  ocurrido_en timestamptz not null default now(),
  usuario uuid default auth.uid(),
  anterior jsonb,
  nuevo jsonb
);

create or replace function operacion.tg_ot_actualizado()
returns trigger
language plpgsql
set search_path=pg_catalog,public,operacion,auth
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_ot_actualizado on operacion.ot_inspecciones;
create trigger trg_ot_actualizado
before update on operacion.ot_inspecciones
for each row execute function operacion.tg_ot_actualizado();

create or replace function operacion.tg_ot_auditoria()
returns trigger
language plpgsql
set search_path=pg_catalog,public,operacion,auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into operacion.ot_inspecciones_auditoria(ot_id,accion,nuevo)
    values (new.ot_id,'INSERT',to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into operacion.ot_inspecciones_auditoria(ot_id,accion,anterior,nuevo)
    values (new.ot_id,
            case when old.eliminado_en is null and new.eliminado_en is not null then 'SOFT_DELETE'
                 when old.eliminado_en is not null and new.eliminado_en is null then 'RESTORE'
                 else 'UPDATE' end,
            to_jsonb(old),to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into operacion.ot_inspecciones_auditoria(ot_id,accion,anterior)
    values (old.ot_id,'HARD_DELETE',to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ot_auditoria on operacion.ot_inspecciones;
create trigger trg_ot_auditoria
after insert or update or delete on operacion.ot_inspecciones
for each row execute function operacion.tg_ot_auditoria();

alter table operacion.ot_inspecciones enable row level security;
alter table operacion.ot_inspecciones_auditoria enable row level security;

drop policy if exists ot_select_activos on operacion.ot_inspecciones;
create policy ot_select_activos
on operacion.ot_inspecciones for select
to anon, authenticated
using (eliminado_en is null);

drop policy if exists ot_insert_auth on operacion.ot_inspecciones;
create policy ot_insert_auth
on operacion.ot_inspecciones for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists ot_update_auth on operacion.ot_inspecciones;
create policy ot_update_auth
on operacion.ot_inspecciones for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- No DELETE policy: la aplicación usa borrado lógico.

drop policy if exists ot_audit_select_auth on operacion.ot_inspecciones_auditoria;
create policy ot_audit_select_auth
on operacion.ot_inspecciones_auditoria for select
to authenticated
using (auth.uid() is not null);

grant select on operacion.ot_inspecciones to anon, authenticated;
grant insert, update on operacion.ot_inspecciones to authenticated;
grant select on operacion.ot_inspecciones_auditoria to authenticated;

create or replace function public.rn174_ot_inspecciones_geojson()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,operacion,extensions
as $$
  select jsonb_build_object(
    'type','FeatureCollection',
    'features',coalesce(jsonb_agg(
      jsonb_build_object(
        'type','Feature',
        'id',ot_id::text,
        'geometry',extensions.st_asgeojson(geom,7)::jsonb,
        'properties',jsonb_strip_nulls(jsonb_build_object(
          'codigo',codigo,
          'ruta',ruta_codigo,
          'asset_id',asset_id,
          'asset_codigo',asset_codigo,
          'tipo',tipo,
          'prioridad',prioridad,
          'tarea',tarea,
          'responsable',responsable,
          'vencimiento',vencimiento,
          'estado',estado,
          'progresiva_m',progresiva_m,
          'origen',origen,
          'observaciones',observaciones,
          'creado_en',creado_en,
          'actualizado_en',actualizado_en
        ))
      ) order by creado_en desc
    ),'[]'::jsonb)
  )
  from operacion.ot_inspecciones
  where eliminado_en is null;
$$;

revoke all on function public.rn174_ot_inspecciones_geojson() from public;
grant execute on function public.rn174_ot_inspecciones_geojson() to anon, authenticated;

create or replace function public.rn174_ot_crear(
  p_asset_id text,
  p_asset_codigo text,
  p_tipo text,
  p_prioridad text,
  p_tarea text,
  p_responsable text,
  p_vencimiento date,
  p_progresiva_m numeric,
  p_lon numeric,
  p_lat numeric,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,operacion,extensions,auth
as $$
declare r operacion.ot_inspecciones;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_tarea is null or btrim(p_tarea) = '' then
    raise exception 'TAREA_REQUIRED';
  end if;
  if p_lon not between -180 and 180 or p_lat not between -90 and 90 then
    raise exception 'INVALID_COORDINATES';
  end if;

  insert into operacion.ot_inspecciones(
    asset_id,asset_codigo,tipo,prioridad,tarea,responsable,vencimiento,
    progresiva_m,geom,origen,observaciones,creado_por,actualizado_por
  ) values (
    p_asset_id,p_asset_codigo,coalesce(p_tipo,'INSPECCION'),coalesce(p_prioridad,'MEDIA'),
    p_tarea,p_responsable,p_vencimiento,p_progresiva_m,
    extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326),
    'WEB',p_observaciones,auth.uid(),auth.uid()
  ) returning * into r;

  return jsonb_build_object('ot_id',r.ot_id,'codigo',r.codigo,'estado',r.estado);
end;
$$;

create or replace function public.rn174_ot_actualizar(
  p_ot_id uuid,
  p_tipo text default null,
  p_prioridad text default null,
  p_tarea text default null,
  p_responsable text default null,
  p_vencimiento date default null,
  p_estado text default null,
  p_progresiva_m numeric default null,
  p_lon numeric default null,
  p_lat numeric default null,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,operacion,extensions,auth
as $$
declare r operacion.ot_inspecciones;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  update operacion.ot_inspecciones
  set tipo=coalesce(p_tipo,tipo),
      prioridad=coalesce(p_prioridad,prioridad),
      tarea=coalesce(nullif(btrim(p_tarea),''),tarea),
      responsable=coalesce(p_responsable,responsable),
      vencimiento=coalesce(p_vencimiento,vencimiento),
      estado=coalesce(p_estado,estado),
      progresiva_m=coalesce(p_progresiva_m,progresiva_m),
      geom=case when p_lon is not null and p_lat is not null
                then extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326)
                else geom end,
      observaciones=coalesce(p_observaciones,observaciones)
  where ot_id=p_ot_id and eliminado_en is null
  returning * into r;

  if r.ot_id is null then raise exception 'OT_NOT_FOUND'; end if;
  return jsonb_build_object('ot_id',r.ot_id,'codigo',r.codigo,'estado',r.estado);
end;
$$;

create or replace function public.rn174_ot_eliminar(p_ot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,operacion,auth
as $$
declare r operacion.ot_inspecciones;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  update operacion.ot_inspecciones
  set eliminado_en=now(),eliminado_por=auth.uid()
  where ot_id=p_ot_id and eliminado_en is null
  returning * into r;

  if r.ot_id is null then raise exception 'OT_NOT_FOUND'; end if;
  return jsonb_build_object('ot_id',r.ot_id,'codigo',r.codigo,'eliminado',true);
end;
$$;

create or replace function public.rn174_ot_restaurar(p_ot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,operacion,auth
as $$
declare r operacion.ot_inspecciones;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  update operacion.ot_inspecciones
  set eliminado_en=null,eliminado_por=null
  where ot_id=p_ot_id and eliminado_en is not null
  returning * into r;

  if r.ot_id is null then raise exception 'OT_NOT_FOUND'; end if;
  return jsonb_build_object('ot_id',r.ot_id,'codigo',r.codigo,'restaurado',true);
end;
$$;

revoke all on function public.rn174_ot_crear(text,text,text,text,text,text,date,numeric,numeric,numeric,text) from public;
revoke all on function public.rn174_ot_actualizar(uuid,text,text,text,text,date,text,numeric,numeric,numeric,text) from public;
revoke all on function public.rn174_ot_eliminar(uuid) from public;
revoke all on function public.rn174_ot_restaurar(uuid) from public;

grant execute on function public.rn174_ot_crear(text,text,text,text,text,text,date,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.rn174_ot_actualizar(uuid,text,text,text,text,date,text,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.rn174_ot_eliminar(uuid) to authenticated;
grant execute on function public.rn174_ot_restaurar(uuid) to authenticated;

comment on table operacion.ot_inspecciones is
'RN174 - órdenes de trabajo e inspecciones georreferenciadas. Fuente única WEB/QGIS; borrado lógico.';
comment on column operacion.ot_inspecciones.geom is
'Punto de ubicación operativa EPSG:4326. Editable desde QGIS con credencial PostgreSQL autorizada.';

notify pgrst,'reload schema';
commit;

-- CONTROL POST-MIGRACIÓN
select
  count(*) filter (where eliminado_en is null) as activos,
  count(*) filter (where eliminado_en is not null) as eliminados_logicos
from operacion.ot_inspecciones;

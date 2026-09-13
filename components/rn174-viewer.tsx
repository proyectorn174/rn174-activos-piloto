"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  Clock3,
  Database,
  Filter,
  Layers3,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from "leaflet";

type GeometryClass = "PUNTO" | "LINEA" | "POLIGONO";

type AssetProperties = {
  codigo?: string;
  nombre?: string;
  tipo_codigo?: string;
  tipo?: string;
  familia?: string;
  ruta?: string;
  geometria?: GeometryClass;
  origen_existencia?: string;
  estado_ciclo_vida?: string;
  estado_validacion?: string;
  calidad_dato?: string;
  precision_m?: number;
  metodo_posicion?: string;
  observaciones?: string;
  actualizado_en?: string;
  es_demo?: boolean;
};

type AssetFeature = {
  type: "Feature";
  id?: string;
  geometry: { type: string; coordinates: unknown };
  properties: AssetProperties;
};

type AssetCollection = {
  type: "FeatureCollection";
  features: AssetFeature[];
  metadata?: {
    dataset?: string;
    ruta?: string;
    es_demo?: boolean;
    advertencia?: string;
    progresiva?: string;
  };
};

type FilterValue = "TODOS" | GeometryClass;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "PUNTO", label: "Puntos" },
  { value: "LINEA", label: "Líneas" },
  { value: "POLIGONO", label: "Superficies" },
];

const GEOMETRY_LABELS: Record<GeometryClass, string> = {
  PUNTO: "Punto",
  LINEA: "Línea",
  POLIGONO: "Superficie",
};

const GEOMETRY_COLORS: Record<GeometryClass, string> = {
  PUNTO: "#f36b21",
  LINEA: "#1677b8",
  POLIGONO: "#178a72",
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";

const normalize = (value?: string) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const displayValue = (value: string | number | undefined, fallback = "Sin informar") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

function geometryClass(feature: AssetFeature): GeometryClass {
  const declared = feature.properties.geometria;
  if (declared && declared in GEOMETRY_LABELS) return declared;
  if (feature.geometry.type.includes("Point")) return "PUNTO";
  if (feature.geometry.type.includes("Line")) return "LINEA";
  return "POLIGONO";
}

function AssetMark({ geometry }: { geometry: GeometryClass }) {
  if (geometry === "PUNTO") return <CircleDot aria-hidden="true" />;
  if (geometry === "LINEA") return <Route aria-hidden="true" />;
  return <Layers3 aria-hidden="true" />;
}

export function Rn174Viewer() {
  const [collection, setCollection] = useState<AssetCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("TODOS");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Falta configurar la clave pública del proyecto.");
      }
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_demo_geojson`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const payload = (await response.json()) as AssetCollection & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar Supabase.");
      if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
        throw new Error("La respuesta publicada no tiene el formato GeoJSON esperado.");
      }
      setCollection(payload);
      setLoadedAt(new Date());
      setSelectedId((current) =>
        current && payload.features.some((feature) => feature.id === current)
          ? current
          : payload.features[0]?.id ?? null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo consultar Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAssets(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadAssets]);

  const visibleFeatures = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return (collection?.features ?? []).filter((feature) => {
      const geometry = geometryClass(feature);
      if (filter !== "TODOS" && geometry !== filter) return false;
      const properties = feature.properties;
      const haystack = normalize(
        [properties.nombre, properties.codigo, properties.tipo, properties.tipo_codigo, properties.familia, properties.ruta, properties.estado_validacion].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [collection, filter, query]);

  const selectedFeature = useMemo(
    () => collection?.features.find((feature) => feature.id === selectedId) ?? null,
    [collection, selectedId],
  );

  useEffect(() => {
    let active = true;
    async function createMap() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!active || !mapNodeRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapNodeRef.current, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 4,
      }).setView([-32.78, -60.25], 9);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
    }
    void createMap();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !collection) return;
    layerRef.current?.remove();
    const layer = L.geoJSON(
      { type: "FeatureCollection", features: visibleFeatures } as never,
      {
        pointToLayer: (feature, latlng) => {
          const geometry = (feature.properties?.geometria ?? "PUNTO") as GeometryClass;
          const selected = String(feature.id ?? "") === selectedId;
          return L.circleMarker(latlng, {
            radius: selected ? 10 : 8,
            color: "#ffffff",
            weight: selected ? 4 : 3,
            fillColor: GEOMETRY_COLORS[geometry] ?? GEOMETRY_COLORS.PUNTO,
            fillOpacity: 1,
          });
        },
        style: (feature) => {
          const geometry = (feature?.properties?.geometria ?? "POLIGONO") as GeometryClass;
          const selected = String(feature?.id ?? "") === selectedId;
          const color = GEOMETRY_COLORS[geometry] ?? GEOMETRY_COLORS.POLIGONO;
          return {
            color,
            fillColor: color,
            fillOpacity: geometry === "POLIGONO" ? (selected ? 0.42 : 0.25) : 0,
            weight: selected ? 7 : geometry === "LINEA" ? 5 : 3,
            opacity: 0.95,
          };
        },
        onEachFeature: (feature, leafletLayer) => {
          leafletLayer.on("click", () => setSelectedId(String(feature.id ?? "")));
          const label = feature.properties?.nombre ?? "Activo vial";
          leafletLayer.bindTooltip(label, { sticky: true, direction: "top", opacity: 0.96 });
        },
      },
    ).addTo(map);
    layerRef.current = layer;
    if (layer.getLayers().length > 0) {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.16), { maxZoom: 17, animate: false });
    }
  }, [collection, selectedId, visibleFeatures]);

  const focusFeature = useCallback((feature: AssetFeature) => {
    setSelectedId(feature.id ?? null);
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    const focusLayer = L.geoJSON(feature as never);
    const bounds = focusLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.55), { maxZoom: 18 });
  }, []);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.16), { maxZoom: 17 });
  }, []);

  const counts = useMemo(() => {
    const base = { PUNTO: 0, LINEA: 0, POLIGONO: 0 };
    for (const feature of collection?.features ?? []) base[geometryClass(feature)] += 1;
    return base;
  }, [collection]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="route-shield" aria-hidden="true"><span>RN</span><strong>174</strong></div>
          <div><p className="eyebrow">Inventario vial · piloto</p><h1>Visor de activos</h1></div>
        </div>
        <div className="topbar-status">
          <span className="live-dot" aria-hidden="true" />
          <span>Consulta en vivo desde Supabase</span>
          <button className="icon-button" type="button" onClick={() => void loadAssets()} aria-label="Actualizar datos" title="Actualizar datos">
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Inventario publicado">
          <div className="demo-banner">
            <AlertTriangle aria-hidden="true" />
            <div><strong>Datos ficticios de demostración</strong><span>No utilizar para decisiones operativas.</span></div>
          </div>

          <div className="sidebar-heading">
            <div><p className="section-kicker">Ruta {collection?.metadata?.ruta ?? "RN174"}</p><h2>Activos publicados</h2></div>
            <span className="total-badge">{collection?.features.length ?? "—"}</span>
          </div>

          <div className="metrics" aria-label="Resumen por geometría">
            <div><CircleDot aria-hidden="true" /><strong>{counts.PUNTO}</strong><span>Punto</span></div>
            <div><Route aria-hidden="true" /><strong>{counts.LINEA}</strong><span>Línea</span></div>
            <div><Layers3 aria-hidden="true" /><strong>{counts.POLIGONO}</strong><span>Superficie</span></div>
          </div>

          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar activo</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, tipo o código" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda"><X aria-hidden="true" /></button>}
          </label>

          <div className="filter-row" aria-label="Filtrar por geometría">
            <Filter aria-hidden="true" />
            {FILTERS.map((item) => (
              <button type="button" key={item.value} className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)}>{item.label}</button>
            ))}
          </div>

          <div className="asset-list" aria-live="polite">
            {loading && !collection && <div className="loading-state"><span className="loading-ring" /><p>Consultando Supabase…</p></div>}
            {error && (
              <div className="error-state">
                <Database aria-hidden="true" /><h3>No pudimos cargar los activos</h3><p>{error}</p>
                <button type="button" onClick={() => void loadAssets()}><RefreshCw aria-hidden="true" /> Reintentar</button>
              </div>
            )}
            {!loading && !error && visibleFeatures.length === 0 && <div className="empty-state"><Search aria-hidden="true" /><p>No hay activos que coincidan con el filtro.</p></div>}
            {visibleFeatures.map((feature) => {
              const properties = feature.properties;
              const geometry = geometryClass(feature);
              const selected = feature.id === selectedId;
              return (
                <button type="button" key={feature.id ?? `${properties.nombre}-${geometry}`} className={`asset-card ${selected ? "selected" : ""}`} onClick={() => focusFeature(feature)}>
                  <span className="asset-mark" style={{ "--asset-color": GEOMETRY_COLORS[geometry] } as React.CSSProperties}><AssetMark geometry={geometry} /></span>
                  <span className="asset-copy">
                    <span className="asset-title">{displayValue(properties.nombre, "Activo sin nombre")}</span>
                    <span className="asset-meta">{displayValue(properties.tipo)} · {GEOMETRY_LABELS[geometry]}</span>
                    <span className="asset-route"><MapPinned aria-hidden="true" /> {displayValue(properties.ruta, "RN174")} · Progresiva pendiente</span>
                  </span>
                  <span className="state-pill">{displayValue(properties.estado_validacion, "Sin estado")}</span>
                </button>
              );
            })}
          </div>

          <div className="sync-note">
            <Clock3 aria-hidden="true" />
            <span>{loadedAt ? `Actualizado ${loadedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Esperando datos"}</span>
            <span className="sync-source">PILOTO_WEB_001</span>
          </div>
        </aside>

        <section className="map-panel" aria-label="Mapa de activos RN 174">
          <div ref={mapNodeRef} className="map-canvas" />
          <div className="map-topline">
            <div><ShieldCheck aria-hidden="true" /><span>Solo consulta</span></div>
            <button type="button" onClick={fitAll}><LocateFixed aria-hidden="true" /> Ver todos</button>
          </div>
          <div className="map-legend" aria-label="Leyenda del mapa">
            {(Object.keys(GEOMETRY_LABELS) as GeometryClass[]).map((geometry) => <span key={geometry}><i style={{ backgroundColor: GEOMETRY_COLORS[geometry] }} />{GEOMETRY_LABELS[geometry]}</span>)}
          </div>

          {selectedFeature && (
            <article className="detail-card">
              <div className="detail-accent" style={{ background: GEOMETRY_COLORS[geometryClass(selectedFeature)] }} />
              <div className="detail-header">
                <div><span className="detail-type">{GEOMETRY_LABELS[geometryClass(selectedFeature)]} · {displayValue(selectedFeature.properties.tipo_codigo)}</span><h2>{displayValue(selectedFeature.properties.nombre, "Activo sin nombre")}</h2></div>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar detalle"><X aria-hidden="true" /></button>
              </div>
              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo, "Pendiente")}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Ciclo de vida</span><strong>{displayValue(selectedFeature.properties.estado_ciclo_vida)}</strong></div>
                <div><span>Calidad del dato</span><strong>{displayValue(selectedFeature.properties.calidad_dato)}</strong></div>
                <div><span>Precisión</span><strong>{selectedFeature.properties.precision_m !== undefined ? `${selectedFeature.properties.precision_m} m` : "Sin informar"}</strong></div>
                <div><span>Posicionamiento</span><strong>{displayValue(selectedFeature.properties.metodo_posicion)}</strong></div>
              </div>
              <div className="chainage-warning">
                <MapPinned aria-hidden="true" /><div><span>Progresiva</span><strong>Pendiente de cálculo</strong><small>Requiere un eje RN 174 calibrado y versionado.</small></div>
              </div>
              {selectedFeature.properties.observaciones && <p className="detail-observation"><span>Observaciones</span>{selectedFeature.properties.observaciones}</p>}
            </article>
          )}

          <a className="osm-link" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">Abrir mapa base <ArrowUpRight aria-hidden="true" /></a>
        </section>
      </section>
    </main>
  );
}

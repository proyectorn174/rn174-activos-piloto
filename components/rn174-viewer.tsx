"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  Clock3,
  Crosshair,
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
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, TileLayer } from "leaflet";

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
  lote_origen?: string;
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

type BaseMapKey = "CALLES" | "SATELITE" | "TOPOGRAFICO";

const BASEMAPS: Record<BaseMapKey, { name: string; url: string; attr: string }> = {
  CALLES: {
    name: "Calles (OSM)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  SATELITE: {
    name: "Satélite HD",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
  },
  TOPOGRAFICO: {
    name: "Topográfico",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenTopoMap",
  },
};

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
  const [baseMap, setBaseMap] = useState<BaseMapKey>("CALLES");
  const [bufferDistance, setBufferDistance] = useState<number>(0);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<TileLayer | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const bufferLayerRef = useRef<any>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Falta configurar la clave pública.");
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
      setCollection(payload);
      setLoadedAt(new Date());
      setSelectedId((current) =>
        current && payload.features.some((feature) => feature.id === current)
          ? current
          : payload.features[0]?.id ?? null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al consultar Supabase.");
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
        [properties.nombre, properties.codigo, properties.tipo, properties.tipo_codigo, properties.familia, properties.ruta, properties.estado_validacion, properties.lote_origen].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [collection, filter, query]);

  const selectedFeature = useMemo(
    () => collection?.features.find((feature) => feature.id === selectedId) ?? null,
    [collection, selectedId],
  );

  // Inicializar Leaflet
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
      }).setView([-32.78, -60.25], 10);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const base = L.tileLayer(BASEMAPS.CALLES.url, {
        maxZoom: 20,
        attribution: BASEMAPS.CALLES.attr,
      }).addTo(map);

      baseLayerRef.current = base;
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

  // Cambiar capa base (Calles / Satélite / Topo)
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);

    const next = L.tileLayer(BASEMAPS[baseMap].url, {
      maxZoom: 20,
      attribution: BASEMAPS[baseMap].attr,
    }).addTo(map);

    baseLayerRef.current = next;
    next.bringToBack();
  }, [baseMap]);

  // Dibujar elementos vectoriales en el mapa
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
          leafletLayer.on("click", () => {
            setSelectedId(String(feature.id ?? ""));
            setBufferDistance(0);
          });
          const label = feature.properties?.nombre ?? "Activo vial";
          leafletLayer.bindTooltip(label, { sticky: true, direction: "top", opacity: 0.96 });
        },
      },
    ).addTo(map);
    layerRef.current = layer;
  }, [collection, selectedId, visibleFeatures]);

  // Dibujar Buffer (Área de influencia)
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (bufferLayerRef.current) {
      map.removeLayer(bufferLayerRef.current);
      bufferLayerRef.current = null;
    }

    if (bufferDistance > 0 && selectedFeature) {
      const focus = L.geoJSON(selectedFeature as never);
      const bounds = focus.getBounds();
      if (bounds.isValid()) {
        const center = bounds.getCenter();
        const circle = L.circle(center, {
          radius: bufferDistance,
          color: "#f59e0b",
          weight: 2,
          dashArray: "6, 6",
          fillColor: "#fbbf24",
          fillOpacity: 0.2,
        }).addTo(map);
        bufferLayerRef.current = circle;
        map.fitBounds(circle.getBounds().pad(0.2));
      }
    }
  }, [bufferDistance, selectedFeature]);

  const focusFeature = useCallback((feature: AssetFeature) => {
    setSelectedId(feature.id ?? null);
    setBufferDistance(0);
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

  // GPS: Mi Ubicación
  const handleLocateMe = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    map.locate({ setView: true, maxZoom: 16 });
    map.once("locationfound", (e: any) => {
      L.circleMarker(e.latlng, { radius: 8, color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup("Tu ubicación actual")
        .openPopup();
    });
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
          <div><p className="eyebrow">Inventario vial · SIG</p><h1>Visor de activos</h1></div>
        </div>

        {/* Herramientas de Barra Superior */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Selector de Mapa Base */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.08)", padding: "2px", borderRadius: "8px" }}>
            {(Object.keys(BASEMAPS) as BaseMapKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setBaseMap(key)}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "none",
                  background: baseMap === key ? "#2563eb" : "transparent",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: baseMap === key ? "bold" : "normal",
                }}
              >
                {BASEMAPS[key].name}
              </button>
            ))}
          </div>

          <button className="icon-button" type="button" onClick={handleLocateMe} title="Mi ubicación GPS">
            <Crosshair aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" onClick={() => void loadAssets()} aria-label="Actualizar datos" title="Actualizar datos">
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Inventario publicado">
          <div className="demo-banner">
            <AlertTriangle aria-hidden="true" />
            <div><strong>Geovisor SIG Dinámico</strong><span>Sincronizado con Supabase y QGIS</span></div>
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
                    <span className="asset-route"><MapPinned aria-hidden="true" /> {displayValue(properties.ruta, "RN174")}</span>
                  </span>
                  <span className="state-pill">{displayValue(properties.estado_validacion, "Sin estado")}</span>
                </button>
              );
            })}
          </div>

          <div className="sync-note">
            <Clock3 aria-hidden="true" />
            <span>{loadedAt ? `Actualizado ${loadedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Esperando datos"}</span>
            <span className="sync-source">SINCRONIZADO</span>
          </div>
        </aside>

        <section className="map-panel" aria-label="Mapa de activos RN 174">
          <div ref={mapNodeRef} className="map-canvas" />
          <div className="map-topline">
            <div><ShieldCheck aria-hidden="true" /><span>SIG en vivo</span></div>
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
                <button type="button" onClick={() => { setSelectedId(null); setBufferDistance(0); }} aria-label="Cerrar detalle"><X aria-hidden="true" /></button>
              </div>

              {/* Herramienta de Buffer Integrada en la ficha del elemento */}
              <div style={{ margin: "10px 0", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: "bold", color: "#f59e0b", display: "block", marginBottom: "6px" }}>⭕ Área de Influencia (Buffer)</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[50, 100, 500, 1000].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBufferDistance(bufferDistance === d ? 0 : d)}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        borderRadius: "4px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: bufferDistance === d ? "#f59e0b" : "transparent",
                        color: "#ffffff",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                      }}
                    >
                      {d >= 1000 ? "1 km" : `${d}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo, "Pendiente")}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Ciclo de vida</span><strong>{displayValue(selectedFeature.properties.estado_ciclo_vida)}</strong></div>
                <div><span>Calidad del dato</span><strong>{displayValue(selectedFeature.properties.calidad_dato)}</strong></div>
                <div><span>Precisión</span><strong>{selectedFeature.properties.precision_m !== undefined ? `${selectedFeature.properties.precision_m} m` : "Sin informar"}</strong></div>
                <div><span>Posicionamiento</span><strong>{displayValue(selectedFeature.properties.metodo_posicion)}</strong></div>
              </div>
              {selectedFeature.properties.observaciones && <p className="detail-observation"><span>Observaciones</span>{selectedFeature.properties.observaciones}</p>}
            </article>
          )}

          <a className="osm-link" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">Mapa Base <ArrowUpRight aria-hidden="true" /></a>
        </section>
      </section>
    </main>
  );
}

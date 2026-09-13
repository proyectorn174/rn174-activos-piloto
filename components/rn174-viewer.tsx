"use client";

import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Filter,
  Layers,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, TileLayer } from "leaflet";

type GeometryClass = "PUNTO" | "LINEA" | "POLIGONO";

type AssetProperties = {
  codigo?: string;
  nombre?: string;
  tipo_activo?: string;
  tipo?: string;
  tipo_codigo?: string;
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
  lote_origen?: string;
  [key: string]: unknown;
};

type AssetFeature = {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: AssetProperties;
};

type AssetCollection = {
  type: "FeatureCollection";
  features: AssetFeature[];
  metadata?: { dataset?: string; ruta?: string };
};

const GEOMETRY_COLORS: Record<GeometryClass, string> = {
  PUNTO: "#f36b21",
  LINEA: "#1677b8",
  POLIGONO: "#178a72",
};

const BASEMAPS = {
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
    name: "Relieve",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenTopoMap",
  },
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";

const normalize = (val?: string) =>
  (val ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const displayVal = (v: unknown, fallback = "—") =>
  v === undefined || v === null || v === "" ? fallback : String(v);

function getGeomClass(f: AssetFeature): GeometryClass {
  const g = f.properties?.geometria;
  if (g === "PUNTO" || g === "LINEA" || g === "POLIGONO") return g;
  if (f.id?.startsWith("punto") || f.geometry?.type?.includes("Point")) return "PUNTO";
  if (f.id?.startsWith("linea") || f.geometry?.type?.includes("Line")) return "LINEA";
  return "POLIGONO";
}

export function Rn174Viewer() {
  const [collection, setCollection] = useState<AssetCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navegación SIG
  const [activeTab, setActiveTab] = useState<"capas" | "filtros" | "herramientas">("capas");
  const [baseMap, setBaseMap] = useState<keyof typeof BASEMAPS>("CALLES");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filtros dinámicos
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("TODOS");
  const [filterState, setFilterState] = useState<string>("TODOS");
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>({
    PUNTO: true,
    LINEA: true,
    POLIGONO: true,
  });

  // Herramientas SIG
  const [bufferMeters, setBufferMeters] = useState<number>(0);
  const [bufferCount, setBufferCount] = useState<number | null>(null);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseTileRef = useRef<TileLayer | null>(null);
  const vectorLayerRef = useRef<LeafletGeoJSON | null>(null);
  const bufferLayerRef = useRef<any>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_demo_geojson`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const data = (await res.json()) as AssetCollection & { error?: string };
      if (!res.ok) throw new Error(data.error || "Error al conectar con Supabase");
      setCollection(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Lista dinámica de tipos de activos para el desplegable
  const assetTypes = useMemo(() => {
    const set = new Set<string>();
    collection?.features.forEach((f) => {
      const t = f.properties.tipo_activo || f.properties.tipo || f.properties.nombre;
      if (t) set.add(String(t));
    });
    return Array.from(set);
  }, [collection]);

  // Filtrado de elementos
  const filteredFeatures = useMemo(() => {
    const q = normalize(searchQuery);
    return (collection?.features ?? []).filter((f) => {
      const geom = getGeomClass(f);
      if (!enabledLayers[geom]) return false;

      const p = f.properties;
      const t = p.tipo_activo || p.tipo || "";
      if (filterType !== "TODOS" && t !== filterType) return false;
      if (filterState !== "TODOS" && p.estado_validacion !== filterState) return false;

      if (q) {
        const text = normalize(`${p.nombre} ${p.codigo} ${t} ${p.observaciones}`);
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [collection, enabledLayers, filterState, filterType, searchQuery]);

  const selectedFeature = useMemo(
    () => collection?.features.find((f) => f.id === selectedId) ?? null,
    [collection, selectedId],
  );

  // Inicializar Mapa
  useEffect(() => {
    let active = true;
    async function init() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!active || !mapNodeRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapNodeRef.current, {
        zoomControl: false,
        minZoom: 4,
      }).setView([-32.78, -60.25], 10);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const base = L.tileLayer(BASEMAPS.CALLES.url, {
        maxZoom: 20,
        attribution: BASEMAPS.CALLES.attr,
      }).addTo(map);

      baseTileRef.current = base;
      mapRef.current = map;
    }
    void init();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Cambiar capa base
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (baseTileRef.current) map.removeLayer(baseTileRef.current);

    const next = L.tileLayer(BASEMAPS[baseMap].url, {
      maxZoom: 20,
      attribution: BASEMAPS[baseMap].attr,
    }).addTo(map);
    baseTileRef.current = next;
    next.bringToBack();
  }, [baseMap]);

  // Dibujar capas vectoriales filtradas
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !collection) return;

    vectorLayerRef.current?.remove();

    const layer = L.geoJSON(
      { type: "FeatureCollection", features: filteredFeatures } as never,
      {
        pointToLayer: (feature, latlng) => {
          const isSel = feature.id === selectedId;
          return L.circleMarker(latlng, {
            radius: isSel ? 11 : 7,
            color: "#ffffff",
            weight: isSel ? 4 : 2,
            fillColor: GEOMETRY_COLORS.PUNTO,
            fillOpacity: 1,
          });
        },
        style: (feature) => {
          const geom = getGeomClass(feature as AssetFeature);
          const isSel = feature?.id === selectedId;
          const color = GEOMETRY_COLORS[geom];
          return {
            color,
            fillColor: color,
            fillOpacity: geom === "POLIGONO" ? (isSel ? 0.45 : 0.22) : 0,
            weight: isSel ? 6 : geom === "LINEA" ? 4 : 2,
          };
        },
        onEachFeature: (feature, l) => {
          l.on("click", () => {
            setSelectedId(feature.id);
            setBufferMeters(0);
          });
          l.bindTooltip(feature.properties?.nombre || "Elemento", { sticky: true });
        },
      },
    ).addTo(map);

    vectorLayerRef.current = layer;
  }, [collection, filteredFeatures, selectedId]);

  // Buffer y conteo espacial
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (bufferLayerRef.current) {
      map.removeLayer(bufferLayerRef.current);
      bufferLayerRef.current = null;
    }
    setBufferCount(null);

    if (bufferMeters > 0 && selectedFeature) {
      const focus = L.geoJSON(selectedFeature as never);
      const bounds = focus.getBounds();
      if (bounds.isValid()) {
        const center = bounds.getCenter();
        const circle = L.circle(center, {
          radius: bufferMeters,
          color: "#f59e0b",
          weight: 2,
          dashArray: "6, 6",
          fillColor: "#fbbf24",
          fillOpacity: 0.2,
        }).addTo(map);

        let count = 0;
        collection?.features.forEach((f) => {
          if (f.id === selectedFeature.id) return;
          const lyr = L.geoJSON(f as never);
          const b = lyr.getBounds();
          if (b.isValid() && center.distanceTo(b.getCenter()) <= bufferMeters) {
            count++;
          }
        });

        bufferLayerRef.current = circle;
        setBufferCount(count);
        map.fitBounds(circle.getBounds().pad(0.2));
      }
    }
  }, [bufferMeters, collection, selectedFeature]);

  const fitAll = () => {
    const map = mapRef.current;
    const l = vectorLayerRef.current;
    if (!map || !l) return;
    const b = l.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.15));
  };

  const locateMe = () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    map.locate({ setView: true, maxZoom: 16 });
    map.once("locationfound", (e: any) => {
      L.circleMarker(e.latlng, { radius: 8, color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup("Tu ubicación")
        .openPopup();
    });
  };

  return (
    <main className="app-shell">
      {/* BARRA SUPERIOR GIS */}
      <header className="topbar">
        <div className="brand-lockup">
          <div className="route-shield"><span>RN</span><strong>174</strong></div>
          <div><p className="eyebrow">Sistema de Información Geográfica</p><h1>Plataforma Vial Digital</h1></div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Selector de Mapa Base */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.08)", padding: "2px", borderRadius: "8px" }}>
            {(Object.keys(BASEMAPS) as (keyof typeof BASEMAPS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setBaseMap(k)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: baseMap === k ? "#2563eb" : "transparent",
                  color: "#ffffff",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  fontWeight: baseMap === k ? "bold" : "normal",
                }}
              >
                {BASEMAPS[k].name}
              </button>
            ))}
          </div>

          <button className="icon-button" onClick={locateMe} title="Mi ubicación GPS"><Crosshair size={18} /></button>
          <button className="icon-button" onClick={() => void loadData()} title="Actualizar datos"><RefreshCw size={18} className={loading ? "spin" : ""} /></button>
        </div>
      </header>

      <section className="workspace">
        {/* PANEL LATERAL MODULAR GIS */}
        <aside className="sidebar">
          {/* Pestañas Superiores */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("capas")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "capas" ? "2px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "capas" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                fontWeight: 600,
              }}
            >
              <Layers size={15} /> Capas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("filtros")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "filtros" ? "2px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "filtros" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                fontWeight: 600,
              }}
            >
              <Filter size={15} /> Filtros
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("herramientas")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "herramientas" ? "2px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "herramientas" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                fontWeight: 600,
              }}
            >
              <Wrench size={15} /> Análisis
            </button>
          </div>

          {/* CONTENIDO 1: ÁRBOL DE CAPAS */}
          {activeTab === "capas" && (
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: "bold" }}>Capas Vectoriales</span>
                <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "10px" }}>
                  {filteredFeatures.length} visibles
                </span>
              </div>

              {(["PUNTO", "LINEA", "POLIGONO"] as GeometryClass[]).map((geom) => {
                const count = (collection?.features ?? []).filter((f) => getGeomClass(f) === geom).length;
                const isEnabled = enabledLayers[geom];
                return (
                  <div
                    key={geom}
                    onClick={() => setEnabledLayers((p) => ({ ...p, [geom]: !p[geom] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: isEnabled ? "rgba(255,255,255,0.06)" : "transparent",
                      border: "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isEnabled ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="#64748b" />}
                      <span style={{ color: GEOMETRY_COLORS[geom], fontSize: "1.1rem" }}>●</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        {geom === "PUNTO" ? "Puntos (Equipamiento)" : geom === "LINEA" ? "Líneas (Defensas / Tramos)" : "Superficies (Polígonos)"}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* CONTENIDO 2: FILTROS DESPLEGABLES */}
          {activeTab === "filtros" && (
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <label className="search-box" style={{ margin: 0 }}>
                <Search size={16} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar en todos los campos..." />
              </label>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: "4px" }}>Tipo de Activo</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: "0.82rem",
                  }}
                >
                  <option value="TODOS">Todos los tipos ({assetTypes.length})</option>
                  {assetTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: "4px" }}>Estado de Validación</label>
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: "0.82rem",
                  }}
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="BORRADOR">Borrador</option>
                  <option value="EN_SERVICIO">En servicio</option>
                  <option value="APROBADO">Aprobado</option>
                </select>
              </div>
            </div>
          )}

          {/* CONTENIDO 3: HERRAMIENTAS SIG */}
          {activeTab === "herramientas" && (
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px", borderRadius: "8px" }}>
                <h3 style={{ fontSize: "0.85rem", color: "#f59e0b", marginBottom: "6px" }}>⭕ Análisis de Buffer (Proximidad)</h3>
                <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "8px" }}>
                  Activo base: <strong>{selectedFeature?.properties?.nombre || "Toca un elemento en el mapa"}</strong>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                  {[50, 100, 500, 1000].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBufferMeters(bufferMeters === m ? 0 : m)}
                      style={{
                        padding: "6px 0",
                        borderRadius: "4px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: bufferMeters === m ? "#f59e0b" : "transparent",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      {m >= 1000 ? "1 km" : `${m}m`}
                    </button>
                  ))}
                </div>
                {bufferMeters > 0 && bufferCount !== null && (
                  <div style={{ marginTop: "8px", padding: "8px", background: "rgba(245,158,11,0.15)", borderRadius: "6px", fontSize: "0.8rem" }}>
                    📊 <strong>{bufferCount} elementos</strong> dentro de {bufferMeters}m.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LISTA RÁPIDA DE ELEMENTOS FILTRADOS */}
          <div className="asset-list" style={{ flex: 1, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {filteredFeatures.map((f) => {
              const geom = getGeomClass(f);
              const isSel = f.id === selectedId;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`asset-card ${isSel ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedId(f.id);
                    setBufferMeters(0);
                  }}
                >
                  <span className="asset-mark" style={{ color: GEOMETRY_COLORS[geom] }}>●</span>
                  <span className="asset-copy">
                    <span className="asset-title">{f.properties.nombre || "Sin nombre"}</span>
                    <span className="asset-meta">{f.properties.tipo_activo || f.properties.tipo || geom}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAPA Y FICHA TÉCNICA */}
        <section className="map-panel">
          <div ref={mapNodeRef} className="map-canvas" />
          <div className="map-topline">
            <button type="button" onClick={fitAll}><LocateFixed size={16} /> Ver todo el corredor</button>
          </div>

          {/* FICHA TÉCNICA EXACTA DEL ELEMENTO SELECCIONADO */}
          {selectedFeature && (
            <article className="detail-card">
              <div className="detail-accent" style={{ background: GEOMETRY_COLORS[getGeomClass(selectedFeature)] }} />
              <div className="detail-header">
                <div>
                  <span className="detail-type">{getGeomClass(selectedFeature)} · {displayVal(selectedFeature.properties.tipo_activo || selectedFeature.properties.tipo)}</span>
                  <h2>{displayVal(selectedFeature.properties.nombre, "Activo")}</h2>
                </div>
                <button type="button" onClick={() => setSelectedId(null)}><X size={16} /></button>
              </div>

              <div className="detail-grid">
                <div><span>Código</span><strong>{displayVal(selectedFeature.properties.codigo)}</strong></div>
                <div><span>Estado</span><strong>{displayVal(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Ciclo de Vida</span><strong>{displayVal(selectedFeature.properties.estado_ciclo_vida)}</strong></div>
                <div><span>Lote / Origen</span><strong>{displayVal(selectedFeature.properties.lote_origen, "QGIS Directo")}</strong></div>
                <div><span>Precisión</span><strong>{displayVal(selectedFeature.properties.precision_m)} m</strong></div>
                <div><span>Posicionamiento</span><strong>{displayVal(selectedFeature.properties.metodo_posicion)}</strong></div>
              </div>

              {selectedFeature.properties.observaciones && (
                <p className="detail-observation"><span>Observaciones:</span> {String(selectedFeature.properties.observaciones)}</p>
              )}
            </article>
          )}
        </section>
      </section>
    </main>
  );
}

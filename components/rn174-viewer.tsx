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
  Ruler,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Circle as LeafletCircle,
  GeoJSON as LeafletGeoJSON,
  LatLng,
  LeafletMouseEvent,
  LocationEvent,
  Map as LeafletMap,
  Polyline as LeafletPolyline,
  TileLayer,
} from "leaflet";

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
type ActiveGisTool = "NONE" | "MEASURE" | "BUFFER" | "NEAREST";

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
    name: "Relieve",
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
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const displayValue = (value: string | number | undefined, fallback = "Sin informar") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

function geometryClass(feature: AssetFeature): GeometryClass {
  const declared = feature.properties.geometria;
  if (declared && declared in GEOMETRY_LABELS) return declared;
  if (feature.id?.startsWith("punto") || feature.geometry.type.includes("Point")) return "PUNTO";
  if (feature.id?.startsWith("linea") || feature.geometry.type.includes("Line")) return "LINEA";
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
  const [selectedType, setSelectedType] = useState<string>("TODOS");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapKey>("CALLES");

  // Herramientas GIS
  const [activeTool, setActiveTool] = useState<ActiveGisTool>("NONE");
  const [measurePoints, setMeasurePoints] = useState<LatLng[]>([]);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [bufferMeters, setBufferMeters] = useState<number>(100);
  const [bufferCount, setBufferCount] = useState<number | null>(null);
  const [nearestResult, setNearestResult] = useState<{ name: string; distance: number } | null>(null);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<TileLayer | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const bufferLayerRef = useRef<LeafletCircle | null>(null);
  const measureLineRef = useRef<LeafletPolyline | null>(null);
  const nearestLineRef = useRef<LeafletPolyline | null>(null);
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

  const assetTypes = useMemo(() => {
    const types = new Set<string>();
    for (const f of collection?.features ?? []) {
      const t = f.properties.tipo_activo ?? f.properties.tipo;
      if (t) types.add(t);
    }
    return Array.from(types);
  }, [collection]);

  const visibleFeatures = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return (collection?.features ?? []).filter((feature) => {
      const geometry = geometryClass(feature);
      if (filter !== "TODOS" && geometry !== filter) return false;

      const properties = feature.properties;
      const type = properties.tipo_activo ?? properties.tipo ?? "";
      if (selectedType !== "TODOS" && type !== selectedType) return false;

      const haystack = normalize(
        [properties.nombre, properties.codigo, type, properties.tipo_codigo, properties.familia, properties.ruta, properties.estado_validacion, properties.lote_origen].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [collection, filter, query, selectedType]);

  const selectedFeature = useMemo(
    () => collection?.features.find((feature) => feature.id === selectedId) ?? null,
    [collection, selectedId],
  );

  // Inicializar Mapa
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

  // Cambiar capa base
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

  // Dibujar vectoriales
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !collection) return;
    layerRef.current?.remove();
    const layer = L.geoJSON(
      { type: "FeatureCollection", features: visibleFeatures } as never,
      {
        pointToLayer: (feature, latlng) => {
          const geometry = geometryClass(feature as AssetFeature);
          const selected = String(feature.id ?? "") === selectedId;
          return L.circleMarker(latlng, {
            radius: selected ? 11 : 8,
            color: "#ffffff",
            weight: selected ? 4 : 3,
            fillColor: GEOMETRY_COLORS[geometry] ?? GEOMETRY_COLORS.PUNTO,
            fillOpacity: 1,
          });
        },
        style: (feature) => {
          const geometry = geometryClass(feature as AssetFeature);
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
          });
          const label = feature.properties?.nombre ?? "Activo vial";
          leafletLayer.bindTooltip(label, { sticky: true, direction: "top", opacity: 0.96 });
        },
      },
    ).addTo(map);
    layerRef.current = layer;
  }, [collection, selectedId, visibleFeatures]);

  // Modo Medición Interactiva
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (activeTool !== "MEASURE") {
      if (measureLineRef.current) {
        map.removeLayer(measureLineRef.current);
        measureLineRef.current = null;
      }
      setMeasurePoints([]);
      setTotalDistance(0);
      return;
    }

    const handleClick = (e: LeafletMouseEvent) => {
      setMeasurePoints((prev) => {
        const next = [...prev, e.latlng];
        if (next.length > 1) {
          let dist = 0;
          for (let i = 1; i < next.length; i++) {
            dist += next[i - 1].distanceTo(next[i]);
          }
          setTotalDistance(Math.round(dist));
        }
        return next;
      });
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [activeTool]);

  // Dibujar línea de medición
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || activeTool !== "MEASURE") return;

    if (measureLineRef.current) map.removeLayer(measureLineRef.current);

    if (measurePoints.length > 0) {
      const line = L.polyline(measurePoints, {
        color: "#f43f5e",
        weight: 4,
        dashArray: "6, 8",
      }).addTo(map);
      measureLineRef.current = line;
    }
  }, [activeTool, measurePoints]);

  // Buffer y Análisis Espacial
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (bufferLayerRef.current) {
      map.removeLayer(bufferLayerRef.current);
      bufferLayerRef.current = null;
    }
    setBufferCount(null);

    if (activeTool === "BUFFER" && selectedFeature) {
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
          fillOpacity: 0.22,
        }).addTo(map);
        bufferLayerRef.current = circle;

        // Conteo de elementos dentro del buffer
        let count = 0;
        collection?.features.forEach((f) => {
          if (f.id === selectedFeature.id) return;
          const lyr = L.geoJSON(f as never);
          const b = lyr.getBounds();
          if (b.isValid() && center.distanceTo(b.getCenter()) <= bufferMeters) {
            count++;
          }
        });
        setBufferCount(count);
        map.fitBounds(circle.getBounds().pad(0.2));
      }
    }
  }, [activeTool, bufferMeters, collection, selectedFeature]);

  // Análisis de Vecino Más Próximo
  const runNearestAnalysis = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !selectedFeature || !collection) return;

    if (nearestLineRef.current) {
      map.removeLayer(nearestLineRef.current);
      nearestLineRef.current = null;
    }

    const currentLayer = L.geoJSON(selectedFeature as never);
    const currentBounds = currentLayer.getBounds();
    if (!currentBounds.isValid()) return;
    const currentCenter = currentBounds.getCenter();

    let minDistance = Infinity;
    let closestFeature: AssetFeature | null = null;
    let closestCenter: LatLng | null = null;

    collection.features.forEach((f) => {
      if (f.id === selectedFeature.id) return;
      const otherLayer = L.geoJSON(f as never);
      const otherBounds = otherLayer.getBounds();
      if (otherBounds.isValid()) {
        const otherCenter = otherBounds.getCenter();
        const dist = currentCenter.distanceTo(otherCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestFeature = f;
          closestCenter = otherCenter;
        }
      }
    });

    if (closestFeature && closestCenter) {
      const line = L.polyline([currentCenter, closestCenter], {
        color: "#ec4899",
        weight: 3,
        dashArray: "4, 6",
      }).addTo(map);
      nearestLineRef.current = line;

      setNearestResult({
        name: (closestFeature as AssetFeature).properties.nombre ?? "Activo vecino",
        distance: Math.round(minDistance),
      });

      map.fitBounds(line.getBounds().pad(0.3));
    }
  }, [collection, selectedFeature]);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.16), { maxZoom: 17 });
  }, []);

  const handleLocateMe = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    map.locate({ setView: true, maxZoom: 16 });
    map.once("locationfound", (e: LocationEvent) => {
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
          <div><p className="eyebrow">Sistema de Información Geográfica</p><h1>Plataforma Vial Digital</h1></div>
        </div>

        {/* BARRA SUPERIOR GIS */}
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
            <span className="total-badge">{visibleFeatures.length} / {collection?.features.length ?? 0}</span>
          </div>

          <div className="metrics" aria-label="Resumen por geometría">
            <div><CircleDot aria-hidden="true" /><strong>{counts.PUNTO}</strong><span>Punto</span></div>
            <div><Route aria-hidden="true" /><strong>{counts.LINEA}</strong><span>Línea</span></div>
            <div><Layers3 aria-hidden="true" /><strong>{counts.POLIGONO}</strong><span>Superficie</span></div>
          </div>

          {/* Buscador */}
          <label className="search-box">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar elemento por nombre o código..." />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda"><X aria-hidden="true" /></button>}
          </label>

          {/* Selector desplegable de Tipo de Activo */}
          {assetTypes.length > 0 && (
            <div style={{ margin: "0 1rem 0.5rem" }}>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                <option value="TODOS">Todos los tipos de activo ({assetTypes.length})</option>
                {assetTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Geometría */}
          <div className="filter-row" aria-label="Filtrar por geometría">
            <Filter aria-hidden="true" />
            {FILTERS.map((item) => (
              <button type="button" key={item.value} className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)}>{item.label}</button>
            ))}
          </div>

          {/* Lista de Activos */}
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
              const assetTypeName = properties.tipo_activo ?? properties.tipo ?? GEOMETRY_LABELS[geometry];
              return (
                <button
                  type="button"
                  key={feature.id}
                  className={`asset-card ${selected ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedId(feature.id ?? null);
                    if (activeTool === "NEAREST") setNearestResult(null);
                  }}
                >
                  <span className="asset-mark" style={{ "--asset-color": GEOMETRY_COLORS[geometry] } as React.CSSProperties}><AssetMark geometry={geometry} /></span>
                  <span className="asset-copy">
                    <span className="asset-title">{displayValue(properties.nombre, "Activo sin nombre")}</span>
                    <span className="asset-meta">{displayValue(assetTypeName)} · {GEOMETRY_LABELS[geometry]}</span>
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

          {/* BARRA FLOTANTE DE HERRAMIENTAS GIS (TOOLBOX) */}
          <div style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            background: "rgba(15, 23, 42, 0.9)",
            backdropFilter: "blur(8px)",
            padding: "6px",
            borderRadius: "10px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.15)"
          }}>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "MEASURE" ? "NONE" : "MEASURE")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "MEASURE" ? "#f43f5e" : "transparent",
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
              title="Medir distancia haciendo clics en el mapa"
            >
              <Ruler size={16} /> <span>Medir</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "BUFFER" ? "NONE" : "BUFFER")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "BUFFER" ? "#f59e0b" : "transparent",
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
              title="Generar área de influencia alrededor del activo"
            >
              <CircleDot size={16} /> <span>Buffer</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTool(activeTool === "NEAREST" ? "NONE" : "NEAREST");
                if (activeTool !== "NEAREST") runNearestAnalysis();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "NEAREST" ? "#ec4899" : "transparent",
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
              title="Calcular activo vecino más cercano"
            >
              <Target size={16} /> <span>Proximidad</span>
            </button>
          </div>

          {/* PANEL INFORMATIVO DE LA HERRAMIENTA ACTIVA */}
          {activeTool === "MEASURE" && (
            <div style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #f43f5e",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#fda4af", textTransform: "uppercase", fontWeight: "bold" }}>Regla Activa</span>
                  <p style={{ margin: "2px 0", fontSize: "1.1rem", fontWeight: "bold" }}>
                    {totalDistance >= 1000 ? `${(totalDistance / 1000).toFixed(2)} km` : `${totalDistance} m`}
                  </p>
                  <small style={{ color: "#94a3b8" }}>Haz clics en el mapa para trazar la ruta</small>
                </div>
                <button
                  type="button"
                  onClick={() => { setMeasurePoints([]); setTotalDistance(0); }}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "6px", borderRadius: "6px", cursor: "pointer" }}
                  title="Borrar trazo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}

          {activeTool === "BUFFER" && (
            <div style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #f59e0b",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              minWidth: "240px"
            }}>
              <span style={{ fontSize: "0.75rem", color: "#fcd34d", textTransform: "uppercase", fontWeight: "bold" }}>Área de Influencia</span>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>
                Activo: <strong>{selectedFeature?.properties?.nombre || "Toca un elemento"}</strong>
              </p>
              <div style={{ margin: "8px 0" }}>
                <input
                  type="range"
                  min="20"
                  max="1500"
                  step="20"
                  value={bufferMeters}
                  onChange={(e) => setBufferMeters(Number(e.target.value))}
                  style={{ width: "100%", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8" }}>
                  <span>20m</span>
                  <strong style={{ color: "#f59e0b" }}>{bufferMeters} m</strong>
                  <span>1.5 km</span>
                </div>
              </div>
              {bufferCount !== null && (
                <div style={{ background: "rgba(245,158,11,0.15)", padding: "6px 8px", borderRadius: "6px", fontSize: "0.8rem" }}>
                  📊 <strong>{bufferCount} activos</strong> encontrados en el radio.
                </div>
              )}
            </div>
          )}

          {activeTool === "NEAREST" && nearestResult && (
            <div style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #ec4899",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)"
            }}>
              <span style={{ fontSize: "0.75rem", color: "#f472b6", textTransform: "uppercase", fontWeight: "bold" }}>Vecino Más Cercano</span>
              <p style={{ margin: "4px 0", fontSize: "0.9rem", fontWeight: "bold" }}>{nearestResult.name}</p>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#ec4899" }}>
                Distancia en línea recta: <strong>{nearestResult.distance >= 1000 ? `${(nearestResult.distance / 1000).toFixed(2)} km` : `${nearestResult.distance} m`}</strong>
              </p>
            </div>
          )}

          <div className="map-topline" style={{ left: activeTool !== "NONE" ? "280px" : "16px", transition: "left 0.2s" }}>
            <div><ShieldCheck aria-hidden="true" /><span>SIG en vivo</span></div>
            <button type="button" onClick={fitAll}><LocateFixed aria-hidden="true" /> Ver todos</button>
          </div>

          <div className="map-legend" aria-label="Leyenda del mapa">
            {(Object.keys(GEOMETRY_LABELS) as GeometryClass[]).map((geometry) => <span key={geometry}><i style={{ backgroundColor: GEOMETRY_COLORS[geometry] }} />{GEOMETRY_LABELS[geometry]}</span>)}
          </div>

          {/* FICHA TÉCNICA PRECISA */}
          {selectedFeature && (
            <article className="detail-card">
              <div className="detail-accent" style={{ background: GEOMETRY_COLORS[geometryClass(selectedFeature)] }} />
              <div className="detail-header">
                <div>
                  <span className="detail-type">{GEOMETRY_LABELS[geometryClass(selectedFeature)]} · {displayValue(selectedFeature.properties.tipo_activo ?? selectedFeature.properties.tipo)}</span>
                  <h2>{displayValue(selectedFeature.properties.nombre, "Activo")}</h2>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar detalle"><X aria-hidden="true" /></button>
              </div>

              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo, "Pendiente")}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Ciclo de vida</span><strong>{displayValue(selectedFeature.properties.estado_ciclo_vida)}</strong></div>
                <div><span>Lote / Origen</span><strong>{displayValue(selectedFeature.properties.lote_origen, "QGIS Directo")}</strong></div>
                <div><span>Calidad del dato</span><strong>{displayValue(selectedFeature.properties.calidad_dato)}</strong></div>
                <div><span>Precisión</span><strong>{selectedFeature.properties.precision_m !== undefined ? `${selectedFeature.properties.precision_m} m` : "Sin informar"}</strong></div>
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

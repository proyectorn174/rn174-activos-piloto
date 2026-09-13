"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CircleDot,
  Clock3,
  Crosshair,
  Download,
  Filter,
  Layers,
  LocateFixed,
  RefreshCw,
  Ruler,
  Search,
  Table,
  Target,
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
  progresiva_m?: number;
  progresiva?: string;
  lado?: string;
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

const displayValue = (value: string | number | undefined, fallback = "—") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

function geometryClass(feature: AssetFeature): GeometryClass {
  const declared = feature.properties.geometria;
  if (declared === "PUNTO" || declared === "LINEA" || declared === "POLIGONO") return declared;
  if (feature.id?.startsWith("punto") || feature.geometry.type.includes("Point")) return "PUNTO";
  if (feature.id?.startsWith("linea") || feature.geometry.type.includes("Line")) return "LINEA";
  return "POLIGONO";
}

// ESCUDO OFICIAL DE VIALIDAD NACIONAL ARGENTINA (RN 174)
function OfficialRn174Shield() {
  return (
    <div style={{
      width: "52px",
      height: "64px",
      background: "#ffffff",
      borderRadius: "8px 8px 26px 26px",
      border: "3px solid #111827",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: "6px", fontWeight: "900", color: "#111827", letterSpacing: "0.5px", marginTop: "2px" }}>
        ARGENTINA
      </span>
      <div style={{
        width: "100%",
        height: "14px",
        background: "#111827",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 3px",
        margin: "1px 0",
      }}>
        <span style={{ color: "#ffffff", fontSize: "7px", fontWeight: "bold" }}>RA</span>
        <div style={{ width: "16px", height: "9px", display: "flex", flexDirection: "column", borderRadius: "1px", overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#75aadb" }} />
          <div style={{ flex: 1, background: "#ffffff" }} />
          <div style={{ flex: 1, background: "#75aadb" }} />
        </div>
      </div>
      <span style={{ fontSize: "19px", fontWeight: "900", color: "#111827", lineHeight: "1.1", marginTop: "2px" }}>
        174
      </span>
    </div>
  );
}

export function Rn174Viewer() {
  const [collection, setCollection] = useState<AssetCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterGeom, setFilterGeom] = useState<FilterValue>("TODOS");
  const [filterType, setFilterType] = useState<string>("TODOS");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapKey>("CALLES");
  const [activeTab, setActiveTab] = useState<"INVENTARIO" | "ANALISIS" | "TABLA">("INVENTARIO");

  // Herramientas GIS
  const [activeTool, setActiveTool] = useState<ActiveGisTool>("NONE");
  const [measurePoints, setMeasurePoints] = useState<LatLng[]>([]);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [bufferMeters, setBufferMeters] = useState<number>(200);
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
    try {
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
    } catch {
      // Manejo silencioso de error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
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
      if (filterGeom !== "TODOS" && geometry !== filterGeom) return false;

      const properties = feature.properties;
      const type = properties.tipo_activo ?? properties.tipo ?? "";
      if (filterType !== "TODOS" && type !== filterType) return false;

      const haystack = normalize(
        [properties.nombre, properties.codigo, type, properties.tipo_codigo, properties.familia, properties.ruta, properties.estado_validacion, properties.lote_origen, properties.progresiva, properties.progresiva_m, properties.lado].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [collection, filterGeom, filterType, query]);

  const selectedFeature = useMemo(
    () => collection?.features.find((feature) => feature.id === selectedId) ?? null,
    [collection, selectedId],
  );

  // MÉTRICAS Y KPIS VIALES
  const analytics = useMemo(() => {
    const feats = visibleFeatures;
    const totalPuntos = feats.filter((f) => geometryClass(f) === "PUNTO").length;
    const totalLineas = feats.filter((f) => geometryClass(f) === "LINEA").length;
    const totalPoligonos = feats.filter((f) => geometryClass(f) === "POLIGONO").length;

    const porTipo: Record<string, number> = {};
    feats.forEach((f) => {
      const key = f.properties.tipo_activo || f.properties.tipo || "Otros";
      porTipo[key] = (porTipo[key] || 0) + 1;
    });

    const porEstado: Record<string, number> = {};
    feats.forEach((f) => {
      const est = f.properties.estado_validacion || "Borrador";
      porEstado[est] = (porEstado[est] || 0) + 1;
    });

    return { totalPuntos, totalLineas, totalPoligonos, porTipo, porEstado };
  }, [visibleFeatures]);

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
    }
    void createMap();
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
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);

    const next = L.tileLayer(BASEMAPS[baseMap].url, {
      maxZoom: 20,
      attribution: BASEMAPS[baseMap].attr,
    }).addTo(map);

    baseLayerRef.current = next;
    next.bringToBack();
  }, [baseMap]);

  // Dibujar elementos vectoriales
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
            weight: selected ? 4 : 2,
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
            fillOpacity: geometry === "POLIGONO" ? (selected ? 0.45 : 0.22) : 0,
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

  // Medición Interactiva
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

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || activeTool !== "MEASURE") return;
    if (measureLineRef.current) map.removeLayer(measureLineRef.current);
    if (measurePoints.length > 0) {
      const line = L.polyline(measurePoints, { color: "#f43f5e", weight: 4, dashArray: "6, 8" }).addTo(map);
      measureLineRef.current = line;
    }
  }, [activeTool, measurePoints]);

  // Buffer interactivo
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

  // Vecino más próximo
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

  // EXPORTACIÓN A EXCEL / CSV
  const exportToCSV = () => {
    if (!visibleFeatures.length) return;
    const headers = ["ID", "Nombre", "Tipo", "Geometría", "Ruta", "Progresiva", "Lado", "Estado", "Ciclo de Vida", "Lote", "Observaciones"];
    const rows = visibleFeatures.map((f) => [
      f.id,
      `"${f.properties.nombre || ""}"`,
      `"${f.properties.tipo_activo || f.properties.tipo || ""}"`,
      geometryClass(f),
      f.properties.ruta || "RN174",
      f.properties.progresiva || f.properties.progresiva_m || "",
      f.properties.lado || "",
      f.properties.estado_validacion || "",
      f.properties.estado_ciclo_vida || "",
      `"${f.properties.lote_origen || ""}"`,
      `"${f.properties.observaciones || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RN174_Inventario_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // EXPORTACIÓN A GEOJSON
  const exportToGeoJSON = () => {
    if (!visibleFeatures.length) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      type: "FeatureCollection",
      features: visibleFeatures
    }, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `RN174_Capas_${new Date().toISOString().slice(0, 10)}.geojson`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  return (
    <main className="app-shell">
      {/* HEADER CON ESCUDO OFICIAL VIALIDAD NACIONAL */}
      <header className="topbar" style={{ padding: "0.4rem 1.2rem", background: "#0f172a", borderBottom: "2px solid #334155" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <OfficialRn174Shield />
          <div>
            <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "1px", fontWeight: "bold" }}>
              DIRECCIÓN NACIONAL DE VIALIDAD · DISTRITO XVII
            </span>
            <h1 style={{ fontSize: "1.25rem", margin: 0, fontWeight: "900", color: "#f8fafc", letterSpacing: "-0.5px" }}>
              Sistema de Gestión de Activos Vial RN 174
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.08)", padding: "2px", borderRadius: "8px" }}>
            {(Object.keys(BASEMAPS) as BaseMapKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setBaseMap(key)}
                style={{
                  padding: "4px 10px",
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
            <Crosshair size={18} />
          </button>
          <button className="icon-button" type="button" onClick={() => void loadAssets()} aria-label="Actualizar datos" title="Actualizar datos">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <section className="workspace">
        {/* PANEL LATERAL DE GESTIÓN Y TOMA DE DECISIONES */}
        <aside className="sidebar" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("INVENTARIO")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "INVENTARIO" ? "3px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "INVENTARIO" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px"
              }}
            >
              <Layers size={15} /> Capas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ANALISIS")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "ANALISIS" ? "3px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "ANALISIS" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px"
              }}
            >
              <BarChart3 size={15} /> Analítica
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("TABLA")}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                borderBottom: activeTab === "TABLA" ? "3px solid #2563eb" : "none",
                background: "transparent",
                color: activeTab === "TABLA" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px"
              }}
            >
              <Table size={15} /> Tabla
            </button>
          </div>

          {activeTab === "INVENTARIO" && (
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", flex: 1, overflowY: "auto" }}>
              <label className="search-box" style={{ margin: 0 }}>
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar elemento o progresiva..." />
                {query && <button type="button" onClick={() => setQuery("")}><X size={14} /></button>}
              </label>

              {assetTypes.length > 0 && (
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    background: "#1e293b",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: "0.8rem",
                  }}
                >
                  <option value="TODOS">Todos los tipos de activo ({assetTypes.length})</option>
                  {assetTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}

              <div className="filter-row" style={{ margin: 0 }}>
                <Filter size={15} />
                {(["TODOS", "PUNTO", "LINEA", "POLIGONO"] as FilterValue[]).map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={filterGeom === val ? "active" : ""}
                    onClick={() => setFilterGeom(val)}
                  >
                    {val === "TODOS" ? "Todos" : val === "PUNTO" ? "Puntos" : val === "LINEA" ? "Líneas" : "Superficies"}
                  </button>
                ))}
              </div>

              <div className="asset-list" style={{ flex: 1, overflowY: "auto" }}>
                {visibleFeatures.map((f) => {
                  const geom = geometryClass(f);
                  const isSel = f.id === selectedId;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`asset-card ${isSel ? "selected" : ""}`}
                      onClick={() => setSelectedId(f.id ?? null)}
                    >
                      <span className="asset-mark" style={{ "--asset-color": GEOMETRY_COLORS[geom] } as React.CSSProperties}>
                        <span style={{ fontSize: "1rem" }}>●</span>
                      </span>
                      <span className="asset-copy">
                        <span className="asset-title">{f.properties.nombre || "Activo sin nombre"}</span>
                        <span className="asset-meta">{f.properties.tipo_activo || f.properties.tipo || geom}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "ANALISIS" && (
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px", flex: 1, overflowY: "auto" }}>
              <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#38bdf8", fontWeight: "bold" }}>Métricas del Corredor</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "8px" }}>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                    <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#f36b21", display: "block" }}>{analytics.totalPuntos}</span>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Puntos</span>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                    <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#1677b8", display: "block" }}>{analytics.totalLineas}</span>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Líneas</span>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                    <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#178a72", display: "block" }}>{analytics.totalPoligonos}</span>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Polígonos</span>
                  </div>
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#fbbf24", fontWeight: "bold" }}>Inventario por Tipología</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {Object.entries(analytics.porTipo).map(([tipo, qty]) => (
                    <div key={tipo} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span>{tipo}</span>
                      <strong style={{ color: "#38bdf8" }}>{qty} un.</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#4ade80", fontWeight: "bold" }}>Estado de Validación</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {Object.entries(analytics.porEstado).map(([est, qty]) => (
                    <div key={est} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "4px 0" }}>
                      <span>{est}</span>
                      <span style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80", padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: "bold" }}>{qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "TABLA" && (
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Exportar datos filtrados actualmente ({visibleFeatures.length} elementos):</span>
              <button
                type="button"
                onClick={exportToCSV}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#10b981",
                  color: "#ffffff",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.82rem"
                }}
              >
                <Download size={16} /> Exportar a Excel (CSV)
              </button>
              <button
                type="button"
                onClick={exportToGeoJSON}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.82rem"
                }}
              >
                <ArrowDownToLine size={16} /> Exportar a GeoJSON (QGIS)
              </button>
            </div>
          )}

          <div className="sync-note">
            <Clock3 size={14} />
            <span>{loadedAt ? `Actualizado ${loadedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Esperando"}</span>
            <span className="sync-source">SINCRONIZADO</span>
          </div>
        </aside>

        {/* MAPA Y BARRA FLOTANTE DE ANÁLISIS SIG */}
        <section className="map-panel" style={{ position: "relative" }}>
          <div ref={mapNodeRef} className="map-canvas" />

          {/* BARRA DE HERRAMIENTAS GIS FLOTANTE */}
          <div style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "row",
            gap: "6px",
            background: "rgba(15, 23, 42, 0.95)",
            padding: "4px",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.15)"
          }}>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "MEASURE" ? "NONE" : "MEASURE")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "MEASURE" ? "#f43f5e" : "transparent",
                color: "#ffffff",
                fontSize: "0.78rem",
                fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              <Ruler size={15} /> <span>Medir</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool(activeTool === "BUFFER" ? "NONE" : "BUFFER")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "BUFFER" ? "#f59e0b" : "transparent",
                color: "#ffffff",
                fontSize: "0.78rem",
                fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              <CircleDot size={15} /> <span>Buffer</span>
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
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                background: activeTool === "NEAREST" ? "#ec4899" : "transparent",
                color: "#ffffff",
                fontSize: "0.78rem",
                fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              <Target size={15} /> <span>Proximidad</span>
            </button>
          </div>

          {activeTool === "MEASURE" && (
            <div style={{
              position: "absolute",
              top: "60px",
              right: "14px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #f43f5e",
            }}>
              <span style={{ fontSize: "0.7rem", color: "#fda4af", textTransform: "uppercase", fontWeight: "bold" }}>Distancia de Traza</span>
              <p style={{ margin: "2px 0", fontSize: "1rem", fontWeight: "bold" }}>
                {totalDistance >= 1000 ? `${(totalDistance / 1000).toFixed(2)} km` : `${totalDistance} m`}
              </p>
              <small style={{ color: "#94a3b8" }}>Haz clics sobre la ruta para medir</small>
            </div>
          )}

          {activeTool === "BUFFER" && (
            <div style={{
              position: "absolute",
              top: "60px",
              right: "14px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #f59e0b",
              minWidth: "220px"
            }}>
              <span style={{ fontSize: "0.7rem", color: "#fcd34d", textTransform: "uppercase", fontWeight: "bold" }}>Radio de Buffer</span>
              <input
                type="range"
                min="20"
                max="1500"
                step="20"
                value={bufferMeters}
                onChange={(e) => setBufferMeters(Number(e.target.value))}
                style={{ width: "100%", margin: "6px 0", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#f59e0b", fontWeight: "bold" }}>
                <span>Radio: {bufferMeters} m</span>
                <span>{bufferCount !== null ? `${bufferCount} vecinos` : ""}</span>
              </div>
            </div>
          )}

          {activeTool === "NEAREST" && nearestResult && (
            <div style={{
              position: "absolute",
              top: "60px",
              right: "14px",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.95)",
              color: "#ffffff",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #ec4899",
            }}>
              <span style={{ fontSize: "0.7rem", color: "#f472b6", textTransform: "uppercase", fontWeight: "bold" }}>Elemento Más Cercano</span>
              <p style={{ margin: "2px 0", fontSize: "0.85rem", fontWeight: "bold" }}>{nearestResult.name}</p>
              <small style={{ color: "#ec4899" }}>Distancia: {nearestResult.distance} m</small>
            </div>
          )}

          <div className="map-topline">
            <button type="button" onClick={fitAll}><LocateFixed size={15} /> Encuadre General</button>
          </div>

          {/* FICHA TÉCNICA DEL ELEMENTO ABAJO A LA DERECHA */}
          {selectedFeature && (
            <article className="detail-card" style={{
              position: "absolute",
              bottom: "20px",
              right: "20px",
              zIndex: 999,
              maxWidth: "340px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              margin: 0
            }}>
              <div className="detail-accent" style={{ background: GEOMETRY_COLORS[geometryClass(selectedFeature)] }} />
              <div className="detail-header">
                <div>
                  <span className="detail-type">{geometryClass(selectedFeature)} · {displayValue(selectedFeature.properties.tipo_activo ?? selectedFeature.properties.tipo)}</span>
                  <h2>{displayValue(selectedFeature.properties.nombre, "Activo")}</h2>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar"><X size={16} /></button>
              </div>

              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo)}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Ciclo de vida</span><strong>{displayValue(selectedFeature.properties.estado_ciclo_vida)}</strong></div>
                <div><span>Progresiva</span><strong>{displayValue(selectedFeature.properties.progresiva ?? selectedFeature.properties.progresiva_m)}</strong></div>
                <div><span>Lado</span><strong>{displayValue(selectedFeature.properties.lado)}</strong></div>
                <div><span>Lote / Origen</span><strong>{displayValue(selectedFeature.properties.lote_origen, "QGIS Directo")}</strong></div>
                <div><span>Precisión</span><strong>{displayValue(selectedFeature.properties.precision_m)} m</strong></div>
                <div><span>Posicionamiento</span><strong>{displayValue(selectedFeature.properties.metodo_posicion)}</strong></div>
              </div>
              {selectedFeature.properties.observaciones && <p className="detail-observation"><span>Obs:</span> {selectedFeature.properties.observaciones}</p>}
            </article>
          )}

          <a className="osm-link" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap <ArrowUpRight size={14} /></a>
        </section>
      </section>
    </main>
  );
}


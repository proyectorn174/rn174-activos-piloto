"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Circle,
  CircleDot,
  Compass,
  Crosshair,
  Layers,
  Layers3,
  Locate,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Maximize2,
  Navigation,
  RefreshCw,
  Route,
  Ruler,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";

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
  lote_origen?: string;
};

type AssetFeature = {
  type: "Feature";
  id?: string;
  geometry: { type: string; coordinates: any };
  properties: AssetProperties;
};

type AssetCollection = {
  type: "FeatureCollection";
  features: AssetFeature[];
  metadata?: { dataset?: string; ruta?: string };
};

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

const BASEMAPS = {
  CALLES: {
    name: "Calles (OSM)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  SATELITE: {
    name: "Satélite HD (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
  },
  TOPOGRAFICO: {
    name: "Topográfico",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap",
  },
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";

const normalize = (val?: string) =>
  (val ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const displayValue = (val: string | number | undefined, fallback = "Sin informar") =>
  val === undefined || val === null || val === "" ? fallback : String(val);

function geometryClass(feature: AssetFeature): GeometryClass {
  const declared = feature.properties.geometria;
  if (declared && declared in GEOMETRY_LABELS) return declared;
  if (feature.geometry?.type?.includes("Point")) return "PUNTO";
  if (feature.geometry?.type?.includes("Line")) return "LINEA";
  return "POLIGONO";
}

function getFeatureCenter(feature: AssetFeature, L: any): [number, number] | null {
  try {
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      const center = bounds.getCenter();
      return [center.lat, center.lng];
    }
  } catch {
    return null;
  }
  return null;
}

export function Rn174Viewer() {
  const [collection, setCollection] = useState<AssetCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseMap, setBaseMap] = useState<keyof typeof BASEMAPS>("CALLES");
  const [activeTab, setActiveTab] = useState<"capas" | "analisis">("capas");

  // Herramientas SIG
  const [bufferDistance, setBufferDistance] = useState<number>(0);
  const [bufferCount, setBufferCount] = useState<number | null>(null);
  const [nearestAsset, setNearestAsset] = useState<{ name: string; distance: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseTileRef = useRef<TileLayer | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const analysisLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setSelectedId((curr) => curr ?? payload.features[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al conectar con Supabase");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // Inicializar Mapa
  useEffect(() => {
    let active = true;
    async function initMap() {
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
        attribution: BASEMAPS.CALLES.attribution,
      }).addTo(map);

      baseTileRef.current = base;
      analysisLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }
    void initMap();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Cambiar Mapa Base
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (baseTileRef.current) map.removeLayer(baseTileRef.current);

    const newBase = L.tileLayer(BASEMAPS[baseMap].url, {
      maxZoom: 20,
      attribution: BASEMAPS[baseMap].attribution,
    }).addTo(map);
    baseTileRef.current = newBase;
  }, [baseMap]);

  const selectedFeature = useMemo(
    () => collection?.features.find((f) => f.id === selectedId) ?? null,
    [collection, selectedId],
  );

  // Renderizar capas vectoriales
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !collection) return;

    layerRef.current?.remove();

    const layer = L.geoJSON(collection as any, {
      pointToLayer: (feature, latlng) => {
        const isSelected = feature.id === selectedId;
        return L.circleMarker(latlng, {
          radius: isSelected ? 10 : 7,
          color: "#ffffff",
          weight: isSelected ? 4 : 2,
          fillColor: GEOMETRY_COLORS.PUNTO,
          fillOpacity: 1,
        });
      },
      style: (feature) => {
        const geom = geometryClass(feature as any);
        const isSelected = feature?.id === selectedId;
        const color = GEOMETRY_COLORS[geom];
        return {
          color,
          fillColor: color,
          fillOpacity: geom === "POLIGONO" ? (isSelected ? 0.45 : 0.2) : 0,
          weight: isSelected ? 6 : geom === "LINEA" ? 4 : 2,
        };
      },
      onEachFeature: (feature, leafletLayer) => {
        leafletLayer.on("click", () => {
          setSelectedId(feature.id);
          setBufferDistance(0);
          setNearestAsset(null);
        });
        leafletLayer.bindTooltip(feature.properties?.nombre || "Activo", {
          sticky: true,
          direction: "top",
        });
      },
    }).addTo(map);

    layerRef.current = layer;
  }, [collection, selectedId]);

  // Ejecutar Análisis de Buffer y Próximos
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const analysisGroup = analysisLayerRef.current;
    if (!L || !map || !analysisGroup) return;

    analysisGroup.clearLayers();
    setBufferCount(null);

    if (!selectedFeature) return;

    const center = getFeatureCenter(selectedFeature, L);
    if (!center) return;

    // 1. Dibujar Buffer si está activo
    if (bufferDistance > 0) {
      const circle = L.circle(center, {
        radius: bufferDistance,
        color: "#f59e0b",
        weight: 2,
        dashArray: "6, 6",
        fillColor: "#fbbf24",
        fillOpacity: 0.18,
      }).addTo(analysisGroup);

      // Conteo de activos dentro del Buffer
      let count = 0;
      collection?.features.forEach((f) => {
        if (f.id === selectedFeature.id) return;
        const featCenter = getFeatureCenter(f, L);
        if (featCenter) {
          const dist = L.latLng(center).distanceTo(L.latLng(featCenter));
          if (dist <= bufferDistance) count++;
        }
      });
      setBufferCount(count);
      map.fitBounds(circle.getBounds().pad(0.2));
    }
  }, [bufferDistance, collection, selectedFeature]);

  // Función: Calcular el más próximo
  const findNearest = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const analysisGroup = analysisLayerRef.current;
    if (!L || !map || !analysisGroup || !selectedFeature || !collection) return;

    const currentCenter = getFeatureCenter(selectedFeature, L);
    if (!currentCenter) return;

    let minDistance = Infinity;
    let closest: AssetFeature | null = null;
    let closestCenter: [number, number] | null = null;

    collection.features.forEach((f) => {
      if (f.id === selectedFeature.id) return;
      const otherCenter = getFeatureCenter(f, L);
      if (otherCenter) {
        const dist = L.latLng(currentCenter).distanceTo(L.latLng(otherCenter));
        if (dist < minDistance) {
          minDistance = dist;
          closest = f;
          closestCenter = otherCenter;
        }
      }
    });

    if (closest && closestCenter) {
      analysisGroup.clearLayers();
      const line = L.polyline([currentCenter, closestCenter], {
        color: "#ec4899",
        weight: 3,
        dashArray: "4, 8",
      }).addTo(analysisGroup);

      L.circleMarker(closestCenter, {
        radius: 8,
        color: "#ec4899",
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(analysisGroup);

      setNearestAsset({
        name: (closest as AssetFeature).properties.nombre || "Activo cercano",
        distance: Math.round(minDistance),
      });

      map.fitBounds(line.getBounds().pad(0.3));
    }
  };

  // Función: Mi Ubicación GPS
  const handleLocateMe = () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    map.locate({ setView: true, maxZoom: 16 });
    map.once("locationfound", (e: any) => {
      L.circleMarker(e.latlng, { radius: 8, color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup("Estás aquí")
        .openPopup();
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="route-shield"><span>RN</span><strong>174</strong></div>
          <div><p className="eyebrow">Geovisor SIG vial</p><h1>Analítica de Activos</h1></div>
        </div>

        {/* Barra de Herramientas Superior */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Selector de Mapa Base */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.08)", padding: "3px", borderRadius: "8px" }}>
            {(Object.keys(BASEMAPS) as (keyof typeof BASEMAPS)[]).map((key) => (
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
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  fontWeight: baseMap === key ? "bold" : "normal",
                }}
              >
                {BASEMAPS[key].name}
              </button>
            ))}
          </div>

          <button className="icon-button" onClick={handleLocateMe} title="Mi ubicación GPS">
            <Crosshair size={18} />
          </button>
          <button className="icon-button" onClick={() => void loadAssets()} title="Actualizar datos de Supabase">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          {/* Selector de Pestañas: Capas vs Herramientas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", margin: "0.75rem 1rem 0" }}>
            <button
              type="button"
              onClick={() => setActiveTab("capas")}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "capas" ? "#1e293b" : "rgba(255,255,255,0.05)",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              📋 Inventario
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("analisis")}
              style={{
                padding: "8px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "analisis" ? "#1e293b" : "rgba(255,255,255,0.05)",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              ⚙️ Análisis SIG
            </button>
          </div>

          {activeTab === "capas" ? (
            <>
              <div className="sidebar-heading">
                <div><h2>Activos en Supabase</h2></div>
                <span className="total-badge">{collection?.features.length ?? 0}</span>
              </div>

              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar elemento..." />
              </label>

              <div className="asset-list">
                {collection?.features
                  .filter((f) => normalize(f.properties.nombre).includes(normalize(query)))
                  .map((feature) => (
                    <button
                      key={feature.id}
                      type="button"
                      className={`asset-card ${feature.id === selectedId ? "selected" : ""}`}
                      onClick={() => setSelectedId(feature.id)}
                    >
                      <span className="asset-title">{feature.properties.nombre || "Activo sin nombre"}</span>
                      <span className="asset-meta">{feature.properties.tipo} · {GEOMETRY_LABELS[geometryClass(feature)]}</span>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            /* PANEL DE ANÁLISIS SIG */
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px", borderRadius: "8px" }}>
                <h3 style={{ fontSize: "0.9rem", marginBottom: "8px", color: "#f59e0b" }}>⭕ Área de Influencia (Buffer)</h3>
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "10px" }}>
                  Elemento: <strong>{selectedFeature?.properties.nombre || "Ninguno seleccionado"}</strong>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {[50, 100, 500, 1000].map((dist) => (
                    <button
                      key={dist}
                      type="button"
                      onClick={() => setBufferDistance(bufferDistance === dist ? 0 : dist)}
                      style={{
                        padding: "6px 0",
                        borderRadius: "4px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: bufferDistance === dist ? "#f59e0b" : "transparent",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                      }}
                    >
                      {dist >= 1000 ? "1 km" : `${dist}m`}
                    </button>
                  ))}
                </div>

                {bufferDistance > 0 && bufferCount !== null && (
                  <div style={{ marginTop: "10px", padding: "8px", background: "rgba(245,158,11,0.15)", borderRadius: "6px", fontSize: "0.82rem" }}>
                    📊 <strong>{bufferCount} activos</strong> encontrados en un radio de {bufferDistance}m.
                  </div>
                )}
              </div>

              <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px", borderRadius: "8px" }}>
                <h3 style={{ fontSize: "0.9rem", marginBottom: "8px", color: "#ec4899" }}>🎯 Activo Más Próximo</h3>
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "10px" }}>
                  Encuentra la distancia y el activo vecino más cercano.
                </p>
                <button
                  type="button"
                  onClick={findNearest}
                  disabled={!selectedFeature}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "none",
                    background: selectedFeature ? "#ec4899" : "#475569",
                    color: "#ffffff",
                    fontWeight: "bold",
                    cursor: selectedFeature ? "pointer" : "not-allowed",
                    fontSize: "0.82rem",
                  }}
                >
                  Calcular Vecino Más Cercano
                </button>

                {nearestAsset && (
                  <div style={{ marginTop: "10px", padding: "8px", background: "rgba(236,72,153,0.15)", borderRadius: "6px", fontSize: "0.82rem" }}>
                    📍 Más cercano: <strong>{nearestAsset.name}</strong><br />
                    📏 Distancia en línea recta: <strong>{nearestAsset.distance} metros</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* MAPA */}
        <section className="map-panel">
          <div ref={mapNodeRef} className="map-canvas" />

          {selectedFeature && (
            <article className="detail-card">
              <div className="detail-header">
                <div>
                  <span className="detail-type">{selectedFeature.properties.tipo}</span>
                  <h2>{selectedFeature.properties.nombre}</h2>
                </div>
                <button type="button" onClick={() => setSelectedId(null)}><X size={16} /></button>
              </div>
              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo)}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Lote / Origen</span><strong>{displayValue(selectedFeature.properties.lote_origen, "QGIS Directo")}</strong></div>
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}

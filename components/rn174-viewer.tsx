"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare,
  CircleDot,
  Clock3,
  Database,
  Layers,
  Layers3,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Square,
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
  };
};

const GEOMETRY_LABELS: Record<GeometryClass, string> = {
  PUNTO: "Puntos",
  LINEA: "Líneas",
  POLIGONO: "Superficies",
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
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>({});
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
        throw new Error("Formato GeoJSON inesperado.");
      }
      setCollection(payload);
      setLoadedAt(new Date());

      // Inicializar todas las capas descubiertas como ACTIVAS
      const initialLayers: Record<string, boolean> = {};
      payload.features.forEach((f) => {
        const layerKey = f.properties.tipo || GEOMETRY_LABELS[geometryClass(f)];
        initialLayers[layerKey] = true;
      });
      setEnabledLayers(initialLayers);

      setSelectedId((current) =>
        current && payload.features.some((f) => f.id === current)
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
    void loadAssets();
  }, [loadAssets]);

  // Lista dinámica de capas basada en los datos reales de Supabase
  const layersList = useMemo(() => {
    const map = new Map<string, { name: string; geometry: GeometryClass; count: number }>();
    (collection?.features ?? []).forEach((f) => {
      const geom = geometryClass(f);
      const name = f.properties.tipo || GEOMETRY_LABELS[geom];
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(name, { name, geometry: geom, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [collection]);

  const toggleLayer = (layerName: string) => {
    setEnabledLayers((prev) => ({
      ...prev,
      [layerName]: !prev[layerName],
    }));
  };

  const visibleFeatures = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return (collection?.features ?? []).filter((feature) => {
      const geom = geometryClass(feature);
      const layerKey = feature.properties.tipo || GEOMETRY_LABELS[geom];
      if (enabledLayers[layerKey] === false) return false;

      const properties = feature.properties;
      const haystack = normalize(
        [
          properties.nombre,
          properties.codigo,
          properties.tipo,
          properties.tipo_codigo,
          properties.familia,
          properties.ruta,
          properties.lote_origen,
        ].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [collection, enabledLayers, query]);

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="route-shield" aria-hidden="true"><span>RN</span><strong>174</strong></div>
          <div><p className="eyebrow">Inventario vial dinámico</p><h1>Visor de capas SIG</h1></div>
        </div>
        <div className="topbar-status">
          <span className="live-dot" aria-hidden="true" />
          <span>Sincronizado con Supabase</span>
          <button className="icon-button" type="button" onClick={() => void loadAssets()} aria-label="Actualizar datos">
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Control de Capas">
          <div className="sidebar-heading">
            <div><p className="section-kicker">Capas del Proyecto</p><h2>Control de Capas (QGIS)</h2></div>
            <span className="total-badge">{visibleFeatures.length} visibles</span>
          </div>

          {/* SELECTOR / ÁRBOL DE CAPAS TIPO QGIS */}
          <div style={{ padding: "0.5rem 1rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px", margin: "0.5rem 1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontWeight: "bold", fontSize: "0.85rem" }}>
              <Layers size={16} /> <span>Capas visibles en el mapa</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {layersList.map((layerItem) => {
                const isActive = enabledLayers[layerItem.name] !== false;
                return (
                  <button
                    key={layerItem.name}
                    type="button"
                    onClick={() => toggleLayer(layerItem.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "inherit",
                      fontSize: "0.85rem",
                      textAlign: "left"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isActive ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="#6b7280" />}
                      <span style={{ color: GEOMETRY_COLORS[layerItem.geometry], fontWeight: 600 }}>●</span>
                      <span>{layerItem.name}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.15)", padding: "2px 6px", borderRadius: "10px" }}>
                      {layerItem.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="search-box">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar elemento por nombre o código..." />
            {query && <button type="button" onClick={() => setQuery("")}><X aria-hidden="true" /></button>}
          </label>

          <div className="asset-list" aria-live="polite">
            {loading && !collection && <div className="loading-state"><p>Consultando Supabase…</p></div>}
            {error && <div className="error-state"><p>{error}</p></div>}
            {visibleFeatures.map((feature) => {
              const properties = feature.properties;
              const geometry = geometryClass(feature);
              const selected = feature.id === selectedId;
              return (
                <button type="button" key={feature.id} className={`asset-card ${selected ? "selected" : ""}`} onClick={() => focusFeature(feature)}>
                  <span className="asset-mark" style={{ "--asset-color": GEOMETRY_COLORS[geometry] } as React.CSSProperties}><AssetMark geometry={geometry} /></span>
                  <span className="asset-copy">
                    <span className="asset-title">{displayValue(properties.nombre, "Activo")}</span>
                    <span className="asset-meta">{displayValue(properties.tipo)} · {GEOMETRY_LABELS[geometry]}</span>
                    <span className="asset-route"><MapPinned aria-hidden="true" /> {displayValue(properties.ruta, "RN174")}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sync-note">
            <Clock3 aria-hidden="true" />
            <span>{loadedAt ? `Actualizado ${loadedAt.toLocaleTimeString()}` : "Esperando datos"}</span>
          </div>
        </aside>

        <section className="map-panel">
          <div ref={mapNodeRef} className="map-canvas" />
          <div className="map-topline">
            <div><ShieldCheck aria-hidden="true" /><span>Visualización Dinámica SIG</span></div>
            <button type="button" onClick={fitAll}><LocateFixed aria-hidden="true" /> Encuadre General</button>
          </div>

          {selectedFeature && (
            <article className="detail-card">
              <div className="detail-header">
                <div><h2>{displayValue(selectedFeature.properties.nombre)}</h2><small>{selectedFeature.properties.tipo}</small></div>
                <button type="button" onClick={() => setSelectedId(null)}><X aria-hidden="true" /></button>
              </div>
              <div className="detail-grid">
                <div><span>Código</span><strong>{displayValue(selectedFeature.properties.codigo)}</strong></div>
                <div><span>Estado</span><strong>{displayValue(selectedFeature.properties.estado_validacion)}</strong></div>
                <div><span>Lote / Origen</span><strong>{displayValue(selectedFeature.properties.lote_origen, "Directo QGIS")}</strong></div>
              </div>
            </article>
          )}

          <a className="osm-link" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap <ArrowUpRight aria-hidden="true" /></a>
        </section>
      </section>
    </main>
  );
}

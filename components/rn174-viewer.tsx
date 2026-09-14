"use client";

import {
  Box,
  ChevronRight,
  CircleDot,
  Database,
  Download,
  FileText,
  Folder,
  Layers3,
  Map as MapIcon,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSON as LeafletGeoJSON,
  Map as LeafletMap,
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
  lote_origen?: string;
  progresiva_m?: number;
  progresiva?: string;
  progresiva_inicio_m?: number;
  progresiva_fin_m?: number;
  desplazamiento_m?: number;
  lado?: string;
  es_preliminar?: boolean;
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
    politica?: string;
  };
};

type BaseMapKey = "SATELITE" | "CALLES";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";

const BASEMAPS: Record<BaseMapKey, { name: string; url: string; attr: string }> = {
  SATELITE: {
    name: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles © Esri",
  },
  CALLES: {
    name: "Calles",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "© OpenStreetMap",
  },
};

const GEOMETRY_COLORS: Record<GeometryClass, string> = {
  PUNTO: "#0ea5e9",
  LINEA: "#f59e0b",
  POLIGONO: "#22c55e",
};

const normalize = (value?: string | number) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function geometryClass(feature: AssetFeature): GeometryClass {
  const declared = feature.properties.geometria;
  if (declared === "PUNTO" || declared === "LINEA" || declared === "POLIGONO") return declared;
  if (feature.geometry.type.includes("Point")) return "PUNTO";
  if (feature.geometry.type.includes("Line")) return "LINEA";
  return "POLIGONO";
}

function display(value: string | number | undefined, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function formatPk(value?: number, label?: string) {
  if (label) return label;
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const km = Math.floor(value / 1000);
  const meters = value - km * 1000;
  const decimals = Math.abs(meters - Math.round(meters)) > 0.001 ? 2 : 0;
  return `PK ${km}+${meters.toFixed(decimals).padStart(decimals ? 6 : 3, "0")}`;
}

function RouteShield() {
  return (
    <div className="rn-shield" aria-label="Ruta Nacional 174">
      <span>RN</span>
      <strong>174</strong>
    </div>
  );
}

export function Rn174Viewer() {
  const [collection, setCollection] = useState<AssetCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapKey>("SATELITE");
  const [layerVisibility, setLayerVisibility] = useState<Record<GeometryClass, boolean>>({
    PUNTO: true,
    LINEA: true,
    POLIGONO: true,
  });

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const assetLayerRef = useRef<LeafletGeoJSON | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const didInitialFit = useRef(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_activos_v32_geojson`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const payload = (await response.json()) as AssetCollection & { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Supabase no respondió correctamente.");
      setCollection(payload);
      setLoadedAt(new Date());
      setSelectedId((current) =>
        current && payload.features.some((feature) => feature.id === current)
          ? current
          : payload.features[0]?.id ?? null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el inventario RN174.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const selectedFeature = useMemo(
    () => collection?.features.find((feature) => feature.id === selectedId) ?? null,
    [collection, selectedId],
  );

  const counts = useMemo(() => {
    const result: Record<GeometryClass, number> = { PUNTO: 0, LINEA: 0, POLIGONO: 0 };
    for (const feature of collection?.features ?? []) result[geometryClass(feature)] += 1;
    return result;
  }, [collection]);

  const searchResults = useMemo(() => {
    const term = normalize(query).trim();
    if (!term) return [];
    return (collection?.features ?? [])
      .filter((feature) => {
        const p = feature.properties;
        const haystack = normalize([
          feature.id,
          p.codigo,
          p.nombre,
          p.tipo_activo,
          p.tipo,
          p.tipo_codigo,
          p.familia,
          p.progresiva,
          p.progresiva_m,
          p.progresiva_inicio_m,
          p.lote_origen,
        ].join(" "));
        return haystack.includes(term);
      })
      .slice(0, 8);
  }, [collection, query]);

  const visibleFeatures = useMemo(
    () => (collection?.features ?? []).filter((feature) => layerVisibility[geometryClass(feature)]),
    [collection, layerVisibility],
  );

  useEffect(() => {
    let active = true;
    async function createMap() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!active || !mapNodeRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapNodeRef.current, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 5,
      }).setView([-32.75, -60.15], 10);
      const tile = L.tileLayer(BASEMAPS.SATELITE.url, {
        maxZoom: 20,
        attribution: BASEMAPS.SATELITE.attr,
      }).addTo(map);
      mapRef.current = map;
      tileRef.current = tile;
    }
    void createMap();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(BASEMAPS[baseMap].url, {
      maxZoom: 20,
      attribution: BASEMAPS[baseMap].attr,
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !collection) return;

    assetLayerRef.current?.remove();
    const layer = L.geoJSON(
      { type: "FeatureCollection", features: visibleFeatures } as never,
      {
        pointToLayer: (rawFeature, latlng) => {
          const feature = rawFeature as AssetFeature;
          const selected = String(feature.id ?? "") === selectedId;
          return L.circleMarker(latlng, {
            radius: selected ? 7 : 3.2,
            color: selected ? "#ffffff" : "#0f172a",
            weight: selected ? 2.5 : 0.8,
            fillColor: selected ? "#ef4444" : GEOMETRY_COLORS.PUNTO,
            fillOpacity: selected ? 1 : 0.88,
          });
        },
        style: (rawFeature) => {
          const feature = rawFeature as AssetFeature;
          const geometry = geometryClass(feature);
          const selected = String(feature.id ?? "") === selectedId;
          return {
            color: selected ? "#ef4444" : GEOMETRY_COLORS[geometry],
            fillColor: selected ? "#ef4444" : GEOMETRY_COLORS[geometry],
            fillOpacity: geometry === "POLIGONO" ? (selected ? 0.42 : 0.18) : 0,
            weight: selected ? 5 : geometry === "LINEA" ? 2.5 : 1.5,
            opacity: 0.95,
          };
        },
        onEachFeature: (rawFeature, leafletLayer) => {
          const feature = rawFeature as AssetFeature;
          leafletLayer.on("click", () => setSelectedId(String(feature.id ?? "")));
          leafletLayer.bindTooltip(feature.properties.nombre ?? feature.properties.codigo ?? "Activo RN174", {
            sticky: true,
            direction: "top",
          });
        },
      },
    ).addTo(map);

    assetLayerRef.current = layer;
    if (!didInitialFit.current) {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.08));
        didInitialFit.current = true;
      }
    }
  }, [collection, selectedId, visibleFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !selectedFeature || !didInitialFit.current) return;
    const selection = L.geoJSON(selectedFeature as never);
    const bounds = selection.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.5), { maxZoom: 16 });
  }, [selectedFeature]);

  const selectSearchResult = (feature: AssetFeature) => {
    setSelectedId(feature.id ?? null);
    setQuery("");
  };

  const resetLayers = () => setLayerVisibility({ PUNTO: true, LINEA: true, POLIGONO: true });

  const downloadSelected = () => {
    if (!selectedFeature) return;
    const blob = new Blob([JSON.stringify(selectedFeature, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedFeature.properties.codigo ?? selectedFeature.id ?? "RN174_activo"}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const p = selectedFeature?.properties;
  const selectedGeometry = selectedFeature ? geometryClass(selectedFeature) : null;
  const selectedAssetId = selectedFeature?.id ?? p?.codigo ?? "Sin activo seleccionado";
  const selectedType = p?.tipo_activo ?? p?.tipo ?? p?.tipo_codigo ?? "Activo vial";
  const selectedPk = formatPk(p?.progresiva_inicio_m ?? p?.progresiva_m, p?.progresiva);

  return (
    <main className="cde-shell">
      <header className="cde-topbar">
        <div className="cde-brand">
          <RouteShield />
          <div>
            <div className="cde-brand-line">
              <strong>RN0174</strong>
              <span>Tramo Conexión Rosario - Victoria</span>
            </div>
            <small>Gestión sincronizada: GIS ↔ IFC ↔ CDE · Estado 0 V3.2</small>
          </div>
        </div>

        <div className="global-search-wrap">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0]) selectSearchResult(searchResults[0]);
            }}
            placeholder="Buscar ID de activo, progresiva, tipo, código..."
          />
          {query && (
            <div className="global-search-results">
              {searchResults.length ? searchResults.map((feature) => (
                <button key={feature.id} type="button" onClick={() => selectSearchResult(feature)}>
                  <span>{feature.properties.codigo ?? feature.id}</span>
                  <strong>{feature.properties.nombre ?? feature.properties.tipo_activo ?? "Activo RN174"}</strong>
                  <small>{formatPk(feature.properties.progresiva_inicio_m ?? feature.properties.progresiva_m, feature.properties.progresiva)}</small>
                </button>
              )) : <div className="search-empty">Sin coincidencias</div>}
            </div>
          )}
        </div>

        <div className="cde-status-zone">
          <div className="sync-badge"><Database size={14} /> Supabase V3.2</div>
          <button className="refresh-button" type="button" onClick={() => void loadAssets()} title="Actualizar inventario">
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <section className="cde-workspace">
        <article className="work-panel gis-panel">
          <div className="panel-titlebar">
            <div><MapIcon size={15} /><strong>1. PANTALLA GIS</strong><span>Inventario georreferenciado</span></div>
            <small>WGS84 / Web Mercator</small>
          </div>
          <div className="panel-body map-body">
            <div ref={mapNodeRef} className="gis-map" />

            <div className="map-layer-card">
              <div className="layer-card-title"><Layers3 size={15} /><strong>Capas RN174</strong></div>
              {(["PUNTO", "LINEA", "POLIGONO"] as GeometryClass[]).map((geometry) => (
                <label key={geometry} className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={layerVisibility[geometry]}
                    onChange={() => setLayerVisibility((current) => ({ ...current, [geometry]: !current[geometry] }))}
                  />
                  <i style={{ background: GEOMETRY_COLORS[geometry] }} />
                  <span>{geometry === "PUNTO" ? "Activos puntuales" : geometry === "LINEA" ? "Activos lineales" : "Activos superficiales"}</span>
                  <b>{counts[geometry]}</b>
                </label>
              ))}
              <button type="button" className="layer-reset" onClick={resetLayers}>Mostrar todas</button>
            </div>

            <div className="map-switcher">
              {(Object.keys(BASEMAPS) as BaseMapKey[]).map((key) => (
                <button key={key} type="button" className={baseMap === key ? "active" : ""} onClick={() => setBaseMap(key)}>{BASEMAPS[key].name}</button>
              ))}
            </div>

            {selectedFeature && (
              <div className="gis-selection-card">
                <div className="selection-card-top">
                  <strong>{display(p?.codigo, selectedAssetId)}</strong>
                  <span>{selectedPk}</span>
                </div>
                <h3>{display(p?.nombre, selectedType)}</h3>
                <dl>
                  <div><dt>Familia</dt><dd>{display(p?.familia)}</dd></div>
                  <div><dt>Estado</dt><dd>{display(p?.estado_validacion)}</dd></div>
                  <div><dt>Fuente</dt><dd>{display(p?.lote_origen)}</dd></div>
                </dl>
                <div className="selection-sync">Activo sincronizado en GIS · IFC · CDE <ChevronRight size={14} /></div>
              </div>
            )}

            {error && <div className="map-error">{error}</div>}
          </div>
        </article>

        <article className="work-panel bim-panel">
          <div className="panel-titlebar">
            <div><Box size={15} /><strong>2. PANTALLA IFC 3D</strong><span>BIM / Gemelo digital</span></div>
            <small>Modelo vinculado: 0</small>
          </div>
          <div className="panel-body bim-stage">
            <div className="bim-grid" />
            <div className="bim-axis axis-a" />
            <div className="bim-axis axis-b" />
            <div className="bim-axis axis-c" />
            <div className="bim-placeholder">
              <div className="bim-placeholder-icon"><Box size={30} /></div>
              <span>ENTORNO BIM PREPARADO</span>
              <h2>Modelo IFC no vinculado</h2>
              <p>El activo GIS está seleccionado y listo para enlazarse mediante <b>asset_id</b>. No se muestra geometría 3D ficticia.</p>
              <div className="bim-id">{selectedAssetId}</div>
            </div>
            <div className="bim-toolbar">
              <button className="active" type="button">3D</button>
              <button type="button" disabled>Planta</button>
              <button type="button" disabled>Alzado</button>
              <button type="button" disabled>Sección</button>
            </div>
          </div>
        </article>

        <article className="work-panel docs-panel">
          <div className="panel-titlebar cde-titlebar">
            <div><Folder size={15} /><strong>3. PANTALLA CDE</strong><span>Árbol documental</span></div>
            <small>CDE · Gestión de información</small>
          </div>
          <div className="panel-body docs-body">
            <section className="tree-card">
              <div className="tree-heading"><Folder size={15} /><strong>CDE_RN174_MASTER</strong></div>
              <div className="tree-node level-1"><ChevronRight size={13} /><Folder size={14} /><span>01_MODELOS_BIM</span><em>0 vinculados</em></div>
              <div className="tree-node level-1"><ChevronRight size={13} /><Folder size={14} /><span>02_PROYECTO_Y_CONFORME_A_OBRA</span><em>sin publicar</em></div>
              <div className="tree-node level-1 open"><ChevronRight size={13} /><Folder size={14} /><span>03_FUENTES_E_INVENTARIOS</span></div>
              <div className="tree-node level-2 active"><FileText size={14} /><span>{display(p?.lote_origen, "Sin lote documental")}</span><em>fuente GIS</em></div>
              <div className="tree-node level-1 open"><ChevronRight size={13} /><Folder size={14} /><span>04_ACTIVOS_RN174</span></div>
              <div className="tree-node level-2 active"><CircleDot size={14} /><span>{selectedAssetId}</span><em>{selectedType}</em></div>
            </section>

            <section className="doc-inspector">
              <div className="doc-inspector-head">
                <div><FileText size={15} /><strong>FICHA DEL ACTIVO · V3.2</strong></div>
                <span className="published-pill">GIS ACTIVO</span>
              </div>
              <table>
                <tbody>
                  <tr><th>ID de activo</th><td>{selectedAssetId}</td></tr>
                  <tr><th>Código</th><td>{display(p?.codigo)}</td></tr>
                  <tr><th>Familia / tipo</th><td>{display(p?.familia)} · {selectedType}</td></tr>
                  <tr><th>Progresiva</th><td>{selectedPk}</td></tr>
                  <tr><th>Geometría</th><td>{selectedGeometry ?? "—"}</td></tr>
                  <tr><th>Lado</th><td>{display(p?.lado)}</td></tr>
                  <tr><th>Estado validación</th><td className="good-value">{display(p?.estado_validacion)}</td></tr>
                  <tr><th>Calidad del dato</th><td>{display(p?.calidad_dato)}</td></tr>
                  <tr><th>Método posición</th><td>{display(p?.metodo_posicion)}</td></tr>
                  <tr><th>Precisión</th><td>{p?.precision_m !== undefined ? `${p.precision_m} m` : "—"}</td></tr>
                  <tr><th>Fuente / lote</th><td>{display(p?.lote_origen)}</td></tr>
                </tbody>
              </table>
              <div className="doc-note">
                <strong>Estado documental</strong>
                <p>{p?.observaciones ? p.observaciones : "No hay documento CDE vinculado a este activo en la salida pública actual."}</p>
              </div>
            </section>
          </div>
        </article>
      </section>

      <footer className="asset-dock">
        <div className="dock-identity">
          <strong>{selectedAssetId}</strong>
          <small>{display(p?.codigo)} · {selectedType}</small>
        </div>
        <div className="dock-field"><span>PROGRESIVA</span><b>{selectedPk}</b><small>{display(p?.estado_validacion)}</small></div>
        <div className="dock-field"><span>FAMILIA</span><b>{display(p?.familia)}</b><small>{selectedGeometry ?? "—"}</small></div>
        <div className="dock-field"><span>FUENTE</span><b>{display(p?.lote_origen)}</b><small>{display(p?.calidad_dato)}</small></div>
        <div className="dock-field"><span>SINCRONIZACIÓN</span><b>{loading ? "ACTUALIZANDO" : "GIS ACTIVO"}</b><small>{loadedAt ? loadedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></div>
        <button type="button" className="dock-download" onClick={downloadSelected} disabled={!selectedFeature}><Download size={15} /> Descargar activo</button>
      </footer>
    </main>
  );
}

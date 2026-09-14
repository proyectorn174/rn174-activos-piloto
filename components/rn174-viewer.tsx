"use client";

import {
  AlertTriangle,
  Box,
  ChevronRight,
  CircleDot,
  Crosshair,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Folder,
  Layers3,
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  GeoJSON as LeafletGeoJSON,
  LeafletMouseEvent,
  Map as LeafletMap,
  Polyline as LeafletPolyline,
  TileLayer,
} from "leaflet";
import type { Camera, Scene, WebGLRenderer } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type GeometryClass = "PUNTO" | "LINEA" | "POLIGONO";
type BaseMapKey = "SATELITE" | "CALLES";
type BimView = "3D" | "PLANTA" | "ALZADO";

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
  atributos?: Record<string, unknown>;
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
    estado_publicacion?: string;
    advertencia?: string;
  };
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";

const IFC_URL = "./models/RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc";

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
  if (label) return label.startsWith("PK") ? label : `PK ${label}`;
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const km = Math.floor(value / 1000);
  const meters = value - km * 1000;
  return `PK ${km}+${meters.toFixed(2).padStart(6, "0")}`;
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function coordinatesText(coords: unknown) {
  const tuple = coords as number[];
  return `${tuple[0]},${tuple[1]}${tuple.length > 2 ? `,${tuple[2]}` : ",0"}`;
}

function lineCoordinates(coords: unknown) {
  return (coords as number[][]).map((item) => coordinatesText(item)).join(" ");
}

function geometryToKml(geometry: AssetFeature["geometry"]): string {
  const c = geometry.coordinates as any;
  switch (geometry.type) {
    case "Point":
      return `<Point><coordinates>${coordinatesText(c)}</coordinates></Point>`;
    case "MultiPoint":
      return `<MultiGeometry>${c.map((p: unknown) => `<Point><coordinates>${coordinatesText(p)}</coordinates></Point>`).join("")}</MultiGeometry>`;
    case "LineString":
      return `<LineString><tessellate>1</tessellate><coordinates>${lineCoordinates(c)}</coordinates></LineString>`;
    case "MultiLineString":
      return `<MultiGeometry>${c.map((l: unknown) => `<LineString><tessellate>1</tessellate><coordinates>${lineCoordinates(l)}</coordinates></LineString>`).join("")}</MultiGeometry>`;
    case "Polygon": {
      const rings = c as number[][][];
      const outer = rings[0] ?? [];
      const inners = rings.slice(1);
      return `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${lineCoordinates(outer)}</coordinates></LinearRing></outerBoundaryIs>${inners.map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${lineCoordinates(ring)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`;
    }
    case "MultiPolygon":
      return `<MultiGeometry>${(c as number[][][][]).map((polygon) => geometryToKml({ type: "Polygon", coordinates: polygon })).join("")}</MultiGeometry>`;
    default:
      return "";
  }
}

function featureToKml(feature: AssetFeature) {
  const p = feature.properties;
  const name = p.nombre ?? p.codigo ?? feature.id ?? "Activo RN174";
  const description = [
    ["asset_id", feature.id],
    ["codigo", p.codigo],
    ["tipo", p.tipo_activo ?? p.tipo],
    ["familia", p.familia],
    ["ruta", p.ruta],
    ["progresiva", p.progresiva ?? p.progresiva_inicio_m],
    ["progresiva_fin_m", p.progresiva_fin_m],
    ["lado", p.lado],
    ["estado_validacion", p.estado_validacion],
    ["calidad_dato", p.calidad_dato],
    ["precision_m", p.precision_m],
    ["metodo_posicion", p.metodo_posicion],
    ["lote_origen", p.lote_origen],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(name)}</name>
  <Placemark>
    <name>${escapeXml(name)}</name>
    <description><![CDATA[${description}]]></description>
    ${geometryToKml(feature.geometry)}
  </Placemark>
</Document>
</kml>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [filterType, setFilterType] = useState("TODOS");
  const [filterState, setFilterState] = useState("TODOS");
  const [pkFrom, setPkFrom] = useState("");
  const [pkTo, setPkTo] = useState("");
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureDistance, setMeasureDistance] = useState(0);
  const [measurePoints, setMeasurePoints] = useState<Array<[number, number]>>([]);
  const [bimView, setBimView] = useState<BimView>("3D");
  const [autoRotate, setAutoRotate] = useState(false);
  const [bimResetNonce, setBimResetNonce] = useState(0);
  const [panelWidths, setPanelWidths] = useState<[number, number, number]>([34, 33, 33]);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const assetLayerRef = useRef<LeafletGeoJSON | null>(null);
  const measureLayerRef = useRef<LeafletPolyline | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const didInitialFit = useRef(false);

  const threeNodeRef = useRef<HTMLDivElement | null>(null);
  const threeSceneRef = useRef<Scene | null>(null);
  const threeCameraRef = useRef<Camera | null>(null);
  const threeRendererRef = useRef<WebGLRenderer | null>(null);
  const threeControlsRef = useRef<OrbitControls | null>(null);

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

  const assetTypes = useMemo(() => {
    const values = new Set<string>();
    for (const feature of collection?.features ?? []) {
      const value = feature.properties.tipo_activo ?? feature.properties.tipo;
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "es"));
  }, [collection]);

  const validationStates = useMemo(() => {
    const values = new Set<string>();
    for (const feature of collection?.features ?? []) {
      if (feature.properties.estado_validacion) values.add(feature.properties.estado_validacion);
    }
    return Array.from(values).sort();
  }, [collection]);

  const bridgeFeature = useMemo(() => {
    const candidates = collection?.features ?? [];
    return (
      candidates.find((feature) => normalize(`${feature.properties.nombre} ${feature.properties.tipo_activo}`).includes("puente principal")) ??
      candidates.find((feature) => normalize(`${feature.properties.nombre} ${feature.properties.tipo_activo}`).includes("nuestra senora del rosario")) ??
      candidates.find((feature) => geometryClass(feature) === "POLIGONO" && normalize(feature.properties.tipo_activo).includes("puente")) ??
      null
    );
  }, [collection]);

  const filteredFeatures = useMemo(() => {
    const from = pkFrom.trim() === "" ? null : Number(pkFrom);
    const to = pkTo.trim() === "" ? null : Number(pkTo);
    return (collection?.features ?? []).filter((feature) => {
      const geometry = geometryClass(feature);
      const p = feature.properties;
      if (!layerVisibility[geometry]) return false;
      const type = p.tipo_activo ?? p.tipo ?? "";
      if (filterType !== "TODOS" && type !== filterType) return false;
      if (filterState !== "TODOS" && p.estado_validacion !== filterState) return false;
      const start = p.progresiva_inicio_m ?? p.progresiva_m;
      const end = p.progresiva_fin_m ?? start;
      if (from !== null && Number.isFinite(from) && (end === undefined || end < from)) return false;
      if (to !== null && Number.isFinite(to) && (start === undefined || start > to)) return false;
      return true;
    });
  }, [collection, layerVisibility, filterState, filterType, pkFrom, pkTo]);

  const counts = useMemo(() => {
    const total: Record<GeometryClass, number> = { PUNTO: 0, LINEA: 0, POLIGONO: 0 };
    const visible: Record<GeometryClass, number> = { PUNTO: 0, LINEA: 0, POLIGONO: 0 };
    for (const feature of collection?.features ?? []) total[geometryClass(feature)] += 1;
    for (const feature of filteredFeatures) visible[geometryClass(feature)] += 1;
    return { total, visible };
  }, [collection, filteredFeatures]);

  const searchResults = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
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
          p.progresiva_fin_m,
          p.lado,
          p.estado_validacion,
          p.lote_origen,
        ].join(" "));
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 10);
  }, [collection, query]);

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
      { type: "FeatureCollection", features: filteredFeatures } as never,
      {
        pointToLayer: (rawFeature, latlng) => {
          const feature = rawFeature as AssetFeature;
          const selected = String(feature.id ?? "") === selectedId;
          return L.circleMarker(latlng, {
            radius: selected ? 7 : 3,
            color: selected ? "#ffffff" : "#0f172a",
            weight: selected ? 2.5 : 0.7,
            fillColor: selected ? "#ef4444" : GEOMETRY_COLORS.PUNTO,
            fillOpacity: selected ? 1 : 0.82,
          });
        },
        style: (rawFeature) => {
          const feature = rawFeature as AssetFeature;
          const geometry = geometryClass(feature);
          const selected = String(feature.id ?? "") === selectedId;
          return {
            color: selected ? "#ef4444" : GEOMETRY_COLORS[geometry],
            fillColor: selected ? "#ef4444" : GEOMETRY_COLORS[geometry],
            fillOpacity: geometry === "POLIGONO" ? (selected ? 0.46 : 0.18) : 0,
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
  }, [collection, filteredFeatures, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !selectedFeature || measureEnabled) return;
    const selection = L.geoJSON(selectedFeature as never);
    const bounds = selection.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.5), { maxZoom: 17 });
  }, [selectedFeature, measureEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clickHandler = (event: LeafletMouseEvent) => {
      if (!measureEnabled) return;
      setMeasurePoints((current) => [...current, [event.latlng.lat, event.latlng.lng]]);
    };
    map.on("click", clickHandler);
    return () => {
      map.off("click", clickHandler);
    };
  }, [measureEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    measureLayerRef.current?.remove();
    measureLayerRef.current = null;
    if (measurePoints.length < 2) {
      setMeasureDistance(0);
      return;
    }
    const latLngs = measurePoints.map(([lat, lng]) => L.latLng(lat, lng));
    const line = L.polyline(latLngs, { color: "#ef4444", weight: 3, dashArray: "7 6" }).addTo(map);
    measureLayerRef.current = line;
    let total = 0;
    for (let index = 1; index < latLngs.length; index += 1) {
      total += latLngs[index - 1].distanceTo(latLngs[index]);
    }
    setMeasureDistance(total);
  }, [measurePoints]);

  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 30);
    return () => window.clearTimeout(timer);
  }, [panelWidths]);

  const clearMeasure = useCallback(() => {
    measureLayerRef.current?.remove();
    measureLayerRef.current = null;
    setMeasurePoints([]);
    setMeasureDistance(0);
  }, []);

  const fitVisible = useCallback(() => {
    const map = mapRef.current;
    const layer = assetLayerRef.current;
    if (!map || !layer) return;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.08), { maxZoom: 16 });
  }, []);

  const resetFilters = useCallback(() => {
    setLayerVisibility({ PUNTO: true, LINEA: true, POLIGONO: true });
    setFilterType("TODOS");
    setFilterState("TODOS");
    setPkFrom("");
    setPkTo("");
  }, []);

  const selectSearchResult = (feature: AssetFeature) => {
    setSelectedId(feature.id ?? null);
    setQuery("");
  };

  const selectBridge = () => {
    if (bridgeFeature?.id) setSelectedId(bridgeFeature.id);
  };

  const startResize = (divider: 0 | 1, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = [...panelWidths] as [number, number, number];
    document.body.classList.add("panel-resizing");

    const onMove = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
      if (divider === 0) {
        const pair = start[0] + start[1];
        const first = Math.max(18, Math.min(pair - 18, start[0] + delta));
        setPanelWidths([first, pair - first, start[2]]);
      } else {
        const pair = start[1] + start[2];
        const second = Math.max(18, Math.min(pair - 18, start[1] + delta));
        setPanelWidths([start[0], second, pair - second]);
      }
    };

    const onUp = () => {
      document.body.classList.remove("panel-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const downloadGeoJson = () => {
    if (!selectedFeature) return;
    const filename = safeName(selectedFeature.properties.codigo ?? selectedFeature.id ?? "RN174_activo");
    downloadBlob(
      new Blob([JSON.stringify(selectedFeature, null, 2)], { type: "application/geo+json" }),
      `${filename}.geojson`,
    );
  };

  const downloadKml = () => {
    if (!selectedFeature) return;
    const filename = safeName(selectedFeature.properties.codigo ?? selectedFeature.id ?? "RN174_activo");
    downloadBlob(
      new Blob([featureToKml(selectedFeature)], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" }),
      `${filename}.kml`,
    );
  };

  const downloadKmz = async () => {
    if (!selectedFeature) return;
    const filename = safeName(selectedFeature.properties.codigo ?? selectedFeature.id ?? "RN174_activo");
    const JSZipModule = await import("jszip");
    const zip = new JSZipModule.default();
    zip.file("doc.kml", featureToKml(selectedFeature));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    downloadBlob(blob, `${filename}.kmz`);
  };

  const downloadXlsx = async () => {
    if (!selectedFeature) return;
    const XLSX = await import("xlsx");
    const p = selectedFeature.properties;
    const filename = safeName(p.codigo ?? selectedFeature.id ?? "RN174_activo");
    const row = {
      asset_id: selectedFeature.id ?? "",
      codigo: p.codigo ?? "",
      nombre: p.nombre ?? "",
      ruta: p.ruta ?? "RN174",
      familia: p.familia ?? "",
      tipo_codigo: p.tipo_codigo ?? "",
      tipo_activo: p.tipo_activo ?? p.tipo ?? "",
      geometria: geometryClass(selectedFeature),
      progresiva: p.progresiva ?? "",
      progresiva_inicio_m: p.progresiva_inicio_m ?? p.progresiva_m ?? "",
      progresiva_fin_m: p.progresiva_fin_m ?? "",
      desplazamiento_m: p.desplazamiento_m ?? "",
      lado: p.lado ?? "",
      estado_existencia: p.origen_existencia ?? "",
      estado_ciclo_vida: p.estado_ciclo_vida ?? "",
      estado_validacion: p.estado_validacion ?? "",
      calidad_dato: p.calidad_dato ?? "",
      precision_m: p.precision_m ?? "",
      metodo_posicion: p.metodo_posicion ?? "",
      lote_origen: p.lote_origen ?? "",
      actualizado_en: p.actualizado_en ?? "",
      observaciones: p.observaciones ?? "",
      es_preliminar: p.es_preliminar ?? false,
    };
    const wb = XLSX.utils.book_new();
    const ficha = XLSX.utils.json_to_sheet([row]);
    ficha["!cols"] = Object.keys(row).map((key) => ({ wch: Math.max(15, key.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ficha, "Ficha activo");

    const geom = XLSX.utils.json_to_sheet([
      {
        tipo_geometria: selectedFeature.geometry.type,
        geojson: JSON.stringify(selectedFeature.geometry),
      },
    ]);
    geom["!cols"] = [{ wch: 22 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, geom, "Geometria");

    XLSX.writeFile(wb, `${filename}_ficha.xlsx`);
  };

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    async function buildBridgeScene() {
      const node = threeNodeRef.current;
      if (!node) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !threeNodeRef.current) return;

      node.replaceChildren();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef3f8);
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 4000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      node.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.7;
      controls.target.set(0, 18, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8794, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 2.3);
      sun.position.set(220, 340, 180);
      sun.castShadow = true;
      scene.add(sun);

      const group = new THREE.Group();
      group.name = "RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR";
      scene.add(group);

      const concrete = new THREE.MeshStandardMaterial({ color: 0xd6dce4, roughness: 0.72, metalness: 0.04 });
      const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x44566c, roughness: 0.64, metalness: 0.13 });
      const cableMaterial = new THREE.LineBasicMaterial({ color: 0x8293a7 });
      const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.8 });

      const deck = new THREE.Mesh(new THREE.BoxGeometry(608, 3, 22.8), deckMaterial);
      deck.position.set(0, 0, 0);
      deck.receiveShadow = true;
      deck.castShadow = true;
      group.add(deck);

      for (const z of [-10.9, 0, 10.9]) {
        const barrier = new THREE.Mesh(new THREE.BoxGeometry(608, 1.1, 0.55), barrierMaterial);
        barrier.position.set(0, 2.05, z);
        barrier.castShadow = true;
        group.add(barrier);
      }

      const createPier = (x: number, height: number, width: number, depth: number) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), concrete);
        pier.position.set(x, -height / 2 + 0.5, 0);
        pier.castShadow = true;
        pier.receiveShadow = true;
        group.add(pier);
      };

      createPier(-295, 52, 8, 14);
      createPier(295, 52, 8, 14);

      for (const x of [-175, 175]) {
        for (const z of [-7, 7]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(5, 126, 4), concrete);
          leg.position.set(x, 12.5, z);
          leg.castShadow = true;
          group.add(leg);
        }
        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 18), concrete);
        topBeam.position.set(x, 74, 0);
        topBeam.castShadow = true;
        group.add(topBeam);
      }

      const addCable = (xTower: number, z: number, xDeck: number) => {
        const points = [new THREE.Vector3(xTower, 72, z), new THREE.Vector3(xDeck, 2.2, z)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geometry, cableMaterial));
      };

      const stayOffsets = [22, 42, 62, 82, 102, 122, 142, 158];
      for (const z of [-8.6, 8.6]) {
        for (const d of stayOffsets) {
          addCable(-175, z, Math.max(-304, -175 - d));
          addCable(-175, z, Math.min(0, -175 + d));
          addCable(175, z, Math.max(0, 175 - d));
          addCable(175, z, Math.min(304, 175 + d));
        }
      }

      const grid = new THREE.GridHelper(850, 34, 0x9aa9b9, 0xc6d0da);
      grid.position.y = -54;
      scene.add(grid);

      if (bimView === "PLANTA") camera.position.set(0, 650, 0.1);
      else if (bimView === "ALZADO") camera.position.set(0, 70, 650);
      else camera.position.set(410, 175, 390);
      camera.lookAt(0, 18, 0);
      controls.target.set(0, 18, 0);
      controls.update();

      const resize = () => {
        const width = node.clientWidth;
        const height = node.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(node);

      const animate = () => {
        controls.autoRotate = autoRotate;
        controls.update();
        renderer.render(scene, camera);
        animationFrame = requestAnimationFrame(animate);
      };
      animate();

      threeSceneRef.current = scene;
      threeCameraRef.current = camera;
      threeRendererRef.current = renderer;
      threeControlsRef.current = controls;
    }

    void buildBridgeScene();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      threeControlsRef.current?.dispose();
      threeRendererRef.current?.dispose();
      threeSceneRef.current = null;
      threeCameraRef.current = null;
      threeRendererRef.current = null;
      threeControlsRef.current = null;
    };
  }, [autoRotate, bimResetNonce, bimView]);

  const p = selectedFeature?.properties;
  const selectedGeometry = selectedFeature ? geometryClass(selectedFeature) : null;
  const selectedAssetId = selectedFeature?.id ?? p?.codigo ?? "Sin activo seleccionado";
  const selectedType = p?.tipo_activo ?? p?.tipo ?? p?.tipo_codigo ?? "Activo vial";
  const selectedPk = formatPk(p?.progresiva_inicio_m ?? p?.progresiva_m, p?.progresiva);
  const bridgeSelected = Boolean(bridgeFeature?.id && selectedFeature?.id === bridgeFeature.id);
  const visibleTotal = filteredFeatures.length;
  const datasetTotal = collection?.features.length ?? 0;

  return (
    <main className="cde-shell">
      <style>{`
        .cde-shell{grid-template-rows:64px 32px minmax(0,1fr) 88px!important}
        .cde-topbar{font-size:13px!important}
        .cde-brand-line strong{font-size:16px!important}.cde-brand-line span{font-size:13px!important}.cde-brand small{font-size:11px!important}
        .global-search-wrap{height:39px!important}.global-search-wrap input{font-size:13px!important}
        .global-search-results button span{font-size:11px!important}.global-search-results button strong{font-size:12px!important}.global-search-results button small{font-size:10.5px!important}
        .sync-badge{font-size:11px!important}.preliminary-strip,.preliminary-strip strong{font-size:10.5px!important}
        .panel-titlebar{height:40px!important;font-size:11.5px!important}.panel-titlebar strong{font-size:12.5px!important}.panel-titlebar span{font-size:11px!important}.panel-titlebar small{font-size:10px!important}
        .work-panel{grid-template-rows:40px minmax(0,1fr)!important;border-right:0!important}
        .gis-tools-card{width:276px!important}.tools-heading{font-size:12px!important}.layer-toggle{min-height:30px!important;font-size:10.5px!important}.layer-toggle b{font-size:10px!important}
        .filter-block label>span{font-size:9.5px!important}.filter-block select,.filter-block input{height:31px!important;font-size:10.5px!important}
        .gis-tool-buttons button{font-size:9.5px!important;padding:7px 4px!important}.measure-readout{font-size:10px!important}.measure-readout button{font-size:9px!important}
        .map-switcher button{font-size:10px!important}.map-hint{font-size:9.5px!important}
        .gis-selection-card{width:310px!important}.selection-card-top strong{font-size:11px!important}.selection-card-top span{font-size:10.5px!important}.gis-selection-card h3{font-size:13px!important}.gis-selection-card dt{font-size:9.5px!important}.gis-selection-card dd{font-size:10px!important}.selection-sync{font-size:9.5px!important}
        .bim-model-badge strong{font-size:10.5px!important}.bim-model-badge span{font-size:9.5px!important}.bim-provenance{font-size:9.5px!important}.bim-provenance strong{font-size:10.5px!important}
        .bim-actions button,.bim-actions a{height:31px!important;font-size:9.5px!important}.bim-toolbar button{font-size:9.5px!important}
        .tree-heading{font-size:11px!important}.tree-node{min-height:31px!important;font-size:9.8px!important}.tree-node em{font-size:9px!important}
        .doc-inspector-head{font-size:11px!important}.doc-inspector table{font-size:10px!important}.doc-inspector th,.doc-inspector td{padding:5px 7px!important}
        .doc-note,.bridge-document-card{font-size:10px!important}
        .asset-dock{font-size:10.5px!important}.dock-identity strong{font-size:12px!important}.dock-field span{font-size:9px!important}.dock-field b{font-size:10.5px!important}.dock-field small{font-size:9.5px!important}
        .panel-resizer{position:relative;z-index:1500;cursor:col-resize;background:#d6dee8;box-shadow:inset 1px 0 #fff,inset -1px 0 #fff;touch-action:none}
        .panel-resizer::after{content:"⋮";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:18px;height:44px;display:grid;place-items:center;color:#64748b;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;font-size:24px;line-height:1}
        .panel-resizer:hover,.panel-resizing .panel-resizer{background:#0b7acb}.panel-resizing{cursor:col-resize!important;user-select:none!important}
        .download-group{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.download-group button{display:inline-flex;align-items:center;gap:4px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#334155;font-size:10px;font-weight:750;cursor:pointer}
        .download-group button:hover{background:#0b7acb;color:#fff;border-color:#0b7acb}.download-group button:disabled{opacity:.45;cursor:not-allowed}
        .asset-dock .download-group{justify-content:flex-end}.asset-dock .download-group button{padding:8px 10px}
        @media(max-width:1180px){.gis-tools-card{width:250px!important}.asset-dock .dock-field:nth-of-type(3){display:none}}
      `}</style>

      <header className="cde-topbar">
        <div className="cde-brand">
          <RouteShield />
          <div>
            <div className="cde-brand-line">
              <strong>RN0174</strong>
              <span>Conexión Rosario - Victoria</span>
            </div>
            <small>Gestión sincronizada GIS ↔ IFC4.3 ↔ CDE · Estado 0 V3.2</small>
          </div>
        </div>

        <div className="global-search-wrap">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0]) selectSearchResult(searchResults[0]);
            }}
            placeholder="Buscar asset_id, código, nombre, PK, tipo, lote..."
          />
          {query && (
            <button className="search-clear" type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={15} /></button>
          )}
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
          <div className="sync-badge"><Database size={15} /> Supabase V3.2 · {datasetTotal}</div>
          <button className="refresh-button" type="button" onClick={() => void loadAssets()} title="Actualizar inventario">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <div className="preliminary-strip">
        <AlertTriangle size={14} />
        <strong>PUBLICACIÓN ABIERTA TEMPORAL:</strong>
        <span>se muestran datos BORRADOR / EN REVISIÓN / APROBADOS. Visible no significa validado.</span>
      </div>

      <section
        className="cde-workspace"
        style={{
          gridTemplateColumns: `${panelWidths[0]}fr 8px ${panelWidths[1]}fr 8px ${panelWidths[2]}fr`,
        }}
      >
        <article className="work-panel gis-panel">
          <div className="panel-titlebar">
            <div><MapIcon size={17} /><strong>1. PANTALLA GIS</strong><span>Inventario georreferenciado</span></div>
            <small>{visibleTotal} visibles / {datasetTotal} total</small>
          </div>
          <div className="panel-body map-body">
            <div ref={mapNodeRef} className={`gis-map ${measureEnabled ? "measure-mode" : ""}`} />

            <div className="gis-tools-card">
              <div className="tools-heading"><Layers3 size={16} /><strong>Capas y filtros RN174</strong></div>
              {(["PUNTO", "LINEA", "POLIGONO"] as GeometryClass[]).map((geometry) => (
                <label key={geometry} className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={layerVisibility[geometry]}
                    onChange={() => setLayerVisibility((current) => ({ ...current, [geometry]: !current[geometry] }))}
                  />
                  <i style={{ background: GEOMETRY_COLORS[geometry] }} />
                  <span>{geometry === "PUNTO" ? "Puntos" : geometry === "LINEA" ? "Líneas" : "Superficies"}</span>
                  <b>{counts.visible[geometry]} / {counts.total[geometry]}</b>
                </label>
              ))}

              <div className="filter-block">
                <label><span>Tipo de activo</span>
                  <select value={filterType} onChange={(event) => setFilterType(event.target.value)}>
                    <option value="TODOS">Todos</option>
                    {assetTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label><span>Estado validación</span>
                  <select value={filterState} onChange={(event) => setFilterState(event.target.value)}>
                    <option value="TODOS">Todos</option>
                    {validationStates.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <div className="pk-filter-row">
                  <label><span>PK desde [m]</span><input value={pkFrom} onChange={(event) => setPkFrom(event.target.value)} inputMode="decimal" placeholder="0" /></label>
                  <label><span>PK hasta [m]</span><input value={pkTo} onChange={(event) => setPkTo(event.target.value)} inputMode="decimal" placeholder="60000" /></label>
                </div>
              </div>

              <div className="gis-tool-buttons">
                <button type="button" onClick={fitVisible}><Maximize2 size={14} /> Encuadrar</button>
                <button
                  type="button"
                  className={measureEnabled ? "active" : ""}
                  onClick={() => {
                    setMeasureEnabled((value) => !value);
                    if (measureEnabled) clearMeasure();
                  }}
                ><Ruler size={14} /> Medir</button>
                <button type="button" onClick={resetFilters}><Filter size={14} /> Limpiar</button>
              </div>

              {measureEnabled && (
                <div className="measure-readout">
                  <Ruler size={14} />
                  <span>{measurePoints.length < 2 ? "Haga clic en 2 o más puntos" : measureDistance >= 1000 ? `${(measureDistance / 1000).toFixed(3)} km` : `${measureDistance.toFixed(1)} m`}</span>
                  <button type="button" onClick={clearMeasure}>Borrar</button>
                </div>
              )}
            </div>

            <div className="map-switcher">
              {(Object.keys(BASEMAPS) as BaseMapKey[]).map((key) => (
                <button key={key} type="button" className={baseMap === key ? "active" : ""} onClick={() => setBaseMap(key)}>{BASEMAPS[key].name}</button>
              ))}
            </div>

            <div className="map-hint"><MousePointer2 size={13} /> clic en un activo = consulta sincronizada</div>

            {selectedFeature && (
              <div className="gis-selection-card">
                <div className="selection-card-top">
                  <strong>{display(p?.codigo, selectedAssetId)}</strong>
                  <span>{selectedPk}</span>
                </div>
                <h3>{display(p?.nombre, selectedType)}</h3>
                <dl>
                  <div><dt>Familia</dt><dd>{display(p?.familia)}</dd></div>
                  <div><dt>Estado</dt><dd className={p?.estado_validacion === "APROBADO" ? "status-approved" : "status-preliminary"}>{display(p?.estado_validacion)}</dd></div>
                  <div><dt>Fuente</dt><dd>{display(p?.lote_origen)}</dd></div>
                  <div><dt>Geometría</dt><dd>{selectedGeometry}</dd></div>
                </dl>
                <div className="selection-sync">Activo seleccionado para GIS · BIM · CDE <ChevronRight size={15} /></div>
              </div>
            )}

            {error && <div className="map-error">{error}</div>}
          </div>
        </article>

        <div className="panel-resizer" title="Arrastrar para cambiar ancho" onPointerDown={(event) => startResize(0, event)} />

        <article className="work-panel bim-panel">
          <div className="panel-titlebar">
            <div><Box size={17} /><strong>2. PANTALLA IFC 3D</strong><span>Puente Principal · IFC4.3</span></div>
            <small>{bridgeSelected ? "GIS vinculado" : "modelo maestro"}</small>
          </div>
          <div className="panel-body bim-stage">
            <div ref={threeNodeRef} className="three-viewport" />

            <div className="bim-model-badge">
              <div><Box size={17} /><strong>RN174-P-PUENTE-PRINCIPAL</strong></div>
              <span>IFC4X3_ADD2 · PRELIMINAR_NO_VALIDADO</span>
            </div>

            <div className="bim-provenance">
              <strong>Modelo derivado de documentación conforme a obra</strong>
              <span>PK 1+647.60 → 2+255.60 · L=608 m · B=22.80 m · luz principal 350 m</span>
              <span>Geometría vertical/obenques: preliminar; falta conciliación completa de Unidad P (419 DWG).</span>
            </div>

            <div className="bim-actions">
              <button type="button" onClick={() => setAutoRotate((value) => !value)} className={autoRotate ? "active" : ""}><RotateCcw size={14} /> Rotar</button>
              <button type="button" onClick={() => setBimResetNonce((value) => value + 1)}><Crosshair size={14} /> Centrar</button>
              <button type="button" onClick={selectBridge} disabled={!bridgeFeature}><Eye size={14} /> Ver en GIS</button>
              <a href={IFC_URL} download><Download size={14} /> IFC 4.3</a>
            </div>

            <div className="bim-toolbar">
              {(["3D", "PLANTA", "ALZADO"] as BimView[]).map((value) => (
                <button key={value} type="button" className={bimView === value ? "active" : ""} onClick={() => setBimView(value)}>{value}</button>
              ))}
            </div>
          </div>
        </article>

        <div className="panel-resizer" title="Arrastrar para cambiar ancho" onPointerDown={(event) => startResize(1, event)} />

        <article className="work-panel docs-panel">
          <div className="panel-titlebar cde-titlebar">
            <div><Folder size={17} /><strong>3. PANTALLA CDE</strong><span>Árbol documental</span></div>
            <small>CDE · trazabilidad</small>
          </div>
          <div className="panel-body docs-body">
            <section className="tree-card">
              <div className="tree-heading"><Folder size={16} /><strong>CDE_RN174_MASTER</strong></div>
              <div className="tree-node level-1 open"><ChevronRight size={14} /><Folder size={15} /><span>01_MODELOS_BIM</span><em>1 modelo</em></div>
              <a className="tree-node level-2 active" href={IFC_URL} download><Box size={15} /><span>RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc</span><em>IFC4.3</em></a>
              <div className="tree-node level-1"><ChevronRight size={14} /><Folder size={15} /><span>02_PROYECTO_Y_CONFORME_A_OBRA</span><em>catalogado</em></div>
              <div className="tree-node level-1 open"><ChevronRight size={14} /><Folder size={15} /><span>03_FUENTES_E_INVENTARIOS</span></div>
              <div className="tree-node level-2 active"><FileText size={15} /><span>{display(p?.lote_origen, "Sin lote documental")}</span><em>fuente GIS</em></div>
              <div className="tree-node level-1 open"><ChevronRight size={14} /><Folder size={15} /><span>04_ACTIVOS_RN174</span></div>
              <div className="tree-node level-2 active"><CircleDot size={15} /><span>{selectedAssetId}</span><em>{selectedType}</em></div>
            </section>

            <section className="doc-inspector">
              <div className="doc-inspector-head">
                <div><FileText size={16} /><strong>FICHA DEL ACTIVO · V3.2</strong></div>
                <span className={p?.estado_validacion === "APROBADO" ? "published-pill" : "preliminary-pill"}>{display(p?.estado_validacion, "SIN ESTADO")}</span>
              </div>
              <table>
                <tbody>
                  <tr><th>ID de activo</th><td>{selectedAssetId}</td></tr>
                  <tr><th>Código</th><td>{display(p?.codigo)}</td></tr>
                  <tr><th>Familia / tipo</th><td>{display(p?.familia)} · {selectedType}</td></tr>
                  <tr><th>Progresiva</th><td>{selectedPk}</td></tr>
                  <tr><th>Prog. fin</th><td>{formatPk(p?.progresiva_fin_m)}</td></tr>
                  <tr><th>Geometría</th><td>{selectedGeometry ?? "—"}</td></tr>
                  <tr><th>Lado</th><td>{display(p?.lado)}</td></tr>
                  <tr><th>Estado validación</th><td>{display(p?.estado_validacion)}</td></tr>
                  <tr><th>Calidad del dato</th><td>{display(p?.calidad_dato)}</td></tr>
                  <tr><th>Método posición</th><td>{display(p?.metodo_posicion)}</td></tr>
                  <tr><th>Precisión</th><td>{p?.precision_m !== undefined ? `${p.precision_m} m` : "—"}</td></tr>
                  <tr><th>Fuente / lote</th><td>{display(p?.lote_origen)}</td></tr>
                </tbody>
              </table>
              <div className="doc-note">
                <strong>Estado documental</strong>
                <p>{p?.observaciones ? p.observaciones : "Activo publicado temporalmente para consulta. La visibilidad web no implica validación técnica."}</p>
              </div>

              <div className="bridge-document-card">
                <div><FileText size={16} /><strong>Descargas del activo seleccionado</strong></div>
                <p>Ficha tabular y geometría exportable para trabajo de campo, QGIS y Google Earth.</p>
                <div className="download-group">
                  <button type="button" onClick={() => void downloadXlsx()} disabled={!selectedFeature}><Download size={13} /> XLSX</button>
                  <button type="button" onClick={downloadKml} disabled={!selectedFeature}><Download size={13} /> KML</button>
                  <button type="button" onClick={() => void downloadKmz()} disabled={!selectedFeature}><Download size={13} /> KMZ</button>
                  <button type="button" onClick={downloadGeoJson} disabled={!selectedFeature}><Download size={13} /> GeoJSON</button>
                </div>
              </div>

              <div className="bridge-document-card">
                <div><Box size={16} /><strong>Puente Principal · AIM/IFC</strong></div>
                <p>Primer activo BIM real del sistema. El IFC4.3 conserva trazabilidad de fuente y estado PRELIMINAR.</p>
                <a href={IFC_URL} download><Download size={13} /> Descargar IFC4.3</a>
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
        <div className="dock-field"><span>FILTRO GIS</span><b>{visibleTotal} / {datasetTotal}</b><small>activos visibles</small></div>
        <div className="dock-field"><span>SINCRONIZACIÓN</span><b>{loading ? "ACTUALIZANDO" : "GIS ACTIVO"}</b><small>{loadedAt ? loadedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small></div>
        <div className="download-group">
          <button type="button" onClick={() => void downloadXlsx()} disabled={!selectedFeature}><Download size={14} /> XLSX</button>
          <button type="button" onClick={downloadKml} disabled={!selectedFeature}><Download size={14} /> KML</button>
          <button type="button" onClick={() => void downloadKmz()} disabled={!selectedFeature}><Download size={14} /> KMZ</button>
        </div>
      </footer>
    </main>
  );
}

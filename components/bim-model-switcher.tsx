"use client";

import { Box, Crosshair, Download, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModelKey = "BRIDGE" | "TOLL" | "SIGNS";
type BimView = "3D" | "PLANTA" | "ALZADO";

type ModelDef = {
  key: ModelKey;
  label: string;
  subtitle: string;
  code: string;
  filename: string;
  url: string;
  provenance: string;
  detail: string;
  assetIds: string[];
};

const MODELS: Record<ModelKey, ModelDef> = {
  BRIDGE: {
    key: "BRIDGE",
    label: "Puente Principal",
    subtitle: "Puente Principal · IFC4.3",
    code: "RN174-P-PUENTE-PRINCIPAL",
    filename: "RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc",
    url: "./models/RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc",
    provenance: "Modelo derivado de documentación conforme a obra",
    detail: "PK 1+647.60 → 2+255.60 · L=608 m · B=22.80 m · luz principal 350 m",
    assetIds: [],
  },
  TOLL: {
    key: "TOLL",
    label: "Estación de Peaje",
    subtitle: "Estación de Peaje · IFC4.3",
    code: "RN174-PEAJE-01",
    filename: "RN174_ESTACION_PEAJE_IFC4X3_PRELIMINAR.ifc",
    url: "./models/RN174_ESTACION_PEAJE_IFC4X3_PRELIMINAR.ifc",
    provenance: "Modelo preliminar del Área de Peaje · Unidad J + documentación de inventario",
    detail: "PK 4+908.51 → 5+542.67 · edificio principal 370 m² · isletas, vías de cobro, cabinas y cubierta",
    assetIds: [
      "1a03a4ac-6b06-5389-8934-7c095fe14932",
      "d5b16fd4-5f4f-599a-8b85-a7ebf74eb945",
    ],
  },
  SIGNS: {
    key: "SIGNS",
    label: "Señales verticales · Peaje",
    subtitle: "Señalización Vertical · IFC4.3",
    code: "RN174-SV-MUESTRA-PEAJE",
    filename: "RN174_SENALES_VERTICAL_PEAJE_IFC4X3_PRELIMINAR.ifc",
    url: "./models/RN174_SENALES_VERTICAL_PEAJE_IFC4X3_PRELIMINAR.ifc",
    provenance: "Cinco señales reales del inventario RN174 2026",
    detail: "PK 4+925 · 4+980 · 5+100 · 5+150 · dimensiones y asset_id conservados en IFC",
    assetIds: [
      "e842068e-ade5-56cf-bc59-a6fae7ff925f",
      "bc01aa48-4f8e-53eb-acb0-4a9357025a01",
      "be74b158-8f9d-58c4-b2b6-dd9ad0d93496",
      "99c7da56-25ae-5479-adde-19a39dcf7d5d",
      "83bc9698-d360-5bf4-8d07-53a153b23305",
    ],
  },
};

const SIGN_DATA = [
  { code: "RN174-SV-0084", pk: 4925, side: 1, w: 2.5, h: 2.5, posts: 3, circular: false },
  { code: "RN174-SV-0086", pk: 4980, side: 1, w: 2.0, h: 1.2, posts: 2, circular: false },
  { code: "RN174-SV-0092", pk: 5100, side: -1, w: 0.9, h: 0.9, posts: 1, circular: true },
  { code: "RN174-SV-0094", pk: 5150, side: 1, w: 0.6, h: 1.2, posts: 2, circular: false },
  { code: "RN174-SV-0095", pk: 5150, side: -1, w: 1.8, h: 1.25, posts: 1, circular: false, cantilever: true },
];

function modelFromAssetId(assetId: string): ModelKey | null {
  if (MODELS.TOLL.assetIds.includes(assetId)) return "TOLL";
  if (MODELS.SIGNS.assetIds.includes(assetId)) return "SIGNS";
  return null;
}

export function BimModelSwitcher() {
  const [treeHost, setTreeHost] = useState<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<ModelKey>("BRIDGE");
  const [view, setView] = useState<BimView>("3D");
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const model = MODELS[active];

  useEffect(() => {
    let cancelled = false;
    let bridgeLink: HTMLAnchorElement | null = null;
    let treeInsert: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;

    const mount = () => {
      if (cancelled) return;
      const tree = document.querySelector<HTMLElement>(".tree-card");
      const stage = document.querySelector<HTMLElement>(".bim-stage");
      bridgeLink = document.querySelector<HTMLAnchorElement>('a[href*="RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc"]');
      if (!tree || !stage || !bridgeLink) {
        window.setTimeout(mount, 150);
        return;
      }

      const folder = Array.from(tree.querySelectorAll<HTMLElement>(".tree-node.level-1")).find((node) =>
        node.textContent?.includes("01_MODELOS_BIM"),
      );
      const count = folder?.querySelector("em");
      if (count) count.textContent = "3 modelos";

      treeInsert = document.createElement("div");
      treeInsert.className = "bim-model-switcher-tree-host";
      bridgeLink.insertAdjacentElement("afterend", treeInsert);
      setTreeHost(treeInsert);
      setStageHost(stage);

      const onBridgeClick = (event: MouseEvent) => {
        event.preventDefault();
        setActive("BRIDGE");
      };
      bridgeLink.addEventListener("click", onBridgeClick);

      const inspector = document.querySelector<HTMLElement>(".doc-inspector");
      if (inspector) {
        const syncFromInspector = () => {
          const firstCell = inspector.querySelector<HTMLTableCellElement>("tbody tr:first-child td");
          const assetId = firstCell?.textContent?.trim() ?? "";
          const target = modelFromAssetId(assetId);
          if (target) setActive(target);
        };
        observer = new MutationObserver(syncFromInspector);
        observer.observe(inspector, { subtree: true, childList: true, characterData: true });
        syncFromInspector();
      }

      return () => {
        bridgeLink?.removeEventListener("click", onBridgeClick);
      };
    };

    const cleanupBridge = mount();
    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanupBridge?.();
      treeInsert?.remove();
    };
  }, []);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".bim-panel");
    const subtitle = panel?.querySelector<HTMLElement>(".panel-titlebar span");
    const small = panel?.querySelector<HTMLElement>(".panel-titlebar small");
    if (subtitle) subtitle.textContent = model.subtitle;
    if (small) small.textContent = active === "BRIDGE" ? "modelo maestro" : "modelo seleccionado";

    const bridgeLink = document.querySelector<HTMLAnchorElement>('a[href*="RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc"]');
    bridgeLink?.classList.toggle("active", active === "BRIDGE");
  }, [active, model.subtitle]);

  useEffect(() => {
    if (active === "BRIDGE") return;
    const currentNode = viewportRef.current;
    if (!currentNode) return;
    const node: HTMLDivElement = currentNode;

    let disposed = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let rendererToDispose: import("three").WebGLRenderer | null = null;
    let controlsToDispose: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;

    async function build() {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;

      node.replaceChildren();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef3f8);
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 3000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      node.appendChild(renderer.domElement);
      rendererToDispose = renderer;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.8;
      controlsToDispose = controls;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x718096, 2.25));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(120, 190, 130);
      sun.castShadow = true;
      scene.add(sun);

      const concrete = new THREE.MeshStandardMaterial({ color: 0xd5dce5, roughness: 0.78 });
      const asphalt = new THREE.MeshStandardMaterial({ color: 0x35465a, roughness: 0.82 });
      const roof = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.52, metalness: 0.16 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x89a9c4, roughness: 0.3, metalness: 0.12 });
      const signFace = new THREE.MeshStandardMaterial({ color: 0xe8f2ff, roughness: 0.62 });
      const posts = new THREE.MeshStandardMaterial({ color: 0x818c99, roughness: 0.5, metalness: 0.45 });

      if (active === "TOLL") {
        const group = new THREE.Group();
        group.name = "RN174_ESTACION_PEAJE_IFC4X3_PRELIMINAR";
        scene.add(group);

        const roadway = new THREE.Mesh(new THREE.BoxGeometry(145, 0.35, 42), asphalt);
        roadway.position.y = -0.2;
        roadway.receiveShadow = true;
        group.add(roadway);

        const paymentSlab = new THREE.Mesh(new THREE.BoxGeometry(42, 0.45, 30), concrete);
        paymentSlab.position.set(0, 0.05, 0);
        paymentSlab.receiveShadow = true;
        group.add(paymentSlab);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(52, 0.7, 26), roof);
        canopy.position.set(0, 5.2, 0);
        canopy.castShadow = true;
        group.add(canopy);

        for (const z of [-11, -7.3, -3.7, 0, 3.7, 7.3, 11]) {
          const island = new THREE.Mesh(new THREE.BoxGeometry(16, 0.55, 0.85), concrete);
          island.position.set(0, 0.35, z);
          group.add(island);
        }

        for (let index = 0; index < 11; index += 1) {
          const z = -12 + index * 2.4;
          const booth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 1.25), glass);
          booth.position.set(1.5, 1.65, z);
          booth.castShadow = true;
          group.add(booth);
        }

        for (const z of [-12, -6, 0, 6, 12]) {
          const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), concrete);
          column.position.set(-20, 2.5, z);
          group.add(column);
          const column2 = column.clone();
          column2.position.x = 20;
          group.add(column2);
        }

        const building = new THREE.Mesh(new THREE.BoxGeometry(20, 7.2, 18.5), concrete);
        building.position.set(52, 3.6, -25);
        building.castShadow = true;
        group.add(building);

        const wing1 = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 5), roof);
        wing1.position.set(37, 2, -31);
        group.add(wing1);
        const wing2 = wing1.clone();
        wing2.position.z = -19;
        group.add(wing2);

        const grid = new THREE.GridHelper(190, 38, 0x9aa9b9, 0xc7d1db);
        grid.position.y = -0.45;
        scene.add(grid);

        controls.target.set(8, 2.5, -4);
        if (view === "PLANTA") camera.position.set(8, 145, -4);
        else if (view === "ALZADO") camera.position.set(8, 20, 125);
        else camera.position.set(95, 52, 92);
      } else {
        const group = new THREE.Group();
        group.name = "RN174_SENALES_VERTICAL_PEAJE_IFC4X3_PRELIMINAR";
        scene.add(group);

        const road = new THREE.Mesh(new THREE.BoxGeometry(260, 0.3, 16), asphalt);
        road.position.set(0, -0.2, 0);
        group.add(road);

        const basePk = 4925;
        for (const sign of SIGN_DATA) {
          const x = (sign.pk - basePk) * 0.95 - 105;
          const z = sign.side * 10;
          const plateY = 3.15;

          if (sign.cantilever) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.0, 0.12), posts);
            post.position.set(x, 2, z);
            group.add(post);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), posts);
            arm.position.set(x, 3.9, z - sign.side * 1.65);
            group.add(arm);
          } else {
            const spread = sign.posts === 1 ? [0] : Array.from({ length: sign.posts }, (_, i) => (i - (sign.posts - 1) / 2) * Math.min(1.2, sign.w / Math.max(1, sign.posts - 1)));
            for (const dz of spread) {
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 0.1), posts);
              post.position.set(x, 1.5, z + dz);
              group.add(post);
            }
          }

          let plate: import("three").Mesh;
          if (sign.circular) {
            plate = new THREE.Mesh(new THREE.CylinderGeometry(sign.w / 2, sign.w / 2, 0.07, 48), signFace);
            plate.rotation.z = Math.PI / 2;
            plate.position.set(x, plateY, z);
          } else {
            plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, sign.h, sign.w), signFace);
            plate.position.set(x, plateY, z - (sign.cantilever ? sign.side * 3.25 : 0));
          }
          plate.castShadow = true;
          plate.name = sign.code;
          group.add(plate);
        }

        const grid = new THREE.GridHelper(300, 60, 0x9aa9b9, 0xc7d1db);
        grid.position.y = -0.4;
        scene.add(grid);

        controls.target.set(0, 2.4, 0);
        if (view === "PLANTA") camera.position.set(0, 125, 0.1);
        else if (view === "ALZADO") camera.position.set(0, 13, 110);
        else camera.position.set(88, 36, 78);
      }

      camera.lookAt(controls.target);
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
    }

    void build();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      controlsToDispose?.dispose();
      rendererToDispose?.dispose();
    };
  }, [active, autoRotate, resetNonce, view]);

  const treePortal = useMemo(() => {
    const host = treeHost;
    if (!host) return null;
    return createPortal(
      <>
        <button className={`tree-node level-2 bim-tree-model ${active === "TOLL" ? "active" : ""}`} type="button" onClick={() => setActive("TOLL")}>
          <Box size={15} /><span>{MODELS.TOLL.filename}</span><em>IFC4.3</em>
        </button>
        <button className={`tree-node level-2 bim-tree-model ${active === "SIGNS" ? "active" : ""}`} type="button" onClick={() => setActive("SIGNS")}>
          <Box size={15} /><span>{MODELS.SIGNS.filename}</span><em>IFC4.3</em>
        </button>
      </>,
      host,
    );
  }, [active, treeHost]);

  const stagePortal = useMemo(() => {
    const host = stageHost;
    if (!host || active === "BRIDGE") return null;
    return createPortal(
      <div className="bim-switch-overlay">
        <style>{`
          .bim-model-switcher-tree-host{display:contents}
          .bim-tree-model{width:100%;border:0;text-align:left;cursor:pointer}
          .bim-switch-overlay{position:absolute;inset:0;z-index:40;background:#eef3f8;overflow:hidden}
          .bim-switch-viewport{position:absolute;inset:0}
          .bim-switch-badge{position:absolute;z-index:3;left:12px;top:12px;padding:8px 10px;background:rgba(255,255,255,.96);border:1px solid #ced9e5;border-radius:6px;box-shadow:0 4px 14px rgba(15,23,42,.11)}
          .bim-switch-badge div{display:flex;align-items:center;gap:6px;color:#24364d;font-size:10.5px;font-weight:800}.bim-switch-badge span{display:block;margin-top:4px;color:#b45309;font-size:9px;font-weight:800}
          .bim-switch-actions{position:absolute;z-index:3;right:12px;top:12px;display:flex;gap:5px}.bim-switch-actions button,.bim-switch-actions a{height:31px;display:flex;align-items:center;gap:5px;padding:0 9px;color:#334155;background:rgba(255,255,255,.96);border:1px solid #cbd5e1;border-radius:5px;font-size:9.5px;font-weight:700;text-decoration:none;cursor:pointer}.bim-switch-actions .active{color:#fff;background:#0b7acb;border-color:#0b7acb}
          .bim-switch-provenance{position:absolute;z-index:3;left:12px;right:12px;bottom:47px;padding:8px 10px;background:rgba(255,255,255,.92);border:1px solid #d8e1eb;border-radius:5px;color:#475569;font-size:9.5px}.bim-switch-provenance strong{display:block;color:#24364d;font-size:10.5px}.bim-switch-provenance span{display:block;margin-top:2px}.bim-switch-warning{color:#b45309!important}
          .bim-switch-toolbar{position:absolute;z-index:3;left:50%;bottom:10px;transform:translateX(-50%);display:flex;overflow:hidden;background:#fff;border:1px solid #ccd7e2;border-radius:16px;box-shadow:0 3px 10px rgba(15,23,42,.12)}.bim-switch-toolbar button{min-width:52px;padding:6px 10px;border:0;background:#fff;color:#64748b;font-size:9px;cursor:pointer}.bim-switch-toolbar button.active{color:#172033;background:#facc15;font-weight:800}
        `}</style>
        <div ref={viewportRef} className="bim-switch-viewport" />
        <div className="bim-switch-badge"><div><Box size={17} /><strong>{model.code}</strong></div><span>IFC4X3_ADD2 · PRELIMINAR_NO_VALIDADO</span></div>
        <div className="bim-switch-actions">
          <button type="button" className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((value) => !value)}><RotateCcw size={14} /> Rotar</button>
          <button type="button" onClick={() => setResetNonce((value) => value + 1)}><Crosshair size={14} /> Centrar</button>
          <a href={model.url} download><Download size={14} /> IFC 4.3</a>
        </div>
        <div className="bim-switch-provenance"><strong>{model.provenance}</strong><span>{model.detail}</span><span className="bim-switch-warning">Geometría 3D de visualización preliminar; falta conciliación completa con DWG conforme a obra. No usar para replanteo.</span></div>
        <div className="bim-switch-toolbar">{(["3D", "PLANTA", "ALZADO"] as BimView[]).map((item) => <button key={item} type="button" className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}</div>
      </div>,
      host,
    );
  }, [active, autoRotate, model.code, model.detail, model.provenance, model.url, stageHost, view]);

  return <>{treePortal}{stagePortal}</>;
}

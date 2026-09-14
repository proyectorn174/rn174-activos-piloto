"use client";

import { Box, Crosshair, Download, Eye, Info, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ExtKey = "SAN_MARTIN" | "T13";
type BimView = "3D" | "PLANTA" | "ALZADO";
type Semantic = Record<string, string | number>;

type ModelDef = {
  key: ExtKey;
  label: string;
  shortLabel: string;
  subtitle: string;
  code: string;
  filename: string;
  url: string;
  source: string;
  detail: string;
  gisTerms: string[];
};

const MODELS: Record<ExtKey, ModelDef> = {
  SAN_MARTIN: {
    key: "SAN_MARTIN",
    label: "Puente Calle San Martín",
    shortLabel: "San Martín",
    subtitle: "Puente Calle San Martín · IFC4.3 semántico",
    code: "RN174-EST-04493",
    filename: "RN174_PUENTE_CALLE_SAN_MARTIN_IFC4X3_PRELIMINAR.ifc",
    url: "./models/RN174_PUENTE_CALLE_SAN_MARTIN_IFC4X3_PRELIMINAR.ifc",
    source: "G-G-ME-101 Rev16 + Unidad V (7 DWG verificados)",
    detail: "PK 59+139.37 → 59+162.57 · L=23.20 m · ancho estructural 11.84 m",
    gisTerms: ["RN174-EST-04493", "CALLE S.MARTIN", "SAN MARTIN"],
  },
  T13: {
    key: "T13",
    label: "T13 Pavimento + Taludes",
    shortLabel: "T13",
    subtitle: "T13 Pavimento + Taludes · IFC4.3 semántico",
    code: "RN174-T13-MUESTRA-4632-4800",
    filename: "RN174_T13_PAVIMENTO_TALUD_IFC4X3_PRELIMINAR.ifc",
    url: "./models/RN174_T13_PAVIMENTO_TALUD_IFC4X3_PRELIMINAR.ifc",
    source: "G-G-ME-101 Rev16 + Unidad L Diseño Vial",
    detail: "Muestra PK 4+632.60 → 4+800.00 · coronamiento 23.90 m · talud 1V:4H",
    gisTerms: ["T13", "4+632", "TERRAPLEN"],
  },
};

const ORDER: ExtKey[] = ["SAN_MARTIN", "T13"];

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function BimSemanticExtension() {
  const [treeHost, setTreeHost] = useState<HTMLElement | null>(null);
  const [pickerHost, setPickerHost] = useState<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<ExtKey | null>(null);
  const [view, setView] = useState<BimView>("3D");
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [selected, setSelected] = useState<Semantic | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const model = active ? MODELS[active] : null;

  const choose = (key: ExtKey) => {
    setActive(key);
    setView("3D");
    setAutoRotate(false);
    setSelected(null);
    setResetNonce((value) => value + 1);
  };

  useEffect(() => {
    let disposed = false;
    const ensure = () => {
      if (disposed) return;
      const stage = document.querySelector<HTMLElement>(".bim-stage");
      const tree = document.querySelector<HTMLElement>(".tree-card");
      const picker = stage?.querySelector<HTMLElement>(".bim-model-picker");
      if (!stage || !tree || !picker) return;

      const folder = Array.from(tree.querySelectorAll<HTMLElement>(".tree-node.level-1")).find((node) =>
        node.textContent?.includes("01_MODELOS_BIM"),
      );
      const count = folder?.querySelector("em");
      if (count) count.textContent = "5 modelos";

      let th = tree.querySelector<HTMLElement>(".bim-semantic-tree-host");
      if (!th) {
        th = document.createElement("div");
        th.className = "bim-semantic-tree-host";
        const baseHost = tree.querySelector<HTMLElement>(".bim-model-switcher-tree-host");
        (baseHost ?? folder)?.insertAdjacentElement("afterend", th);
      }

      let ph = picker.querySelector<HTMLElement>(".bim-semantic-picker-host");
      if (!ph) {
        ph = document.createElement("span");
        ph.className = "bim-semantic-picker-host";
        ph.style.display = "contents";
        picker.appendChild(ph);
      }

      setTreeHost((current) => current === th ? current : th);
      setPickerHost((current) => current === ph ? current : ph);
      setStageHost((current) => current === stage ? current : stage);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(".bim-model-picker button, .bim-tree-model");
      if (!button) return;
      if (button.closest(".bim-semantic-picker-host") || button.classList.contains("bim-semantic-tree-model")) return;
      setActive(null);
      setSelected(null);
    };

    ensure();
    const timer = window.setInterval(ensure, 180);
    document.addEventListener("click", onClick, true);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      document.querySelectorAll(".bim-semantic-tree-host,.bim-semantic-picker-host").forEach((node) => node.remove());
    };
  }, []);

  useEffect(() => {
    const stage = stageHost;
    if (!stage) return;
    stage.classList.toggle("bim-semantic-active", Boolean(active));
    if (!active || !model) return;
    const panel = document.querySelector<HTMLElement>(".bim-panel");
    const subtitle = panel?.querySelector<HTMLElement>(".panel-titlebar span");
    const small = panel?.querySelector<HTMLElement>(".panel-titlebar small");
    if (subtitle) subtitle.textContent = model.subtitle;
    if (small) small.textContent = "modelo semántico";
    return () => stage.classList.remove("bim-semantic-active");
  }, [active, model, stageHost]);

  const showInGis = () => {
    if (!model) return;
    const input = document.querySelector<HTMLInputElement>(".global-search-wrap input");
    if (!input) return;
    let index = 0;
    const attempt = () => {
      const term = model.gisTerms[index];
      input.focus();
      setReactInputValue(input, term);
      window.setTimeout(() => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".global-search-results button"));
        if (buttons[0]) {
          buttons[0].click();
          return;
        }
        index += 1;
        if (index < model.gisTerms.length) attempt();
      }, 180);
    };
    attempt();
  };

  useEffect(() => {
    if (!active || !viewportRef.current) return;
    const node = viewportRef.current;
    let disposed = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function build() {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !node) return;
      node.replaceChildren();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef3f8);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      node.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.75;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7c8f, 2.25));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(80, 130, 90);
      scene.add(sun);

      const clickable: import("three").Mesh[] = [];
      const makeMat = (hex: number) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.68, metalness: 0.04 });
      const addBox = (name: string, size: [number, number, number], pos: [number, number, number], hex: number, semantic: Semantic) => {
        const material = makeMat(hex);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.set(...pos);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.semantic = semantic;
        mesh.userData.baseColor = hex;
        scene.add(mesh);
        clickable.push(mesh);
        return mesh;
      };

      if (active === "SAN_MARTIN") {
        const base = {
          AssetId: "RN174-EST-04493",
          PK: "59+139.37 → 59+162.57",
          Fuente: "G-G-ME-101 Rev16 + Unidad V (7 DWG)",
          Estado: "PRELIMINAR_NO_VALIDADO",
        };
        addBox("Tablero", [23.2, 11.84, 0.65], [0, 0, 0], 0x9aa8b7, { ...base, EntidadIFC: "IfcSlab", Componente: "Tablero", Material: "Hormigón H-30", Dimensiones: "23.20 × 11.84 m" });
        for (const y of [-4.5, -2.25, 0, 2.25, 4.5]) {
          addBox("Viga pretensada", [22.4, 0.55, 0.9], [0, y, -0.85], 0x64748b, { ...base, EntidadIFC: "IfcBeam", Componente: "Sistema de vigas pretensadas", Material: "H-30 / C-1900 Grado 270", Representacion: "Esquemática; cantidad final a conciliar con DWG" });
        }
        addBox("Estribo O", [0.9, 11.84, 4.5], [-11.15, 0, -2.55], 0x8796a5, { ...base, EntidadIFC: "IfcWall", Componente: "Estribo O", Material: "H-21/H-30 · ADN420/420S" });
        addBox("Estribo E", [0.9, 11.84, 4.5], [11.15, 0, -2.55], 0x8796a5, { ...base, EntidadIFC: "IfcWall", Componente: "Estribo E", Material: "H-21/H-30 · ADN420/420S" });
        for (const x of [-10.7, 10.7]) for (const y of [-3.5, 3.5]) addBox("Apoyo neopreno", [0.45, 0.45, 0.15], [x, y, -1.4], 0x334155, { ...base, EntidadIFC: "IfcBuildingElementProxy", Componente: "Apoyo", Material: "Neopreno zunchado", Dimensiones: "150 × 450 mm" });
        for (const x of [-11.45, 11.45]) addBox("Junta", [0.22, 11.84, 0.10], [x, 0, 0.38], 0xf59e0b, { ...base, EntidadIFC: "IfcPlate", Componente: "Junta de dilatación", Tipo: "Elástica tipo THORMACK" });
        for (const y of [-5.62, 5.62]) addBox("New Jersey", [23.2, 0.45, 0.9], [0, y, 0.55], 0xcbd5e1, { ...base, EntidadIFC: "IfcBuildingElementProxy", Componente: "Defensa New Jersey", Material: "Hormigón" });
        const grid = new THREE.GridHelper(52, 26, 0x8ea0b4, 0xc9d3de);
        grid.position.y = -0.1;
        grid.rotation.x = Math.PI / 2;
        scene.add(grid);
        controls.target.set(0, 0, -0.8);
        if (view === "PLANTA") camera.position.set(0, 0.1, 45);
        else if (view === "ALZADO") camera.position.set(0, -38, 8);
        else camera.position.set(31, -31, 22);
      } else {
        const L = 167.4;
        const visualL = 120;
        const W = 23.9;
        const base = {
          AssetId: "RN174-T13-MUESTRA-4632-4800",
          PK: "4+632.60 → 4+800.00",
          Fuente: "G-G-ME-101 Rev16 + Unidad L",
          Estado: "PRELIMINAR_NO_VALIDADO",
        };
        addBox("Núcleo terraplén", [visualL, W, 5.5], [0, 0, -3.0], 0xb9926f, { ...base, EntidadIFC: "IfcBuildingElementProxy", Componente: "Núcleo de terraplén", Material: "Arena", LongitudReal_m: L, AnchoCoronamiento_m: 23.9 });

        const wedge = (side: -1 | 1) => {
          const inner = side * W / 2;
          const outer = side * (W / 2 + 22);
          const x0 = -visualL / 2, x1 = visualL / 2, z0 = -0.25, z1 = -5.5;
          const verts = new Float32Array([
            x0, inner, z0, x0, outer, z1, x0, inner, z1,
            x1, inner, z0, x1, outer, z1, x1, inner, z1,
          ]);
          const idx = [0,1,2, 3,5,4, 0,3,4, 0,4,1, 2,1,4, 2,4,5, 0,2,5, 0,5,3];
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
          geo.setIndex(idx); geo.computeVertexNormals();
          const material = makeMat(0x9c7a5b);
          const mesh = new THREE.Mesh(geo, material);
          mesh.userData.baseColor = 0x9c7a5b;
          mesh.userData.semantic = { ...base, EntidadIFC: "IfcBuildingElementProxy", Componente: side < 0 ? "Talud izquierdo" : "Talud derecho", Pendiente: "1V:4H", Proteccion: "Suelo vegetal", AlturaRepresentada_m: 5.5 };
          scene.add(mesh); clickable.push(mesh);
        };
        wedge(-1); wedge(1);

        const layers: Array<[string, number, string, number]> = [
          ["Subrasante", 0.30, "Arena compactada", 0xd6c39f],
          ["Subbase", 0.20, "Broza calcárea seleccionada", 0xc8b27f],
          ["Base", 0.20, "Estabilizado granular", 0x9e9e8f],
          ["CA 2003", 0.07, "Concreto asfáltico", 0x4b5563],
          ["CA 2004", 0.09, "Concreto asfáltico", 0x374151],
          ["CA 2015", 0.055, "Concreto asfáltico", 0x1f2937],
        ];
        let z = -0.15;
        const exaggeration = 8;
        for (const [name, thickness, materialName, color] of layers) {
          const vh = Math.max(0.20, thickness * exaggeration);
          z += vh / 2;
          addBox(name, [visualL, W, vh], [0, 0, z], color, { ...base, EntidadIFC: "IfcSlab", Componente: name, Material: materialName, EspesorReal_m: thickness, RepresentacionVertical: `x${exaggeration} para lectura` });
          z += vh / 2;
        }
        for (const y of [-(W / 2 + 1.4), W / 2 + 1.4]) addBox("Banquina", [visualL, 2.6, 0.35], [0, y, 0.1], 0xb8aa91, { ...base, EntidadIFC: "IfcSlab", Componente: "Banquina mejorada", Ancho_m: 2.6 });
        const grid = new THREE.GridHelper(180, 36, 0x8ea0b4, 0xc9d3de);
        grid.position.z = -5.6;
        grid.rotation.x = Math.PI / 2;
        scene.add(grid);
        controls.target.set(0, 0, -1.2);
        if (view === "PLANTA") camera.position.set(0, 0.1, 150);
        else if (view === "ALZADO") camera.position.set(0, -105, 18);
        else camera.position.set(105, -88, 55);
      }

      camera.lookAt(controls.target);
      controls.update();

      let highlighted: import("three").Mesh | null = null;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const onPointer = (event: PointerEvent) => {
        if (!renderer) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(clickable, false)[0]?.object as import("three").Mesh | undefined;
        if (!hit) return;
        if (highlighted) {
          const material = highlighted.material as import("three").MeshStandardMaterial;
          material.color.setHex(highlighted.userData.baseColor as number);
        }
        highlighted = hit;
        (hit.material as import("three").MeshStandardMaterial).color.setHex(0xfacc15);
        setSelected(hit.userData.semantic as Semantic);
      };
      renderer.domElement.addEventListener("pointerdown", onPointer);

      const resize = () => {
        if (!renderer) return;
        const w = node.clientWidth, h = node.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(node);

      const animate = () => {
        if (!renderer || !controls) return;
        controls.autoRotate = autoRotate;
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };
      animate();
    }

    void build();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      node.replaceChildren();
    };
  }, [active, autoRotate, resetNonce, view]);

  const treePortal = useMemo(() => treeHost ? createPortal(
    <div className="bim-semantic-tree-list">
      {ORDER.map((key) => {
        const item = MODELS[key];
        return <button key={key} type="button" className={`tree-node level-2 bim-tree-model bim-semantic-tree-model ${active === key ? "active" : ""}`} onClick={() => choose(key)} title={`Abrir ${item.label}`}>
          <Box size={15} /><span>{item.filename}</span><em>{active === key ? "EN VISOR" : "IFC4.3"}</em>
        </button>;
      })}
    </div>, treeHost) : null, [active, treeHost]);

  const pickerPortal = useMemo(() => pickerHost ? createPortal(<>
    {ORDER.map((key) => <button key={key} type="button" className={active === key ? "active" : ""} onClick={() => choose(key)}><Box size={13} /> {MODELS[key].shortLabel}</button>)}
  </>, pickerHost) : null, [active, pickerHost]);

  const stagePortal = useMemo(() => stageHost && active && model ? createPortal(
    <div className="bim-semantic-overlay">
      <div ref={viewportRef} className="bim-semantic-viewport" />
      <div className="bim-semantic-badge"><div><Box size={16} /><strong>{model.code}</strong></div><span>IFC4X3_ADD2 · SEMÁNTICO · PRELIMINAR</span></div>
      <div className="bim-semantic-actions">
        <button type="button" className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((v) => !v)}><RotateCcw size={14} /> Rotar</button>
        <button type="button" onClick={() => setResetNonce((v) => v + 1)}><Crosshair size={14} /> Centrar</button>
        <button type="button" onClick={showInGis}><Eye size={14} /> Ver en GIS</button>
        <a href={model.url} download><Download size={14} /> IFC 4.3</a>
      </div>
      <div className="bim-semantic-hint"><Info size={13} /> Clic en un componente = propiedades IFC</div>
      {selected && <aside className="bim-semantic-inspector">
        <header><strong>{String(selected.Componente ?? "Elemento IFC")}</strong><button type="button" onClick={() => setSelected(null)}>×</button></header>
        <div>{Object.entries(selected).map(([key, value]) => <p key={key}><span>{key}</span><b>{String(value)}</b></p>)}</div>
      </aside>}
      <div className="bim-semantic-provenance"><strong>{model.label}</strong><span>{model.detail}</span><span>Fuente: {model.source}</span><small>Geometría preliminar. Las propiedades se conservan como Psets RN174 en el IFC; no usar para cálculo/replanteo hasta conciliación documental.</small></div>
      <div className="bim-semantic-toolbar">{(["3D","PLANTA","ALZADO"] as BimView[]).map((item) => <button key={item} type="button" className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}</div>
    </div>, stageHost) : null, [active, autoRotate, model, selected, stageHost, view]);

  return <>
    <style>{`
      .bim-semantic-tree-host{display:block;width:100%}.bim-semantic-tree-model{width:100%;border:0;text-align:left;cursor:pointer}.bim-semantic-tree-model.active{background:#e8f4ff!important;color:#075985!important;box-shadow:inset 3px 0 #0b7acb}.bim-semantic-tree-model.active em{color:#0b7acb!important;font-weight:900}
      .bim-stage.bim-semantic-active>.bim-viewport,.bim-stage.bim-semantic-active>.bim-model-badge,.bim-stage.bim-semantic-active>.bim-actions,.bim-stage.bim-semantic-active>.bim-provenance,.bim-stage.bim-semantic-active>.bim-toolbar,.bim-stage.bim-semantic-active>.bim-switch-overlay{display:none!important}
      .bim-semantic-overlay{position:absolute;inset:0;z-index:80;background:#eef3f8;overflow:hidden}.bim-semantic-viewport{position:absolute;inset:0;cursor:pointer}
      .bim-semantic-badge{position:absolute;z-index:84;top:51px;left:10px;max-width:42%;padding:7px 9px;background:rgba(255,255,255,.96);border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 14px rgba(15,23,42,.11)}.bim-semantic-badge div{display:flex;gap:6px;align-items:center;font-size:10px;color:#24364d}.bim-semantic-badge span{display:block;margin-top:3px;color:#b45309;font-size:8.5px;font-weight:800}
      .bim-semantic-actions{position:absolute;z-index:84;top:51px;right:10px;display:flex;gap:5px}.bim-semantic-actions button,.bim-semantic-actions a{height:31px;display:flex;align-items:center;gap:5px;padding:0 8px;border:1px solid #cbd5e1;border-radius:5px;background:rgba(255,255,255,.96);color:#334155;font-size:9px;font-weight:750;text-decoration:none;cursor:pointer}.bim-semantic-actions .active{background:#0b7acb;color:#fff;border-color:#0b7acb}
      .bim-semantic-hint{position:absolute;z-index:84;top:91px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;padding:5px 8px;border-radius:12px;background:rgba(15,23,42,.82);color:#fff;font-size:8.5px}
      .bim-semantic-inspector{position:absolute;z-index:86;top:122px;right:10px;width:min(280px,46%);max-height:52%;overflow:auto;background:rgba(255,255,255,.97);border:1px solid #94a3b8;border-radius:7px;box-shadow:0 8px 24px rgba(15,23,42,.2)}.bim-semantic-inspector header{display:flex;justify-content:space-between;align-items:center;padding:8px 9px;background:#0f172a;color:#fff}.bim-semantic-inspector header button{border:0;background:transparent;color:#fff;font-size:16px;cursor:pointer}.bim-semantic-inspector>div{padding:5px 9px}.bim-semantic-inspector p{display:grid;grid-template-columns:42% 1fr;gap:7px;margin:0;padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:8.5px}.bim-semantic-inspector p span{color:#64748b}.bim-semantic-inspector p b{color:#24364d;word-break:break-word}
      .bim-semantic-provenance{position:absolute;z-index:84;left:10px;right:10px;bottom:45px;padding:7px 9px;background:rgba(255,255,255,.93);border:1px solid #d8e1eb;border-radius:5px;font-size:8.5px;color:#475569}.bim-semantic-provenance strong{display:block;color:#24364d;font-size:10px}.bim-semantic-provenance span,.bim-semantic-provenance small{display:block;margin-top:2px}.bim-semantic-provenance small{color:#b45309}
      .bim-semantic-toolbar{position:absolute;z-index:84;left:50%;bottom:9px;transform:translateX(-50%);display:flex;overflow:hidden;background:#fff;border:1px solid #cbd5e1;border-radius:16px}.bim-semantic-toolbar button{min-width:52px;padding:6px 9px;border:0;background:#fff;color:#64748b;font-size:9px;cursor:pointer}.bim-semantic-toolbar button.active{background:#facc15;color:#172033;font-weight:850}
      @container (max-width:560px){.bim-semantic-badge{top:50px;left:10px;right:10px;max-width:none}.bim-semantic-actions{top:91px;left:10px;right:10px;justify-content:center;flex-wrap:wrap}.bim-semantic-hint{top:130px}.bim-semantic-inspector{top:158px;width:calc(100% - 20px);max-height:42%}}
    `}</style>
    {treePortal}{pickerPortal}{stagePortal}
  </>;
}

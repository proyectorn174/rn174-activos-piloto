// @ts-nocheck
"use client";

import { Box, CircleDot, Crosshair, Download, MapPin, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AssetFeature = { id?: string; geometry?: { type?: string; coordinates?: unknown }; properties: Record<string, unknown> };
type AssetCollection = { type: string; features: AssetFeature[] };
type TabKey = "PK" | "SECCION" | "IFC" | "HISTORIAL" | "DECISION" | "COMPARAR" | "OT";
type WorkOrder = {
  id:string; assetId:string; codigo:string; tipo:string; tarea:string; responsable:string;
  vencimiento:string; prioridad:string; estado:string; creado:string;
  lat?:number; lon?:number; progresiva?:number; source:"LOCAL"|"SUPABASE";
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjbuukqqxypclvwwclxe.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_QhSYofToTULcOQ5pynkCoQ_Ha6Om1w9";
const WORK_ORDER_KEY = "rn174_work_orders_v2";
const LEGACY_ORDER_KEY = "rn174_work_orders_v1";

const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:undefined};
const s=(v:unknown)=>String(v??"").trim();

function parsePk(value:string){
  const text=value.toUpperCase().replace("PK","").replace(/\s/g,"").replace(",",".");
  if(!text)return undefined;
  if(text.includes("+")){const [km,m]=text.split("+").map(Number);if(Number.isFinite(km)&&Number.isFinite(m))return km*1000+m}
  const direct=Number(text);return Number.isFinite(direct)?direct:undefined;
}
function formatPk(value?:number){
  if(value===undefined||!Number.isFinite(value))return "—";
  const km=Math.floor(value/1000); return `PK ${km}+${(value-km*1000).toFixed(2).padStart(6,"0")}`;
}
function assetPk(f?:AssetFeature){return f ? n(f.properties.progresiva_inicio_m) ?? n(f.properties.progresiva_m) : undefined}
function featureKey(f:AssetFeature){return s(f.properties.codigo)||s(f.id)}
function distanceToPk(f:AssetFeature,pk:number){
  const start=n(f.properties.progresiva_inicio_m)??n(f.properties.progresiva_m);
  const end=n(f.properties.progresiva_fin_m)??start;
  if(start===undefined)return Infinity;
  if(end!==undefined&&pk>=Math.min(start,end)&&pk<=Math.max(start,end))return 0;
  return Math.min(Math.abs(pk-start),end===undefined?Infinity:Math.abs(pk-end));
}
function setReactInputValue(input:HTMLInputElement,value:string){
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;
  if(setter)setter.call(input,value);else input.value=value;
  input.dispatchEvent(new Event("input",{bubbles:true})); input.dispatchEvent(new Event("change",{bubbles:true}));
}
function openAssetInGis(feature?:AssetFeature){
  if(!feature)return;
  const input=document.querySelector<HTMLInputElement>(".global-search-wrap input"); if(!input)return;
  const term=s(feature.properties.codigo)||s(feature.id); if(!term)return;
  input.focus(); setReactInputValue(input,term);
  let tries=0; const pick=()=>{const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".global-search-results button"));
    if(buttons[0]){buttons[0].click();return} tries++; if(tries<10)window.setTimeout(pick,120)}; window.setTimeout(pick,120);
}
function downloadText(text:string,filename:string,type="text/plain;charset=utf-8"){
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function representativePoint(feature?:AssetFeature):{lat:number;lon:number}|null{
  const g=feature?.geometry;if(!g)return null;
  const flat:number[][]=[];
  const walk=(c:any)=>{if(Array.isArray(c)&&c.length>=2&&typeof c[0]==="number"&&typeof c[1]==="number")flat.push(c as number[]);else if(Array.isArray(c))c.forEach(walk)};
  walk(g.coordinates); if(!flat.length)return null;
  const mid=flat[Math.floor(flat.length/2)];
  return {lon:Number(mid[0]),lat:Number(mid[1])};
}
function currentAccessToken(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      if(!key.startsWith("sb-")||!key.endsWith("-auth-token"))continue;
      const raw=localStorage.getItem(key);if(!raw)continue;
      const parsed=JSON.parse(raw);const token=parsed?.access_token??parsed?.currentSession?.access_token;
      if(token)return String(token);
    }
  }catch{}
  return "";
}
function parseTile(img:HTMLImageElement){
  const src=img.currentSrc||img.src;
  let m=src.match(/\/tile\/(\d+)\/(\d+)\/(\d+)(?:\?|$)/);
  if(m)return {z:Number(m[1]),y:Number(m[2]),x:Number(m[3])};
  m=src.match(/\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg|jpeg|webp)(?:\?|$)/i);
  if(m)return {z:Number(m[1]),x:Number(m[2]),y:Number(m[3])};
  return null;
}
function tileReference(){
  const container=document.querySelector<HTMLElement>(".leaflet-container"); if(!container)return null;
  const tiles=Array.from(container.querySelectorAll<HTMLImageElement>("img.leaflet-tile")).filter(img=>img.complete&&img.getBoundingClientRect().width>20);
  for(const img of tiles){const xyz=parseTile(img);if(xyz)return {container,img,xyz,rect:img.getBoundingClientRect(),containerRect:container.getBoundingClientRect()}}
  return null;
}
function clientToLatLon(clientX:number,clientY:number){
  const ref=tileReference();if(!ref)return null;
  const {rect,xyz}=ref;const scale=rect.width/256;const world=256*Math.pow(2,xyz.z);
  const px=xyz.x*256+(clientX-rect.left)/scale; const py=xyz.y*256+(clientY-rect.top)/scale;
  const lon=px/world*360-180; const lat=180/Math.PI*Math.atan(Math.sinh(Math.PI-2*Math.PI*py/world));
  return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
}
function geoToScreen(lat:number,lon:number){
  const ref=tileReference();if(!ref)return null;
  const {rect,containerRect,xyz}=ref;const scale=rect.width/256;const world=256*Math.pow(2,xyz.z);
  const px=(lon+180)/360*world;
  const sin=Math.sin(lat*Math.PI/180); const py=(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*world;
  const x=rect.left-containerRect.left+(px-xyz.x*256)*scale;
  const y=rect.top-containerRect.top+(py-xyz.y*256)*scale;
  return {x,y};
}
function migrateLocalOrders(){
  try{
    const current=localStorage.getItem(WORK_ORDER_KEY); if(current)return JSON.parse(current) as WorkOrder[];
    const legacy=JSON.parse(localStorage.getItem(LEGACY_ORDER_KEY)||"[]");
    const migrated=(Array.isArray(legacy)?legacy:[]).map((o:any)=>({...o,source:"LOCAL"}));
    localStorage.setItem(WORK_ORDER_KEY,JSON.stringify(migrated)); return migrated;
  }catch{return []}
}
function SectionT13({pk}:{pk:number}){
  return <div className="v4-section-box"><div className="v4-section-title"><strong>Sección tipo T13 · referencia documental</strong><span>{formatPk(pk)}</span></div>
    <svg viewBox="0 0 600 205"><line x1="40" y1="150" x2="560" y2="150" className="v4-ground"/>
      <polygon points="60,148 190,72 410,72 540,148" className="v4-fill"/><rect x="190" y="59" width="220" height="13" className="v4-layer l1"/>
      <rect x="190" y="52" width="220" height="7" className="v4-layer l2"/><rect x="190" y="47" width="220" height="5" className="v4-layer l3"/>
      <line x1="300" y1="38" x2="300" y2="150" className="v4-axis"/><text x="300" y="32" textAnchor="middle">EJE</text>
      <text x="300" y="93" textAnchor="middle">coronamiento 23,90 m</text><text x="105" y="127">talud 1V:4H</text><text x="430" y="127">talud 1V:4H</text>
      <text x="300" y="178" textAnchor="middle">esquema paramétrico · no reemplaza sección levantada</text></svg></div>;
}
function InventoryStrip({features,pk}:{features:AssetFeature[];pk:number}){
  const nearby=features.filter(f=>{const p=assetPk(f);return p!==undefined&&Math.abs(p-pk)<=500});
  const families=Array.from(new Set(nearby.map(f=>s(f.properties.familia)||"OTROS"))).slice(0,5);
  const min=pk-500;const xpos=(v:number)=>90+((v-min)/1000)*470;
  return <div className="v4-section-box"><div className="v4-section-title"><strong>Perfil longitudinal de inventario</strong><span>±500 m · {nearby.length} activos</span></div>
    <svg viewBox="0 0 600 190"><line x1="90" y1="25" x2="560" y2="25" className="v4-ground"/><line x1={xpos(pk)} y1="12" x2={xpos(pk)} y2="174" className="v4-axis"/>
      {families.map((family,row)=><g key={family}><text x="8" y={54+row*25}>{family.slice(0,12)}</text><line x1="90" y1={50+row*25} x2="560" y2={50+row*25} className="v4-rowline"/>
        {nearby.filter(f=>(s(f.properties.familia)||"OTROS")===family).slice(0,80).map((f,i)=><circle key={`${featureKey(f)}-${i}`} cx={xpos(assetPk(f)!)} cy={50+row*25} r="3.2" className="v4-dot"/>)}</g>)}</svg></div>
}

export function VisorV5Tools(){
  const [open,setOpen]=useState(false),[tab,setTab]=useState<TabKey>("PK");
  const [collection,setCollection]=useState<AssetCollection|null>(null),[loadError,setLoadError]=useState("");
  const [selectedId,setSelectedId]=useState(""),[pkText,setPkText]=useState("5+200"),[pk,setPk]=useState<number|undefined>(5200);
  const [ifcModel,setIfcModel]=useState(""),[ifcProps,setIfcProps]=useState<Array<[string,string]>>([]);
  const [decision,setDecision]=useState({seguridad:0,condicion:0,legal:0,transito:0,costo:""});
  const [lotA,setLotA]=useState(""),[lotB,setLotB]=useState("");
  const [orders,setOrders]=useState<WorkOrder[]>([]);
  const [remoteOrders,setRemoteOrders]=useState<WorkOrder[]>([]);
  const [remoteReady,setRemoteReady]=useState(false),[syncMessage,setSyncMessage]=useState("");
  const [taskType,setTaskType]=useState("INSPECCION"),[taskText,setTaskText]=useState(""),[responsible,setResponsible]=useState(""),[due,setDue]=useState(""),[priority,setPriority]=useState("MEDIA");
  const [lat,setLat]=useState(""),[lon,setLon]=useState(""),[picking,setPicking]=useState(false);

  const loadRemote=async()=>{
    try{
      const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_ot_inspecciones_geojson`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},body:"{}"});
      if(!r.ok){setRemoteReady(false);return}
      const json=await r.json(); const list=(json?.features??[]).map((f:any)=>({
        id:String(f.id),assetId:s(f.properties?.asset_id),codigo:s(f.properties?.codigo),tipo:s(f.properties?.tipo),tarea:s(f.properties?.tarea),
        responsable:s(f.properties?.responsable),vencimiento:s(f.properties?.vencimiento),prioridad:s(f.properties?.prioridad),estado:s(f.properties?.estado),
        creado:s(f.properties?.creado_en),progresiva:n(f.properties?.progresiva_m),lon:n(f.geometry?.coordinates?.[0]),lat:n(f.geometry?.coordinates?.[1]),source:"SUPABASE"
      })) as WorkOrder[];
      setRemoteOrders(list);setRemoteReady(true);
    }catch{setRemoteReady(false)}
  };

  useEffect(()=>{let cancelled=false;async function load(){
    try{const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_activos_v32_geojson`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({p_tipo_codigo:null,p_progresiva_desde_m:null,p_progresiva_hasta_m:null})});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);const json=await response.json() as AssetCollection;if(!cancelled)setCollection(json);
    }catch(error){if(!cancelled)setLoadError(error instanceof Error?error.message:"No se pudo leer inventario")}
  } void load();setOrders(migrateLocalOrders());void loadRemote();const t=window.setInterval(()=>void loadRemote(),10000);return()=>{cancelled=true;window.clearInterval(t)}},[]);

  useEffect(()=>{const readDom=()=>{const id=document.querySelector<HTMLElement>(".dock-identity strong")?.textContent?.trim()??"";if(id)setSelectedId(id);
    const activeButton=Array.from(document.querySelectorAll<HTMLButtonElement>(".bim-model-picker button.active"))[0];
    setIfcModel(activeButton?.textContent?.trim()??document.querySelector<HTMLElement>(".bim-panel .panel-titlebar span")?.textContent?.trim()??"");
    const pairs=Array.from(document.querySelectorAll<HTMLElement>(".bim-semantic-inspector p")).map(row=>[row.querySelector("span")?.textContent?.trim()??"",row.querySelector("b")?.textContent?.trim()??""] as [string,string]).filter(([key])=>key);setIfcProps(pairs);
  };readDom();const timer=window.setInterval(readDom,450);return()=>window.clearInterval(timer)},[]);

  useEffect(()=>{
    if(!picking)return;
    let target:HTMLElement|null=null;
    const handler=(e:MouseEvent)=>{const point=clientToLatLon(e.clientX,e.clientY);if(!point)return;e.preventDefault();e.stopPropagation();setLat(point.lat.toFixed(7));setLon(point.lon.toFixed(7));setPicking(false);};
    const attach=()=>{const next=document.querySelector<HTMLElement>(".leaflet-container");if(next!==target){target?.removeEventListener("click",handler,true);target=next;if(target){target.addEventListener("click",handler,true);target.style.cursor="crosshair"}}};
    attach();const timer=window.setInterval(attach,200);return()=>{window.clearInterval(timer);target?.removeEventListener("click",handler,true);if(target)target.style.cursor=""};
  },[picking]);

  const allOrders=useMemo(()=>[...remoteOrders,...orders.filter(o=>!remoteOrders.some(r=>r.id===o.id))],[remoteOrders,orders]);
  useEffect(()=>{
    let overlay:HTMLDivElement|null=null;
    const render=()=>{const map=document.querySelector<HTMLElement>(".leaflet-container");if(!map)return;
      overlay=map.querySelector<HTMLDivElement>(".rn174-ot-overlay");if(!overlay){overlay=document.createElement("div");overlay.className="rn174-ot-overlay";map.appendChild(overlay)}
      overlay.innerHTML="";
      allOrders.filter(o=>Number.isFinite(o.lat)&&Number.isFinite(o.lon)).forEach(o=>{const p=geoToScreen(o.lat!,o.lon!);if(!p)return;
        const marker=document.createElement("div");marker.className=`rn174-ot-marker ${o.prioridad==="URGENTE"?"urgent":""}`;marker.style.left=`${p.x}px`;marker.style.top=`${p.y}px`;marker.title=`${o.codigo||o.id} · ${o.tipo} · ${o.tarea}`;
        const dot=document.createElement("span");dot.textContent="OT";marker.appendChild(dot);overlay!.appendChild(marker);
      });
    };
    render();const timer=window.setInterval(render,300);return()=>{window.clearInterval(timer);overlay?.remove()};
  },[allOrders]);

  const features=collection?.features??[];
  const selected=useMemo(()=>features.find(f=>s(f.id)===selectedId||s(f.properties.codigo)===selectedId),[features,selectedId]);
  const parsedPk=pk??assetPk(selected);
  const nearest=useMemo(()=>parsedPk===undefined?[]:[...features].map(feature=>({feature,distance:distanceToPk(feature,parsedPk)})).filter(i=>Number.isFinite(i.distance)).sort((a,b)=>a.distance-b.distance).slice(0,12),[features,parsedPk]);
  const lots=useMemo(()=>Array.from(new Set(features.map(f=>s(f.properties.lote_origen)).filter(Boolean))).sort(),[features]);
  useEffect(()=>{if(!lotA&&lots[0])setLotA(lots[0]);if(!lotB&&lots[1])setLotB(lots[1])},[lots,lotA,lotB]);
  const comparison=useMemo(()=>{if(!lotA||!lotB||lotA===lotB)return null;const a=features.filter(f=>s(f.properties.lote_origen)===lotA),b=features.filter(f=>s(f.properties.lote_origen)===lotB);
    const ma=new Map(a.map(f=>[featureKey(f),f])),mb=new Map(b.map(f=>[featureKey(f),f]));const added=[...mb.keys()].filter(k=>!ma.has(k)),removed=[...ma.keys()].filter(k=>!mb.has(k)),common=[...ma.keys()].filter(k=>mb.has(k));
    const moved=common.filter(k=>{const pa=assetPk(ma.get(k)),pb=assetPk(mb.get(k));return pa!==undefined&&pb!==undefined&&Math.abs(pa-pb)>1});return{a:a.length,b:b.length,added,removed,common,moved}},[features,lotA,lotB]);
  const completeness=useMemo(()=>{if(!selected)return 0;const p=selected.properties;const values=[p.codigo,p.familia,p.tipo_activo??p.tipo,p.progresiva_inicio_m??p.progresiva_m,p.estado_validacion,p.calidad_dato,p.precision_m,p.lote_origen];return Math.round(values.filter(v=>v!==undefined&&v!==null&&v!=="").length/values.length*100)},[selected]);
  const score=Math.round(((decision.seguridad*.35+decision.condicion*.25+decision.legal*.2+decision.transito*.2)/5)*100);
  const scoreLabel=score>=75?"MUY ALTA":score>=55?"ALTA":score>=35?"MEDIA":score>0?"BAJA":"SIN EVALUAR";

  const locatePk=()=>{const value=parsePk(pkText);setPk(value);if(value===undefined||!features.length)return;
    const points=features.filter(f=>String(f.geometry?.type||"").includes("Point")&&assetPk(f)!==undefined);
    const pool=points.length?points:features;const match=[...pool].map(feature=>({feature,distance:Math.abs((assetPk(feature)??Infinity)-value)})).sort((a,b)=>a.distance-b.distance)[0];
    if(match?.feature)openAssetInGis(match.feature);
  };
  const useAssetLocation=()=>{const p=representativePoint(selected);if(!p){setSyncMessage("El activo seleccionado no aporta una geometría utilizable.");return}setLat(p.lat.toFixed(7));setLon(p.lon.toFixed(7));};
  const persistLocal=(next:WorkOrder[])=>{setOrders(next);localStorage.setItem(WORK_ORDER_KEY,JSON.stringify(next))};
  const saveDecision=()=>{if(selectedId)localStorage.setItem(`rn174_decision_${selectedId}`,JSON.stringify({...decision,score,savedAt:new Date().toISOString()}))};
  const remoteCreate=async(order:WorkOrder)=>{
    const token=currentAccessToken();if(!token)return false;
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_ot_crear`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({
      p_asset_id:order.assetId||null,p_asset_codigo:order.codigo||null,p_tipo:order.tipo,p_prioridad:order.prioridad,p_tarea:order.tarea,p_responsable:order.responsable||null,
      p_vencimiento:order.vencimiento||null,p_progresiva_m:order.progresiva??null,p_lon:order.lon,p_lat:order.lat,p_observaciones:null
    })});return r.ok;
  };
  const createOrder=async()=>{
    if(!taskText.trim()||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon)))return;
    const p=selected?.properties??{};const item:WorkOrder={id:`OT-${Date.now()}`,assetId:s(selected?.id),codigo:s(p.codigo),tipo:taskType,tarea:taskText.trim(),responsable:responsible.trim(),vencimiento:due,prioridad:priority,estado:"ABIERTA",creado:new Date().toISOString(),lat:Number(lat),lon:Number(lon),progresiva:assetPk(selected),source:"LOCAL"};
    setSyncMessage("Guardando…");let synced=false;try{synced=await remoteCreate(item)}catch{}
    if(synced){setSyncMessage("Guardado en Supabase/PostGIS. QGIS verá la misma OT.");await loadRemote()}else{persistLocal([item,...orders]);setSyncMessage(currentAccessToken()?"No se pudo sincronizar; quedó local. Verificá migración/permisos.":"Guardado local. Para sincronizar con QGIS se requiere sesión Supabase autenticada.");}
    setTaskText("");
  };
  const deleteOrder=async(order:WorkOrder)=>{
    if(order.source==="LOCAL"){persistLocal(orders.filter(o=>o.id!==order.id));setSyncMessage("OT local eliminada.");return}
    const token=currentAccessToken();if(!token){setSyncMessage("Para eliminar una OT sincronizada se requiere sesión Supabase autenticada.");return}
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/rn174_ot_eliminar`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({p_ot_id:order.id})});
    if(r.ok){setSyncMessage("OT eliminada lógicamente; queda en auditoría.");await loadRemote()}else setSyncMessage("No se pudo eliminar la OT sincronizada.");
  };
  const syncLocal=async()=>{
    if(!orders.length)return;const token=currentAccessToken();if(!token){setSyncMessage("No hay sesión Supabase autenticada.");return}
    let ok=0;const pending:WorkOrder[]=[];for(const order of orders){try{if(await remoteCreate(order))ok++;else pending.push(order)}catch{pending.push(order)}}
    persistLocal(pending);setSyncMessage(`${ok} OT sincronizadas; ${pending.length} pendientes.`);await loadRemote();
  };
  const exportOrders=()=>{const header=["id","asset_id","codigo","tipo","tarea","responsable","vencimiento","prioridad","estado","creado","lat","lon","progresiva","source"];
    const rows=allOrders.map(o=>header.map(k=>`"${String(o[k as keyof WorkOrder]??"").replace(/"/g,'""')}"`).join(","));downloadText([header.join(","),...rows].join("\n"),"RN174_ot_inspecciones.csv","text/csv;charset=utf-8")};

  const tabs:Array<[TabKey,string]>=[["PK","PK"],["SECCION","Sección"],["IFC","IFC"],["HISTORIAL","Historial"],["DECISION","Decisión"],["COMPARAR","Comparar"],["OT","OT / Inspección"]];

  return <><button className="v4-launch" type="button" onClick={()=>setOpen(true)}><Box size={15}/> Ingeniería</button>{open&&<aside className="v4-console">
    <header className="v4-head"><div><Box size={17}/><span><strong>Consola de Ingeniería</strong><small>RN174 · análisis + operación GIS</small></span></div><button onClick={()=>setOpen(false)}><X size={16}/></button></header>
    <div className="v4-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
    <div className="v4-body">{loadError&&<div className="v4-alert">No se pudo cargar la capa analítica: {loadError}</div>}
      {tab==="PK"&&<><section className="v4-card"><h3>Consulta por progresiva</h3><div className="v4-inline"><input value={pkText} onChange={e=>setPkText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&locatePk()} placeholder="Ej. 42+000"/><button onClick={locatePk}><Crosshair size={14}/> Localizar</button></div><p>Busca primero activos puntuales próximos al PK, evitando usar el inicio de una línea larga como sustituto de la progresiva.</p></section><section className="v4-card"><h3>Activos relacionados · {formatPk(parsedPk)}</h3><div className="v4-list">{nearest.map(({feature,distance},i)=><button key={`${featureKey(feature)}-${i}`} onClick={()=>openAssetInGis(feature)}><span><b>{featureKey(feature)}</b><small>{s(feature.properties.nombre)||s(feature.properties.tipo_activo)||s(feature.properties.familia)}</small></span><em>{distance===0?"atraviesa PK":`${distance.toFixed(1)} m`}</em></button>)}</div></section></>}
      {tab==="SECCION"&&<>{parsedPk!==undefined&&parsedPk>=4632.6&&parsedPk<=4800?<SectionT13 pk={parsedPk}/>:<div className="v4-note"><strong>Sección transversal</strong><span>Sólo se dibuja T13 dentro de PK 4+632,60–4+800,00 para no inventar geometría.</span></div>}{parsedPk!==undefined&&<InventoryStrip features={features} pk={parsedPk}/>}</>}
      {tab==="IFC"&&<><section className="v4-card"><h3>Modelo IFC activo</h3><p className="v4-strong">{ifcModel||"Ningún modelo identificado"}</p><p>Seleccioná un componente en el visor 3D para leer sus propiedades semánticas.</p></section>{ifcProps.length?<section className="v4-card"><h3>Propiedades del componente</h3><div className="v4-props">{ifcProps.map(([key,value])=><p key={key}><span>{key}</span><b>{value}</b></p>)}</div></section>:<div className="v4-note"><strong>Sin componente seleccionado</strong><span>Los modelos semánticos exponen propiedades al seleccionar una pieza.</span></div>}</>}
      {tab==="HISTORIAL"&&<section className="v4-card"><h3>Historial disponible del activo</h3>{selected?<div className="v4-timeline"><div><i/><span><b>Estado 0 / origen</b><small>{s(selected.properties.lote_origen)||"fuente no indicada"}</small></span></div><div><i/><span><b>Validación actual</b><small>{s(selected.properties.estado_validacion)||"SIN ESTADO"}</small></span></div><div><i/><span><b>OT / inspecciones vinculadas</b><small>{allOrders.filter(o=>o.assetId===s(selected.id)||o.codigo===s(selected.properties.codigo)).length} registros</small></span></div></div>:<p>Seleccioná un activo GIS.</p>}</section>}
      {tab==="DECISION"&&<><section className="v4-card"><h3>Escenario de priorización</h3>{([["seguridad","Seguridad"],["condicion","Condición física"],["legal","Riesgo legal"],["transito","Impacto operativo"]] as const).map(([key,label])=><label className="v4-slider" key={key}><span>{label}<b>{decision[key]}/5</b></span><input type="range" min="0" max="5" step="1" value={decision[key]} onChange={e=>setDecision(d=>({...d,[key]:Number(e.target.value)}))}/></label>)}</section><section className="v4-score"><span>Prioridad</span><strong>{score}</strong><b>{scoreLabel}</b><button onClick={saveDecision} disabled={!selectedId}>Guardar local</button></section><div className="v4-note"><strong>Completitud: {completeness}%</strong><span>Ayuda comparativa; no reemplaza inspección ni decisión contractual.</span></div></>}
      {tab==="COMPARAR"&&<><section className="v4-card"><h3>Comparador por lote / campaña</h3><label className="v4-field"><span>Lote A</span><select value={lotA} onChange={e=>setLotA(e.target.value)}>{lots.map(l=><option key={l}>{l}</option>)}</select></label><label className="v4-field"><span>Lote B</span><select value={lotB} onChange={e=>setLotB(e.target.value)}>{lots.map(l=><option key={l}>{l}</option>)}</select></label></section>{comparison&&<section className="v4-card"><div className="v4-metrics"><div><span>A</span><b>{comparison.a}</b></div><div><span>B</span><b>{comparison.b}</b></div><div><span>Nuevos</span><b>{comparison.added.length}</b></div><div><span>Ausentes</span><b>{comparison.removed.length}</b></div><div><span>PK cambiado</span><b>{comparison.moved.length}</b></div></div></section>}</>}
      {tab==="OT"&&<><section className="v4-card"><div className="v4-title-row"><h3>Nueva OT / inspección georreferenciada</h3><span className={`v5-db ${remoteReady?"ok":""}`}>{remoteReady?"POSTGIS":"LOCAL"}</span></div><p className="v4-strong">{selected?`${s(selected.properties.codigo)||s(selected.id)} · ${s(selected.properties.nombre)||s(selected.properties.tipo_activo)||"Activo"}`:"Sin activo vinculado"}</p>
        <div className="v4-grid2"><label className="v4-field"><span>Tipo</span><select value={taskType} onChange={e=>setTaskType(e.target.value)}><option>INSPECCION</option><option>VERIFICACION</option><option>CONSERVACION</option><option>REPARACION</option><option>OTRA</option></select></label><label className="v4-field"><span>Prioridad</span><select value={priority} onChange={e=>setPriority(e.target.value)}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>URGENTE</option></select></label></div>
        <label className="v4-field"><span>Tarea</span><textarea value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="Qué debe verificarse o ejecutarse"/></label>
        <div className="v4-grid2"><label className="v4-field"><span>Responsable</span><input value={responsible} onChange={e=>setResponsible(e.target.value)}/></label><label className="v4-field"><span>Vencimiento</span><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label></div>
        <div className="v5-location"><div className="v4-title-row"><h3><MapPin size={14}/> Ubicación GIS</h3><span>{lat&&lon?`${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`:"sin ubicación"}</span></div>
          <div className="v4-grid2"><label className="v4-field"><span>Latitud</span><input value={lat} onChange={e=>setLat(e.target.value)} placeholder="-32..."/></label><label className="v4-field"><span>Longitud</span><input value={lon} onChange={e=>setLon(e.target.value)} placeholder="-60..."/></label></div>
          <div className="v5-location-buttons"><button onClick={useAssetLocation} disabled={!selected}>Usar activo</button><button className={picking?"active":""} onClick={()=>setPicking(v=>!v)}><Crosshair size={13}/>{picking?"Clic en el mapa…":"Pick en mapa"}</button></div>
        </div>
        <button className="v4-primary" onClick={createOrder} disabled={!taskText.trim()||!lat||!lon}>Crear OT geográfica</button>{syncMessage&&<p className="v5-syncmsg">{syncMessage}</p>}
      </section>
      <section className="v4-card"><div className="v4-title-row"><h3>OT / Inspecciones · {allOrders.length}</h3><span className="v5-actions"><button onClick={syncLocal} disabled={!orders.length}><UploadCloud size={13}/> Sync</button><button onClick={exportOrders} disabled={!allOrders.length}><Download size={13}/> CSV</button><button onClick={loadRemote}><RefreshCw size={13}/></button></span></div>
        <div className="v4-orders">{allOrders.slice(0,20).map(order=><div key={`${order.source}-${order.id}`}><span><b>{order.tipo} · {order.prioridad}</b><small>{order.codigo||order.id} · {order.tarea}</small><small>{order.lat!==undefined?`${order.lat.toFixed(5)}, ${order.lon?.toFixed(5)} · `:""}{order.source}</small></span><em>{order.estado}</em><button className="v5-delete" title="Eliminar" onClick={()=>deleteOrder(order)}><Trash2 size={13}/></button></div>)}</div>
        <p>Las OT con coordenadas aparecen como marcadores <b>OT</b> en el GIS. Supabase/PostGIS es la fuente común con QGIS; el borrado remoto es lógico y auditado.</p></section></>}
    </div><footer><CircleDot size={11}/> V5 · operación geográfica preparada para WEB ↔ Supabase/PostGIS ↔ QGIS</footer>
  </aside>}
  <style>{`
  .v4-launch{position:fixed;left:128px;bottom:104px;z-index:2400;display:flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid #0b7acb;border-radius:6px;background:#0b7acb;color:#fff;font-size:10.5px;font-weight:850;box-shadow:0 6px 20px #0f172a33;cursor:pointer}
  .v4-console{position:fixed;left:12px;top:78px;bottom:100px;z-index:2600;width:min(465px,calc(100vw - 24px));display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;background:#f7f9fc;border:1px solid #b9c8d8;border-radius:9px;box-shadow:0 20px 55px #0f172a44;overflow:hidden;color:#24364d;font-family:Arial,Helvetica,sans-serif}
  .v4-head{height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;background:#0d1c34;color:#fff}.v4-head>div{display:flex;align-items:center;gap:8px}.v4-head span{display:grid}.v4-head strong{font-size:12.5px}.v4-head small{font-size:9px;color:#93b4d7}.v4-head button{display:grid;place-items:center;width:28px;height:28px;border:1px solid #ffffff33;border-radius:5px;background:#ffffff0d;color:#fff;cursor:pointer}
  .v4-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:7px;background:#e8eef5}.v4-tabs button{min-height:29px;padding:5px 4px;border:1px solid #cbd6e2;border-radius:4px;background:#fff;color:#4c6077;font-size:9.5px;font-weight:800;cursor:pointer}.v4-tabs button.active{background:#0b7acb;border-color:#0b7acb;color:#fff}.v4-body{overflow:auto;padding:10px}
  .v4-card,.v4-note,.v4-score,.v4-section-box{margin-bottom:9px;padding:11px;border:1px solid #d4dee9;border-radius:7px;background:#fff}.v4-card h3,.v4-section-title strong{margin:0 0 8px;font-size:11.5px}.v4-card p,.v4-note span{font-size:9.5px;line-height:1.45;color:#5d6f83}.v4-strong{font-weight:800;color:#173b63!important}
  .v4-inline,.v4-title-row,.v4-section-title{display:flex;align-items:center;justify-content:space-between;gap:7px}.v4-inline input{flex:1}.v4-inline button,.v4-title-row button,.v5-location-buttons button,.v4-primary{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid #bdd0e2;border-radius:5px;background:#fff;color:#36536e;padding:7px 9px;font-size:9.5px;font-weight:800;cursor:pointer}.v4-primary{width:100%;background:#0b7acb;border-color:#0b7acb;color:#fff}
  .v4-field{display:grid;gap:4px;margin:6px 0}.v4-field span{font-size:8.5px;font-weight:800;color:#5b6d80;text-transform:uppercase}.v4-field input,.v4-field select,.v4-field textarea,.v4-inline input{min-height:31px;border:1px solid #cbd8e5;border-radius:5px;background:#fff;padding:7px;font-size:10px;color:#24364d}.v4-field textarea{min-height:58px;resize:vertical}.v4-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .v4-list{display:grid;gap:5px}.v4-list button{display:flex;align-items:center;justify-content:space-between;text-align:left;border:1px solid #d9e2ec;border-radius:5px;background:#f9fbfd;padding:7px;color:#2d4964}.v4-list span{display:grid}.v4-list b{font-size:9px;color:#0874bd}.v4-list small,.v4-list em{font-size:8.3px}.v4-list em{font-style:normal}
  .v4-props p{display:grid;grid-template-columns:1fr 1.2fr;gap:6px;margin:0;padding:5px 0;border-bottom:1px solid #edf1f5;font-size:9px}.v4-props span{color:#68798a}.v4-timeline>div{display:flex;gap:8px;padding:7px 0}.v4-timeline i{width:8px;height:8px;margin-top:3px;border-radius:50%;background:#0b7acb}.v4-timeline span{display:grid}.v4-timeline b{font-size:9.5px}.v4-timeline small{font-size:8.5px;color:#718197}
  .v4-slider{display:grid;gap:4px;margin:9px 0}.v4-slider span{display:flex;justify-content:space-between;font-size:9.5px}.v4-score{display:grid;grid-template-columns:auto auto auto;align-items:center;gap:8px}.v4-score strong{font-size:26px;color:#0b7acb}.v4-score b{font-size:10px}.v4-score button{grid-column:1/-1}.v4-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.v4-metrics div{display:grid;text-align:center;background:#eef5fb;padding:8px;border-radius:5px}.v4-metrics span{font-size:8px}.v4-metrics b{font-size:16px}
  .v4-orders{display:grid;gap:5px}.v4-orders>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:6px;padding:7px;border:1px solid #dde5ed;border-radius:5px;background:#fbfcfe}.v4-orders span{display:grid;min-width:0}.v4-orders b{font-size:9px}.v4-orders small{font-size:8px;color:#66788b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v4-orders em{font-size:8px;font-style:normal;color:#0b7acb}.v5-delete{display:grid;place-items:center;width:26px;height:26px;border:1px solid #f1c5c5;border-radius:5px;background:#fff;color:#b42318;cursor:pointer}
  .v5-location{margin:9px 0;padding:8px;border:1px dashed #98bad6;border-radius:6px;background:#f5faff}.v5-location h3{display:flex;align-items:center;gap:5px}.v5-location-buttons{display:flex;gap:6px}.v5-location-buttons button.active{background:#0b7acb;color:#fff}.v5-syncmsg{margin:7px 0 0;padding:7px;background:#eef7ff;border-radius:5px}.v5-db{font-size:8px;font-weight:900;padding:3px 5px;border-radius:4px;background:#fff1c7;color:#8a5d00}.v5-db.ok{background:#dff7e7;color:#087438}.v5-actions{display:flex;gap:4px}
  .v4-section-box svg{width:100%;height:auto}.v4-ground,.v4-rowline{stroke:#94a3b8;stroke-width:1}.v4-axis{stroke:#ef4444;stroke-width:1.4}.v4-fill{fill:#c9b08b}.v4-layer.l1{fill:#64748b}.v4-layer.l2{fill:#334155}.v4-layer.l3{fill:#111827}.v4-dot{fill:#0b7acb}.v4-section-box text{font-size:9px;fill:#40556c}
  .v4-note{display:grid;gap:4px}.v4-note strong{font-size:10px}.v4-alert{margin-bottom:8px;padding:8px;border-radius:5px;background:#fee2e2;color:#991b1b;font-size:9px}
  .v4-console footer{display:flex;align-items:center;gap:5px;padding:7px 10px;border-top:1px solid #d9e2ec;background:#f1f5f9;color:#687b8e;font-size:8.5px}
  .rn174-ot-overlay{position:absolute;inset:0;z-index:650;pointer-events:none}.rn174-ot-marker{position:absolute;transform:translate(-50%,-50%);filter:drop-shadow(0 2px 4px #0006)}.rn174-ot-marker span{display:grid;place-items:center;width:27px;height:27px;border:3px solid #fff;border-radius:50%;background:#7c3aed;color:#fff;font:bold 9px Arial}.rn174-ot-marker.urgent span{background:#dc2626}
  @media(max-width:900px){.v4-console{width:min(94vw,465px)}.v4-grid2{grid-template-columns:1fr}.v4-launch{left:12px}}
  `}</style></>;
}

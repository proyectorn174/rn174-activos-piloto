"use client";

import { useEffect } from "react";

/**
 * Ajustes de composición/aislamiento del visor BIM.
 *
 * Objetivos:
 * - El catálogo IFC vive únicamente en CDE.
 * - Un solo juego de herramientas controla el modelo activo.
 * - Cuando Peaje/Señales están activos, se ocultan por completo los controles
 *   nativos del Puente para evitar acciones sobre dos cámaras distintas.
 * - Selector, identificación y herramientas quedan en filas independientes.
 */
export function BimUiPolish() {
  useEffect(() => {
    let disposed = false;

    const repairBimDom = () => {
      if (disposed) return;

      const tree = document.querySelector<HTMLElement>(".tree-card");
      const host = document.querySelector<HTMLElement>(".bim-model-switcher-tree-host");
      const cdeBridgeLink = tree?.querySelector<HTMLAnchorElement>(
        'a[href*="RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc"]',
      );

      // Si el portal se insertó junto al enlace de descarga del panel 3D,
      // mover el MISMO nodo al árbol CDE. React conserva el portal.
      if (host && tree && cdeBridgeLink && !tree.contains(host)) {
        cdeBridgeLink.insertAdjacentElement("afterend", host);
      }

      const stage = document.querySelector<HTMLElement>(".bim-stage");
      if (stage) {
        stage.classList.add("bim-layout-polished");
        const alternateModelVisible = Boolean(stage.querySelector(":scope > .bim-switch-overlay"));
        stage.classList.toggle("bim-alt-model-active", alternateModelVisible);
      }
    };

    repairBimDom();
    const timer = window.setInterval(repairBimDom, 160);
    const observer = new MutationObserver(repairBimDom);
    observer.observe(document.body, { subtree: true, childList: true, attributes: false });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      observer.disconnect();
      document.querySelector<HTMLElement>(".bim-stage")?.classList.remove(
        "bim-layout-polished",
        "bim-alt-model-active",
      );
    };
  }, []);

  return (
    <style>{`
      .bim-stage.bim-layout-polished{
        container-type:inline-size;
        overflow:hidden!important;
      }

      /* ================================================================
         CDE: una sola representación de cada IFC.
         El enlace nativo del Puente se oculta porque el selector BIM ya
         vuelve a dibujar Puente + Peaje + Señales dentro del mismo grupo.
         ================================================================ */
      .tree-card > a.tree-node[href*="RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc"]{
        display:none!important;
      }
      .bim-actions .bim-model-switcher-tree-host,
      .bim-stage .bim-model-switcher-tree-host{
        display:none!important;
      }
      .tree-card .bim-model-switcher-tree-host{
        display:block!important;
        width:100%!important;
      }
      .tree-card .bim-tree-model{
        display:grid!important;
        grid-template-columns:15px minmax(0,1fr) auto!important;
        gap:7px!important;
        align-items:center!important;
        overflow:hidden!important;
      }
      .tree-card .bim-tree-model span{
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }

      /* ================================================================
         AISLAMIENTO DE CÁMARA/CONTROLES.
         Peaje y Señales usan su propio renderer + OrbitControls. Mientras
         uno de ellos está activo, ningún control nativo del Puente puede
         quedar visible ni recibir clics.
         ================================================================ */
      .bim-stage.bim-alt-model-active > .three-viewport,
      .bim-stage.bim-alt-model-active > .bim-model-badge,
      .bim-stage.bim-alt-model-active > .bim-provenance,
      .bim-stage.bim-alt-model-active > .bim-actions,
      .bim-stage.bim-alt-model-active > .bim-toolbar{
        opacity:0!important;
        visibility:hidden!important;
        pointer-events:none!important;
      }
      .bim-stage.bim-alt-model-active > .bim-switch-overlay{
        z-index:70!important;
        pointer-events:auto!important;
      }

      /* Selector permanente del modelo IFC. */
      .bim-stage.bim-layout-polished > .bim-model-picker{
        top:10px!important;
        left:50%!important;
        right:auto!important;
        transform:translateX(-50%)!important;
        z-index:110!important;
        box-shadow:0 4px 14px rgba(15,23,42,.13)!important;
      }

      /* Identidad: segunda fila a la izquierda. */
      .bim-stage.bim-layout-polished > .bim-model-badge,
      .bim-stage.bim-layout-polished .bim-switch-badge{
        top:51px!important;
        left:10px!important;
        right:auto!important;
        max-width:43%!important;
        min-width:0!important;
        z-index:100!important;
        padding:7px 9px!important;
      }
      .bim-stage.bim-layout-polished > .bim-model-badge strong,
      .bim-stage.bim-layout-polished .bim-switch-badge strong{
        display:block!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }

      /* Herramientas: una única barra a la derecha. */
      .bim-stage.bim-layout-polished > .bim-actions,
      .bim-stage.bim-layout-polished .bim-switch-actions{
        top:51px!important;
        right:10px!important;
        left:auto!important;
        z-index:105!important;
        display:flex!important;
        align-items:center!important;
        justify-content:flex-end!important;
        gap:5px!important;
        flex-wrap:nowrap!important;
      }
      .bim-stage.bim-layout-polished > .bim-actions button,
      .bim-stage.bim-layout-polished > .bim-actions a,
      .bim-stage.bim-layout-polished .bim-switch-actions button,
      .bim-stage.bim-layout-polished .bim-switch-actions a{
        min-width:auto!important;
        height:31px!important;
        padding:0 8px!important;
        white-space:nowrap!important;
      }
      .bim-stage.bim-layout-polished .bim-switch-actions button.active{
        color:#fff!important;
        background:#0b7acb!important;
        border-color:#0b7acb!important;
      }

      /* Dejar aire superior al modelo para que los controles no tapen geometría. */
      .bim-stage.bim-alt-model-active .bim-switch-viewport canvas{
        display:block;
      }

      /* Panel reducido: tres filas claras, nunca superpuestas. */
      @container (max-width: 600px){
        .bim-stage.bim-layout-polished > .bim-model-picker{
          left:10px!important;
          right:10px!important;
          transform:none!important;
          justify-content:center!important;
          width:auto!important;
        }
        .bim-stage.bim-layout-polished > .bim-model-badge,
        .bim-stage.bim-layout-polished .bim-switch-badge{
          top:50px!important;
          left:10px!important;
          right:10px!important;
          max-width:none!important;
          width:auto!important;
        }
        .bim-stage.bim-layout-polished > .bim-actions,
        .bim-stage.bim-layout-polished .bim-switch-actions{
          top:91px!important;
          left:10px!important;
          right:10px!important;
          justify-content:center!important;
          flex-wrap:nowrap!important;
        }
      }

      @container (max-width: 455px){
        .bim-stage.bim-layout-polished > .bim-actions button,
        .bim-stage.bim-layout-polished .bim-switch-actions button{
          font-size:0!important;
          width:34px!important;
          padding:0!important;
          justify-content:center!important;
        }
        .bim-stage.bim-layout-polished > .bim-actions a,
        .bim-stage.bim-layout-polished .bim-switch-actions a{
          padding:0 6px!important;
          font-size:8.5px!important;
        }
      }
    `}</style>
  );
}

"use client";

import { useEffect } from "react";

/**
 * Ajustes de composición del visor BIM sin alterar la lógica/modelos.
 * - Reubica el portal del catálogo IFC dentro del CDE (evita que aparezca sobre el 3D).
 * - Ordena selector, identificación y herramientas en filas independientes.
 * - Mantiene Rotar / Centrar / Ver en GIS / IFC 4.3 visibles en Puente, Peaje y Señales.
 */
export function BimUiPolish() {
  useEffect(() => {
    let disposed = false;

    const repairBimDom = () => {
      if (disposed) return;

      const host = document.querySelector<HTMLElement>(".bim-model-switcher-tree-host");
      const tree = document.querySelector<HTMLElement>(".tree-card");
      const cdeBridgeLink = tree?.querySelector<HTMLAnchorElement>(
        'a[href*="RN174_PUENTE_PRINCIPAL_IFC4X3_PRELIMINAR.ifc"]',
      );

      // BimModelSwitcher busca el primer enlace al IFC del puente. El primer enlace
      // también existe en la barra de acciones del 3D, por lo que el portal puede
      // terminar allí. Movemos el MISMO nodo al árbol CDE; React conserva el portal.
      if (host && cdeBridgeLink && !tree?.contains(host)) {
        cdeBridgeLink.insertAdjacentElement("afterend", host);
      }

      const stage = document.querySelector<HTMLElement>(".bim-stage");
      if (stage) stage.classList.add("bim-layout-polished");
    };

    repairBimDom();
    const timer = window.setInterval(repairBimDom, 180);
    const observer = new MutationObserver(repairBimDom);
    observer.observe(document.body, { subtree: true, childList: true });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <style>{`
      /* El panel IFC funciona como contenedor adaptable porque el usuario puede redimensionarlo. */
      .bim-stage.bim-layout-polished{container-type:inline-size;overflow:hidden!important}

      /* Fila 1: selector persistente de modelo. */
      .bim-stage.bim-layout-polished > .bim-model-picker{
        top:10px!important;
        left:50%!important;
        right:auto!important;
        transform:translateX(-50%)!important;
        z-index:95!important;
        box-shadow:0 4px 14px rgba(15,23,42,.13)!important;
      }

      /* Fila 2 izquierda: identificación del IFC activo. */
      .bim-stage.bim-layout-polished > .bim-model-badge,
      .bim-stage.bim-layout-polished .bim-switch-badge{
        top:51px!important;
        left:10px!important;
        right:auto!important;
        max-width:42%!important;
        min-width:0!important;
        z-index:90!important;
        padding:7px 9px!important;
      }
      .bim-stage.bim-layout-polished > .bim-model-badge strong,
      .bim-stage.bim-layout-polished .bim-switch-badge strong{
        display:block!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }

      /* Fila 2 derecha: MISMAS herramientas para cualquier IFC. */
      .bim-stage.bim-layout-polished > .bim-actions,
      .bim-stage.bim-layout-polished .bim-switch-actions{
        top:51px!important;
        right:10px!important;
        left:auto!important;
        z-index:92!important;
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

      /* El catálogo IFC debe vivir exclusivamente en la pantalla CDE. */
      .bim-actions .bim-model-switcher-tree-host,
      .bim-stage .bim-model-switcher-tree-host{
        display:none!important;
      }
      .tree-card .bim-model-switcher-tree-host{
        display:block!important;
        width:100%!important;
      }

      /* Evitar que nombres IFC largos invadan otras columnas. */
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

      /* Panel estrecho: tres filas, sin superposiciones. */
      @container (max-width: 560px){
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
          flex-wrap:wrap!important;
        }
      }

      /* Muy estrecho: conservar iconos y esconder texto secundario antes de superponer. */
      @container (max-width: 430px){
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
        }
      }
    `}</style>
  );
}

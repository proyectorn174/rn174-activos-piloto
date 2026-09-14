"use client";

export function ViewerLayoutCleanup() {
  return (
    <style jsx global>{`
      /* Mantener la fila técnica para no alterar el orden del CSS Grid. */
      body .cde-shell {
        grid-template-rows: 64px 0 minmax(0, 1fr) 88px !important;
      }

      /* Ocultar la advertencia sin usar display:none: el elemento sigue
         ocupando su celda de grid y el workspace conserva la fila correcta. */
      body .preliminary-strip {
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}

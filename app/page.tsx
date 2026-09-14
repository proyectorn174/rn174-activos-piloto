import { BimModelSwitcher } from "@/components/bim-model-switcher";
import { BimUiPolish } from "@/components/bim-ui-polish";
import { Rn174Viewer } from "@/components/rn174-viewer";

export default function Home() {
  return (
    <>
      <Rn174Viewer />
      <BimModelSwitcher />
      <BimUiPolish />
      <div
        role="status"
        style={{
          position: "fixed",
          zIndex: 5000,
          top: 60,
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "min(760px, calc(100vw - 32px))",
          padding: "6px 12px",
          color: "#7c4a03",
          background: "rgba(255, 247, 214, 0.96)",
          border: "1px solid #f0c35a",
          borderRadius: 6,
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.16)",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.02em",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        ⚠ DATOS PRELIMINARES / NO VALIDADOS · Publicación temporal abierta: visible no significa aprobado.
      </div>
    </>
  );
}

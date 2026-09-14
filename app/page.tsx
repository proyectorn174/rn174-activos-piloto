import { BimModelSwitcher } from "@/components/bim-model-switcher";
import { BimSemanticExtension } from "@/components/bim-semantic-extension";
import { BimUiPolish } from "@/components/bim-ui-polish";
import { Rn174Viewer } from "@/components/rn174-viewer";
import { ViewerConsoleFloating } from "@/components/viewer-console-floating";
import { ViewerLayoutCleanup } from "@/components/viewer-layout-cleanup";
import { VisorV5Tools } from "@/components/visor-v5-tools";

export default function Home() {
  return (
    <>
      <Rn174Viewer />
      <BimModelSwitcher />
      <BimSemanticExtension />
      <BimUiPolish />
      <ViewerLayoutCleanup />
      <VisorV5Tools />
      <ViewerConsoleFloating />
    </>
  );
}

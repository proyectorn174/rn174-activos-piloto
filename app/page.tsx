import { BimModelSwitcher } from "@/components/bim-model-switcher";
import { BimSemanticExtension } from "@/components/bim-semantic-extension";
import { BimUiPolish } from "@/components/bim-ui-polish";
import { Rn174Viewer } from "@/components/rn174-viewer";
import { ViewerLayoutCleanup } from "@/components/viewer-layout-cleanup";
import { VisorV4Tools } from "@/components/visor-v4-tools";

export default function Home() {
  return (
    <>
      <Rn174Viewer />
      <BimModelSwitcher />
      <BimSemanticExtension />
      <BimUiPolish />
      <ViewerLayoutCleanup />
      <VisorV4Tools />
    </>
  );
}

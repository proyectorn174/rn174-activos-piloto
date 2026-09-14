import { BimModelSwitcher } from "@/components/bim-model-switcher";
import { BimSemanticExtension } from "@/components/bim-semantic-extension";
import { BimUiPolish } from "@/components/bim-ui-polish";
import { Rn174Viewer } from "@/components/rn174-viewer";

export default function Home() {
  return (
    <>
      <Rn174Viewer />
      <BimModelSwitcher />
      <BimSemanticExtension />
      <BimUiPolish />
    </>
  );
}

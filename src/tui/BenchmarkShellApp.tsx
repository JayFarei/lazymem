import { onCleanup, onMount } from "solid-js";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import { benchmark } from "../bench/runtime";

export function App() {
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    benchmark.markCoreReady();
    if (benchmark.markFullReady()) {
      exitTimer = setTimeout(async () => {
        benchmark.markIdle();
        await benchmark.flush();
        renderer.destroy();
        process.exit(0);
      }, benchmark.idleWaitMs);
    }
  });

  onCleanup(() => {
    if (exitTimer) clearTimeout(exitTimer);
  });

  return (
    <box flexDirection="column" width={dims().width} height={dims().height} paddingX={1} paddingY={1}>
      <box
        flexGrow={1}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor="#444c56"
        title=" lazymem "
        titleAlignment="left"
      >
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg="#4d5566">benchmark shell</text>
        </box>
      </box>
    </box>
  );
}

import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "./Canvas.css";

// Excalidraw otherwise resolves its fonts against a third-party CDN
// (verified: it was fetching Excalifont from esm.sh at runtime), which
// makes canvas text rendering depend on an external host being reachable.
// The fonts are copied into public/ by scripts/sync-excalidraw-assets.ts;
// Excalidraw appends "fonts/..." to this path. Set at module scope so it
// is in place before the component mounts and triggers font loading.
if (typeof window !== "undefined") {
  (
    window as unknown as { EXCALIDRAW_ASSET_PATH?: string }
  ).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
}

interface Props {
  onEditorReady: (api: ExcalidrawImperativeAPI) => void;
  onCanvasChange?: () => void;
}

export function Canvas({ onEditorReady, onCanvasChange }: Props) {
  return (
    <div className="canvas-wrapper">
      <Excalidraw
        excalidrawAPI={onEditorReady}
        onChange={onCanvasChange}
        theme={THEME.DARK}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveToActiveFile: false,
            saveAsImage: false,
            clearCanvas: true,
            toggleTheme: false,
            changeViewBackgroundColor: false,
          },
        }}
      />
    </div>
  );
}

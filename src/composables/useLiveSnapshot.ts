import { useTheme } from "@/composables/useTheme";
import { useEditorStore } from "@/stores/editor";

// Builds the point-in-time snapshot the host sends to a joining viewer. Shared
// by the share dialog (starting a session) and the editor (auto-resuming a
// session after a page reload) so both send exactly the same shape.
export function useLiveSnapshot() {
  const editor = useEditorStore();
  const { activeThemeId } = useTheme();

  return () => ({
    project: editor.project!,
    pages: [...editor.pages],
    currentPageId: editor.currentPageId!,
    strokes: [...editor.strokes],
    shapes: [...editor.shapes],
    notebookMode: editor.notebookMode,
    notebookLayout: editor.notebookLayout,
    // In notebook mode editor.strokes/shapes already hold every sheet's page-local data.
    allStrokes: editor.notebookMode !== "off" ? [...editor.strokes] : [],
    allShapes: editor.notebookMode !== "off" ? [...editor.shapes] : [],
    themeId: activeThemeId.value,
  });
}

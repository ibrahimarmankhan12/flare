import type { CanvasModelOption, CanvasState } from "./store";

interface ChatModelsProvider {
  provider: string;
  models: {
    name: string;
  }[];
}

const STORAGE_KEY_BASE = "flare_canvas_state";

function formatProviderLabel(provider: string): string {
  if (!provider) return "Flare";
  return provider
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatModelLabel(model: string): string {
  if (!model) return "Unknown Model";
  return model.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function flattenChatModels(
  data: ChatModelsProvider[] | null | undefined,
): CanvasModelOption[] {
  if (!Array.isArray(data)) return [];

  const out: CanvasModelOption[] = [];
  for (const group of data) {
    if (!group?.provider || !Array.isArray(group.models)) continue;

    const providerLabel = formatProviderLabel(group.provider);
    for (const model of group.models) {
      if (!model?.name) continue;
      out.push({
        id: `${group.provider}/${model.name}`,
        label: formatModelLabel(model.name),
        provider: group.provider,
        providerLabel,
      });
    }
  }

  return out;
}

export function getModelOptionById(
  models: CanvasModelOption[],
  id: string,
): CanvasModelOption | undefined {
  return models.find((m) => m.id === id);
}

function keyForCanvas(canvasId: string): string {
  return `${STORAGE_KEY_BASE}:${canvasId}`;
}

export function loadCanvasState(canvasId: string): CanvasState {
  try {
    const raw = localStorage.getItem(keyForCanvas(canvasId));
    if (!raw) {
      return { activeModelId: "", models: [] };
    }

    const parsed = JSON.parse(raw) as Partial<CanvasState>;
    return {
      activeModelId:
        typeof parsed.activeModelId === "string" ? parsed.activeModelId : "",
      models: Array.isArray(parsed.models) ? parsed.models : [],
    };
  } catch {
    return { activeModelId: "", models: [] };
  }
}

export function saveCanvasState(canvasId: string, state: CanvasState) {
  localStorage.setItem(keyForCanvas(canvasId), JSON.stringify(state));
}

export function mergeCanvasModels(
  canvasId: string,
  previous: CanvasState,
  latestModels: CanvasModelOption[],
): CanvasState {
  const currentId = previous.activeModelId;
  const fallback = latestModels[0]?.id || "";
  const stillExists = currentId && latestModels.some((m) => m.id === currentId);

  const next: CanvasState = {
    activeModelId: stillExists ? currentId : fallback,
    models: latestModels,
  };

  saveCanvasState(canvasId, next);
  return next;
}

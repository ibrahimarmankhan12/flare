export interface ChatChip {
  role: "user" | "assistant";
  text: string;
  images?: { src: string; label: string }[];
}

export interface CanvasModelOption {
  id: string;
  label: string;
  provider: string;
  providerLabel: string;
}

export interface CanvasState {
  activeModelId: string;
  models: CanvasModelOption[];
}

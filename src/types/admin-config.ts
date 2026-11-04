// Admin configuration types

export interface AdminConfigTab {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// Model configuration
export interface ModelProviderConfig {
  enabled: boolean;
  defaultModel?: string;
  apiKeyConfigured: boolean;
  fallbackModel?: string;
}

export interface ModelsConfig {
  providers: Record<string, ModelProviderConfig>;
  globalFallback?: string;
}

// Tool configuration
export interface ToolCategoryConfig {
  enabled: boolean;
  tools: Record<string, boolean>;
}

export interface ToolsConfig {
  categories: Record<string, ToolCategoryConfig>;
  apiKeys: {
    exa?: boolean;
    firecrawl?: boolean;
    youtube?: boolean;
    supadata?: boolean;
    konvo?: boolean;
  };
}

// Canvas configuration
export interface CanvasConfig {
  model?: string;
  defaultSlideCount?: number;
  pptxExportEnabled?: boolean;
}

// Artifacts configuration
export interface ArtifactsConfig {
  model?: string;
  enabledTypes?: string[];
}

// General configuration
export interface GeneralConfig {
  appName?: string;
  appLogoUrl?: string;
  defaultToolChoice?: "auto" | "none" | "manual";
  freeTierDailyTokenLimit?: number;
  freeTierEnabled?: boolean;
}

// Full config
export interface SiteConfig {
  models: ModelsConfig;
  tools: ToolsConfig;
  canvas: CanvasConfig;
  artifacts: ArtifactsConfig;
  general: GeneralConfig;
}

// API request/response
export interface UpdateConfigRequest {
  key: string;
  settings: Partial<SiteConfig[keyof SiteConfig]>;
}

export interface ConfigResponse {
  success: boolean;
  config?: SiteConfig;
  error?: string;
}

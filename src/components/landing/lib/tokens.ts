// ─── Design Tokens — Flare AI ───────────────────────────────────────────────
// Single source of truth. Import from here, never hardcode values in components.

// ── Brand Colors ──────────────────────────────────────────────────────────────
export const TEAL = "#3d9e8c";
export const TEAL_LIGHT = "#4ab09e";
export const TEAL_DARK = "#2a7a6c";

// ── Background Colors ─────────────────────────────────────────────────────────
export const BG_VOID = "#000000"; // ConnectSection, Footer
export const BG_DARK = "#000000"; // Hero, ProvenInProduction, page root
export const BG_DARK_2 = "#000000"; // Hero section inner
export const BG_DARK_3 = "#000000"; // EnterpriseSecurity, MachineIntelligence
export const BG_DARK_4 = "#080808"; // ProvenInProduction card
export const BG_CODE = "#141414"; // Code block
export const BG_LIGHT = "#ffffff"; // BuiltToScale, DeveloperSection, etc.
export const BG_LIGHT_2 = "#f5f5f5"; // AtomsSection, PlatformUI titlebar
export const BG_LIGHT_3 = "#fafafa"; // Sidebar

// ── Text Colors ───────────────────────────────────────────────────────────────
export const TEXT_DARK = "#0a0a0a";
export const TEXT_WHITE = "#ffffff";
export const TEXT_MUTED_LIGHT = "#666666";
export const TEXT_MUTED_DARK = "rgba(255,255,255,0.42)";
export const TEXT_DIM_LIGHT = "#aaaaaa";
export const TEXT_DIM_DARK = "rgba(255,255,255,0.32)";

// ── Border Colors ─────────────────────────────────────────────────────────────
export const BORDER_LIGHT = "#e5e5e5";
export const BORDER_LIGHT_2 = "#e8e8e8";
export const BORDER_DARK = "rgba(255,255,255,0.07)";
export const BORDER_DARK_2 = "rgba(255,255,255,0.04)";

// ── Font Families ─────────────────────────────────────────────────────────────
export const FONT_GEIST = 'Geist, "Geist Placeholder", sans-serif';
export const FONT_COOPER = '"Cooper Lt BT Light", Georgia, serif';
export const FONT_MONO =
  "'Fira Code', 'Cascadia Code', 'Courier New', monospace";

// ── Spacing ───────────────────────────────────────────────────────────────────
export const SECTION_PADDING = "96px 0";
export const CONTAINER_PADDING = "0 28px";
export const MAX_WIDTH = 1280;

// ── Border Radius ─────────────────────────────────────────────────────────────
export const RADIUS_XS = 4;
export const RADIUS_SM = 6;
export const RADIUS_MD = 10;
export const RADIUS_LG = 14;
export const RADIUS_XL = 18;
export const RADIUS_2XL = 26;

// ── Shadows ───────────────────────────────────────────────────────────────────
export const SHADOW_CARD = "0 32px 80px rgba(0,0,0,0.10)";
export const SHADOW_CODE =
  "0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.05)";
export const SHADOW_TEAL = "0 12px 40px rgba(61,158,140,0.25)";

// ── Easing ────────────────────────────────────────────────────────────────────
export const EASE = [0.22, 1, 0.36, 1] as const;

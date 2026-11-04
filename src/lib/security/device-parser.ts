/**
 * Lightweight User-Agent parser.
 *
 * Zero dependencies — runs on Edge and Node.
 * Returns { device, os, browser }.
 */

type DeviceInfo = {
  device: string; // "mobile" | "tablet" | "desktop"
  os: string;
  browser: string;
};

// ── Browser detection (order matters — more specific first) ─────────

const BROWSER_RULES: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Vivaldi\//, "Vivaldi"],
  [/Brave\//, "Brave"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/UCBrowser\//, "UC Browser"],
  [/YaBrowser\//, "Yandex"],
  [/CriOS\//, "Chrome iOS"],
  [/FxiOS\//, "Firefox iOS"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
  [/MSIE |Trident\//, "IE"],
];

// ── OS detection ────────────────────────────────────────────────────

const OS_RULES: [RegExp, string][] = [
  [/Windows NT 10/, "Windows 10+"],
  [/Windows NT/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/CrOS/, "Chrome OS"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Linux/, "Linux"],
];

// ── Device type detection ───────────────────────────────────────────

const MOBILE_RE = /Mobile|Android(?!.*Tablet)|iPhone|iPod|Opera Mini|IEMobile/i;
const TABLET_RE = /Tablet|iPad|Nexus 7|Nexus 10|SM-T|Kindle/i;

export const parseUserAgent = (ua: string | null | undefined): DeviceInfo => {
  if (!ua) return { device: "unknown", os: "Unknown", browser: "Unknown" };

  // Browser
  let browser = "Unknown";
  for (const [re, name] of BROWSER_RULES) {
    if (re.test(ua)) {
      browser = name;
      break;
    }
  }

  // OS
  let os = "Unknown";
  for (const [re, name] of OS_RULES) {
    if (re.test(ua)) {
      os = name;
      break;
    }
  }

  // Device type
  let device = "desktop";
  if (TABLET_RE.test(ua)) {
    device = "tablet";
  } else if (MOBILE_RE.test(ua)) {
    device = "mobile";
  }

  return { device, os, browser };
};

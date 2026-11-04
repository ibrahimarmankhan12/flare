/**
 * Shared HTML response page returned by every connector OAuth callback.
 *
 * The popup is opened by `src/components/connectors-popover.tsx`, which
 * listens for `postMessage` events of type `CONNECTOR_OAUTH_SUCCESS` or
 * `CONNECTOR_OAUTH_ERROR`. This helper returns a tiny HTML page that
 * dispatches that message and then auto-closes the popup after 5s.
 *
 * The visual is a "passport stamp" — a near-black canvas with a giant
 * serif provider initial, a tilted teal VERIFIED or rose DENIED stamp
 * on top of it, and customs-slip mono metadata around the edges. The
 * stamp animates in with a slam, the countdown bar drains at the
 * bottom to telegraph the auto-close.
 */

export type ConnectorOauthType = "success" | "error";

const PROVIDER_INITIAL: Record<string, string> = {
  gmail: "G",
  "google-drive": "D",
  "google-calendar": "C",
  "google-docs": "D",
  "google-forms": "F",
  "google-keep": "K",
  "google-meet": "M",
  "google-sheets": "S",
  "google-slides": "L",
  "google-tasks": "T",
  youtube: "Y",
  outlook: "O",
  slack: "S",
  notion: "N",
  github: "H",
  // 42 new providers (added 2026-06-03)
  confluence: "F",
  jira: "J",
  linear: "L",
  asana: "A",
  clickup: "U",
  productboard: "P",
  testrail: "T",
  coda: "C",
  outline: "O",
  slab: "B",
  guru: "G",
  highspot: "H",
  document360: "D",
  gitlab: "G",
  bitbucket: "B",
  dropbox: "X",
  zendesk: "Z",
  freshdesk: "F",
  salesforce: "S",
  hubspot: "H",
  airtable: "A",
  gong: "G",
  egnyte: "E",
  teams: "T",
  discord: "D",
  bookstack: "B",
  gitbook: "G",
  canvas: "C",
  loopio: "L",
  discourse: "D",
  xenforo: "X",
  "drupal-wiki": "D",
  axero: "A",
  zulip: "Z",
  mediawiki: "M",
  fireflies: "F",
  wikipedia: "W",
};

const PROVIDER_NAME: Record<string, string> = {
  gmail: "Gmail",
  "google-drive": "Drive",
  "google-calendar": "Calendar",
  "google-docs": "Docs",
  "google-forms": "Forms",
  "google-keep": "Keep",
  "google-meet": "Meet",
  "google-sheets": "Sheets",
  "google-slides": "Slides",
  "google-tasks": "Tasks",
  youtube: "YouTube",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  // 42 new providers (added 2026-06-03)
  confluence: "Confluence",
  jira: "Jira",
  linear: "Linear",
  asana: "Asana",
  clickup: "ClickUp",
  productboard: "Productboard",
  testrail: "TestRail",
  coda: "Coda",
  outline: "Outline",
  slab: "Slab",
  guru: "Guru",
  highspot: "Highspot",
  document360: "Document360",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  dropbox: "Dropbox",
  zendesk: "Zendesk",
  freshdesk: "Freshdesk",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  airtable: "Airtable",
  gong: "Gong",
  egnyte: "Egnyte",
  teams: "Teams",
  discord: "Discord",
  bookstack: "BookStack",
  gitbook: "GitBook",
  canvas: "Canvas",
  loopio: "Loopio",
  discourse: "Discourse",
  xenforo: "XenForo",
  "drupal-wiki": "Drupal Wiki",
  axero: "Axero",
  zulip: "Zulip",
  mediawiki: "MediaWiki",
  fireflies: "Fireflies",
  wikipedia: "Wikipedia",
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function createConnectorOauthResponsePage(
  type: ConnectorOauthType,
  title: string,
  message: string,
  provider: string,
): Response {
  const isSuccess = type === "success";
  const initial =
    PROVIDER_INITIAL[provider] ?? provider.charAt(0).toUpperCase();
  const providerName = PROVIDER_NAME[provider] ?? provider;
  const stampText = isSuccess ? "VERIFIED" : "DENIED";
  const stampColor = isSuccess ? "#3d9e8c" : "#fb7185";
  const stampShadow = isSuccess
    ? "rgba(61,158,140,0.45)"
    : "rgba(251,113,133,0.4)";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeProvider = escapeHtml(provider);
  const safeProviderName = escapeHtml(providerName);
  // Build a deterministic-looking reference code: type + provider + epoch second
  const refCode = `${isSuccess ? "OK" : "ERR"}-${provider.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: #0a0a0a;
    color: #fff;
    font-family: var(--font-geist-sans, "Geist", "Inter", system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* Subtle grid backdrop */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.05;
    background-image:
      linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px);
    background-size: 32px 32px;
    mask-image: radial-gradient(ellipse 90% 70% at 50% 50%, black 0%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 50%, black 0%, transparent 80%);
  }

  /* Radial glow */
  body::after {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse 50% 40% at 50% 45%, ${stampShadow}, transparent 70%);
    opacity: 0.7;
  }

  .frame {
    position: relative;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 28px 32px;
    z-index: 1;
  }

  /* Top hairline accent */
  .frame::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${stampColor} 50%, transparent);
    opacity: 0.6;
  }

  /* Top bar: brand + ref */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-geist-mono, "Geist Mono", monospace);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
  }
  .topbar .brand { display: flex; align-items: center; gap: 8px; }
  .topbar .led {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${stampColor};
    box-shadow: 0 0 6px ${stampShadow};
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  /* Center stage */
  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: relative;
  }

  .giant {
    font-family: "Cooper Lt BT Light", Georgia, serif;
    font-weight: 300;
    font-size: clamp(140px, 32vh, 220px);
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: rgba(255,255,255,0.06);
    user-select: none;
    position: relative;
    animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* The stamp */
  .stamp {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-9deg);
    padding: 14px 36px;
    border: 3px double ${stampColor};
    color: ${stampColor};
    font-family: var(--font-geist-mono, "Geist Mono", monospace);
    font-weight: 700;
    font-size: clamp(28px, 5vh, 44px);
    letter-spacing: 0.4em;
    text-transform: uppercase;
    background: rgba(10,10,10,0.6);
    backdrop-filter: blur(2px);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 12px 40px -10px ${stampShadow};
    animation: slam 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
    transform-origin: center;
    white-space: nowrap;
  }
  @keyframes slam {
    0%   { opacity: 0; transform: translate(-50%, -50%) rotate(-9deg) scale(2.4); }
    60%  { opacity: 1; transform: translate(-50%, -50%) rotate(-9deg) scale(0.94); }
    100% { opacity: 1; transform: translate(-50%, -50%) rotate(-9deg) scale(1); }
  }
  /* Distressed ink texture using a noise mask */
  .stamp::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 20% 30%, rgba(0,0,0,0.5) 0%, transparent 25%),
      radial-gradient(circle at 70% 60%, rgba(0,0,0,0.4) 0%, transparent 30%),
      radial-gradient(circle at 50% 80%, rgba(0,0,0,0.3) 0%, transparent 20%);
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  /* Copy block under the stamp */
  .copy {
    margin-top: 40px;
    text-align: center;
    max-width: 480px;
    animation: fadeIn 0.6s ease-out 0.5s both;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .copy h1 {
    font-family: "Cooper Lt BT Light", Georgia, serif;
    font-weight: 300;
    font-size: 28px;
    line-height: 1.1;
    margin: 0 0 10px;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .copy p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: rgba(255,255,255,0.55);
  }

  /* Bottom slip */
  .slip {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    padding-top: 18px;
    border-top: 1px dashed rgba(255,255,255,0.1);
    font-family: var(--font-geist-mono, "Geist Mono", monospace);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    animation: fadeIn 0.6s ease-out 0.7s both;
  }
  .slip .cell { display: flex; flex-direction: column; gap: 4px; }
  .slip .cell .v { color: rgba(255,255,255,0.75); letter-spacing: 0.15em; }
  .slip .cell .v.cap { text-transform: none; letter-spacing: 0; }

  /* Countdown bar */
  .countdown {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255,255,255,0.04);
    overflow: hidden;
  }
  .countdown::after {
    content: "";
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 100%;
    background: ${stampColor};
    box-shadow: 0 0 8px ${stampShadow};
    transform-origin: left center;
    animation: drain 5s linear forwards;
  }
  @keyframes drain {
    from { transform: scaleX(1); }
    to   { transform: scaleX(0); }
  }

  @media (max-width: 480px) {
    .frame { padding: 20px; }
    .slip { grid-template-columns: 1fr 1fr; gap: 12px 20px; }
    .slip .cell:nth-child(3) { grid-column: span 2; }
    .copy h1 { font-size: 22px; }
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="topbar">
      <div class="brand">
        <span class="led"></span>
        <span>Flare · Connector Handshake</span>
      </div>
      <span>${refCode}</span>
    </div>

    <div class="stage">
      <div class="giant" aria-hidden="true">${initial}</div>
      <div class="stamp">${stampText}</div>
      <div class="copy">
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
      </div>
    </div>

    <div class="slip">
      <div class="cell">
        <span>Source</span>
        <span class="v">${safeProviderName}</span>
      </div>
      <div class="cell">
        <span>Channel</span>
        <span class="v">${isSuccess ? "OAuth 2.0" : "Rejected"}</span>
      </div>
      <div class="cell">
        <span>Provider ID</span>
        <span class="v cap">${safeProvider}</span>
      </div>
    </div>

    <div class="countdown" aria-hidden="true"></div>
  </div>

  <script>
    try {
      window.opener?.postMessage({
        type: 'CONNECTOR_OAUTH_${type.toUpperCase()}',
        provider: ${JSON.stringify(provider)},
        ${isSuccess ? "success: true" : `error: ${JSON.stringify(message)}`}
      }, window.location.origin);
    } catch (e) {
      console.error('Failed to post message:', e);
    }
    setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 5000);
  </script>
</body>
</html>`;

  return new Response(html, {
    status: type === "success" ? 200 : 400,
    headers: { "Content-Type": "text/html" },
  });
}

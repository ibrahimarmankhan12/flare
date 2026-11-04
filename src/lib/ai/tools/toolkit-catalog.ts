import { AppDefaultToolkit } from ".";

// ---------------------------------------------------------------------------
// The single description of every toolkit.
// ---------------------------------------------------------------------------
// Three hand-maintained lists used to describe toolkits, and they drifted:
//
//   * `AppDefaultToolkit`                          13 toolkits
//   * `ALL_CATEGORIES` in lib/site-config-runtime  10
//   * `TOOL_CATEGORIES` in admin/config/tools-tab   9
//
// `site-config-runtime` treats a category missing from the site config as
// DISABLED, and the admin tab is what writes that config — so a toolkit absent
// from the shortest list could never reach the model no matter what anyone
// toggled. That is how the E2B `build-app` tool ended up uncallable from chat
// while its own /build page worked fine.
//
// Everything now derives from this file: the runtime allow-list, the admin UI,
// the client's default selection, and the capability briefing in the system
// prompt. Adding a toolkit means adding one entry here.
//
// `capability` is written for the model, not the admin screen: it is what the
// assistant is told it can do, so it should read as a plain statement of
// ability rather than a feature name.
// ---------------------------------------------------------------------------

export interface ToolkitInfo {
  id: AppDefaultToolkit;
  /**
   * Key under `site_config.tools.categories`.
   *
   * Historically PascalCase while the enum values are camelCase. Both sides
   * are lowercased before comparison, so the two forms match — but the stored
   * rows use this spelling and rewriting them would be a pointless migration.
   */
  configKey: string;
  label: string;
  icon: string;
  /** Shown in the admin UI. */
  description: string;
  /** Told to the model. Plain statement of what it can actually do. */
  capability: string;
  /** Human-readable tool names, for the admin UI only. */
  tools: string[];
  /** Selected in a fresh chat session. */
  defaultOn: boolean;
  /** Admin API-key entry this toolkit depends on, if any. */
  apiKeyId?: string | null;
}

export const TOOLKIT_CATALOG: ToolkitInfo[] = [
  {
    id: AppDefaultToolkit.Code,
    configKey: "Code",
    label: "Code Execution",
    icon: "💻",
    description: "Browser-sandboxed snippets plus a full Linux sandbox",
    capability:
      "Run code for real. `sandbox` is a persistent Linux VM with a filesystem, network and prebuilt toolchains (Android/JDK, Node, Python data stack, Go, Rust, C++) — use it to actually build, compile and test things, including producing an APK or serving an app at a public URL. `python-execution` and `mini-javascript-execution` are quick in-browser snippets with no filesystem.",
    tools: ["Sandbox (Linux VM)", "JavaScript", "Python"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.Visualization,
    configKey: "Visualization",
    label: "Visualization",
    icon: "📊",
    description: "Charts and tables rendered in the conversation",
    capability:
      "Render charts and tables inline in the conversation (pie, bar, line, table).",
    tools: ["Pie Chart", "Bar Chart", "Line Chart", "Table"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.Video,
    configKey: "Video",
    label: "Video Generation",
    icon: "🎬",
    description: "AI video generation",
    capability: "Generate video from a text prompt.",
    tools: ["Video Generation"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.Artifacts,
    configKey: "Artifacts",
    label: "Artifacts",
    icon: "✨",
    description: "Standalone code artifacts",
    capability:
      "Produce a standalone code artifact the user can open and run separately from the chat.",
    tools: ["Artifact Creation"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.Canvas,
    configKey: "Canvas",
    label: "Canvas",
    icon: "🎨",
    description: "Presentations and the E Canvas drawing surface",
    capability:
      "Build slide decks (PPT Canvas) and open E Canvas, a drawing and diagramming surface the user can edit by hand afterwards.",
    tools: ["PPT Maker", "E Canvas"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.Memory,
    configKey: "Memory",
    label: "Memory",
    icon: "🧠",
    description: "Long-term user memory",
    capability:
      "Remember things about the user across conversations, and search what you already remember. Memories persist between chats; conversation history does not.",
    tools: ["Save Memory", "Search Memory", "Delete Memory"],
    defaultOn: true,
  },
  {
    id: AppDefaultToolkit.WebSearch,
    configKey: "WebSearch",
    apiKeyId: "exa",
    label: "Web Search",
    icon: "🔍",
    description: "Search and content extraction",
    capability:
      "Search the live web, fetch page contents, and search or transcribe YouTube videos.",
    tools: [
      "Web Search",
      "Web Content",
      "YouTube Search",
      "YouTube Transcript",
    ],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.Browser,
    configKey: "Browser",
    apiKeyId: "firecrawl",
    label: "Browser Agent",
    icon: "🌐",
    description: "Automated browsing of real pages",
    capability:
      "Drive a real browser to navigate pages, click through flows and extract what a plain fetch cannot reach.",
    tools: ["Browser Agent"],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.Http,
    configKey: "Http",
    label: "HTTP Fetch",
    icon: "🔌",
    description: "Direct HTTP requests to arbitrary endpoints",
    capability:
      "Call arbitrary HTTP endpoints directly (GET/POST with custom headers and bodies) — for APIs that have no dedicated connector.",
    tools: ["HTTP Fetch"],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.Connectors,
    configKey: "Connectors",
    apiKeyId: "google",
    label: "Connectors",
    icon: "🔗",
    description:
      "Gmail, Drive, Calendar, Slack, Notion, GitHub, Jira and ~40 more",
    capability:
      "Read and act on the user's connected accounts — email, calendar, files, chat, issue trackers, CRM and wikis (Gmail, Drive, Calendar, Outlook, Slack, Teams, Discord, Notion, GitHub, GitLab, Jira, Linear, Asana, Salesforce, HubSpot, Airtable and more). Each needs the user to have connected that account.",
    tools: [
      "Gmail",
      "Drive",
      "Calendar",
      "Slack",
      "Notion",
      "GitHub",
      "+43 more",
    ],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.Scheduler,
    configKey: "Scheduler",
    label: "Scheduler",
    icon: "⏰",
    description: "Recurring and future-dated agent runs",
    capability:
      "Schedule work to run later or on a recurring basis, without the user present.",
    tools: ["Scheduler"],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.Build,
    configKey: "Build",
    label: "App Builder",
    icon: "🔨",
    description: "E2B app builder with a live preview URL",
    capability:
      "Generate a complete application in a cloud sandbox and hand back a live preview URL. Prefer the `sandbox` tool for ordinary code execution; use this when the user wants a whole app scaffolded, built and hosted.",
    tools: ["Build App"],
    defaultOn: false,
  },
  {
    id: AppDefaultToolkit.CodeEngine,
    configKey: "CodeEngine",
    label: "Code Engine",
    icon: "⚙️",
    description: "Orchestrate other tools from a code block (opt-in mention)",
    capability:
      "Compose several tools together inside a single program, instead of calling them one at a time.",
    tools: ["Code Engine"],
    defaultOn: false,
  },
];

const BY_ID = new Map(TOOLKIT_CATALOG.map((t) => [t.id, t]));

export const getToolkit = (id: string): ToolkitInfo | undefined =>
  BY_ID.get(id as AppDefaultToolkit);

/**
 * Every category the site config may enable, lowercased for comparison.
 *
 * Used as the fallback when no site config row exists. A toolkit absent from
 * here is invisible to the model, so this must stay complete.
 */
export const ALL_TOOLKIT_CATEGORY_KEYS: string[] = TOOLKIT_CATALOG.map((t) =>
  t.configKey.toLowerCase(),
);

/** Toolkits selected in a fresh chat session. */
export const DEFAULT_ENABLED_TOOLKITS: AppDefaultToolkit[] =
  TOOLKIT_CATALOG.filter((t) => t.defaultOn).map((t) => t.id);

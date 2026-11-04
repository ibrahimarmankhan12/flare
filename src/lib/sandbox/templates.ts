import { Template, type TemplateBuilder, type TemplateClass } from "e2b";

import { listFlareTemplates, type FlareTemplate } from "./client";

// ---------------------------------------------------------------------------
// Prebuilt sandbox environments.
// ---------------------------------------------------------------------------
// Every entry here is a real E2B template, built once by
// `scripts/build-e2b-templates.ts` and then spawned in ~seconds.
//
// Why this exists: the stock E2B image ships Node and Python and nothing else.
// A sandbox runs as user `user` with PASSWORDLESS SUDO (verified: `sudo -n
// apt-get install` succeeds), so it can install anything — but building a
// toolchain from scratch every time is slow and wasteful. An agent asked to
// build, say, an Android APK spent its entire budget discovering that the
// hard way. A measured run did exactly this: 246 tool calls, 37 failures, and
// `gradle.properties` rewritten 22 times, all to produce no APK.
//
// Two fixes, both encoded here:
//
//   1. The toolchain is baked into the image, so there is nothing to install
//      at runtime and nothing that needs sudo.
//   2. `provides` is surfaced verbatim in the tool description, so the model
//      is TOLD what is in the box instead of probing for it.
//
// Adding an environment = one entry below + a rebuild. Nothing else changes.
// ---------------------------------------------------------------------------

/** Where the agent works. Matches `session.ts`. */
export const WORK_DIR = "/home/user/work";

/** The unprivileged user E2B runs sandboxes as. */
const SANDBOX_USER = "user";

export interface SandboxEnvironment {
  /** Stable id — this is what the model passes as `env`. */
  id: string;
  label: string;
  /**
   * E2B template name, or null to use the stock E2B image.
   *
   * Null is not a fallback for "unbuilt" — `resolveEnvironment` degrades to
   * "base" on its own when a template hasn't been built yet.
   */
  template: string | null;
  /** One line, shown in the `env` enum description. */
  summary: string;
  /**
   * Exactly what is preinstalled. Written into the tool description so the
   * model doesn't burn calls running `which java` to find out.
   */
  provides: string[];
  /** Ready-to-run notes that save a round trip (correct build command, etc). */
  hints?: string[];
  /**
   * Environment variables for the RUNNING sandbox, applied at
   * `Sandbox.create`.
   *
   * The builder's `setEnvs` does NOT survive into the runtime shell: a sandbox
   * from a template that called `setEnvs({ PATH, JAVA_HOME })` still comes up
   * with `PATH=/usr/local/bin:/usr/bin:/bin:...` and an empty `JAVA_HOME`.
   * Binaries are reached via symlinks into /usr/local/bin (`linkBins`);
   * everything else has to be passed here.
   */
  envs?: Record<string, string>;
  cpuCount: number;
  memoryMB: number;
  /**
   * Image recipe. Only ever called by the build script — never at runtime.
   * Kept beside the metadata so the two cannot drift apart.
   */
  define: (t: ReturnType<typeof Template>) => TemplateClass;
}

/**
 * Start a recipe as root.
 *
 * The E2B base image's default user is `user`, and that applies to BUILD steps
 * too — not just the running sandbox. Without this, the very first
 * `apt-get update` dies with "Could not open lock file /var/lib/apt/lists/lock
 * (13: Permission denied)": the identical error the Android agent hit at
 * runtime, for the identical reason.
 */
const asRoot = (t: ReturnType<typeof Template>) =>
  t.fromBaseImage().setUser("root");

/**
 * Close a recipe: hand the named paths to the sandbox user and drop back to
 * that user so the running sandbox is unprivileged.
 *
 * Anything installed or pre-warmed as root is useless unless ownership moves —
 * and that failure is silent. The build "succeeds" and the warm cache is
 * simply never readable.
 */
const finish = (b: TemplateBuilder, ...paths: string[]): TemplateClass => {
  const all = [WORK_DIR, ...paths];
  return b
    .runCmd(
      `mkdir -p ${all.join(" ")} && chown -R ${SANDBOX_USER}:${SANDBOX_USER} ${all.join(" ")}`,
    )
    .setUser(SANDBOX_USER)
    .setWorkdir(WORK_DIR);
};

/**
 * Put binaries on the default PATH.
 *
 * The runtime PATH is fixed at `/usr/local/bin:/usr/bin:/bin:...` no matter
 * what the template sets, and /usr/local/bin is world-writable in the E2B base
 * image — so symlinking into it is the one reliable way to make a toolchain
 * callable by name.
 */
const linkBins = (...targets: string[]) =>
  targets.map((t) => `ln -sf ${t} /usr/local/bin/`).join(" && ");

/** Node 22 LTS, installed under /opt/node. */
const NODE_VERSION = "22.11.0";

/**
 * The E2B base image ships Node 20.9.0. Current pnpm and vite both `import
 * { styleText } from "node:util"`, which 20.9 does not export, so they crash
 * on startup with a SyntaxError. Installing Node 22 is the fix; pinning every
 * tool backwards instead would age badly.
 */
const installNode22 = [
  "mkdir -p /opt/node",
  `wget -qO /tmp/node.tar.xz https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz`,
  "tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1",
  "rm /tmp/node.tar.xz",
].join(" && ");

/** Build steps get a plain shell, so global installs need the absolute npm. */
const NPM = "/opt/node/bin/npm";

// --- Android ---------------------------------------------------------------
// The environment that motivated all of this.
//
// Details that are easy to get wrong, each of which cost a failed run before:
//   * AGP 8.x requires JDK 17 exactly — 21 is not yet supported by AGP 8.5.
//   * `sdkmanager --licenses` takes its acceptance on stdin. There is no
//     `--yes` flag; passing one exits with `Unknown argument "--yes"`.
//   * `dependencyResolutionManagement` in settings.gradle.kts needs Gradle
//     6.8+. The stock image has no Gradle at all, so the wrapper downloads one
//     mid-build — or fails, which is what "Unresolved reference" actually
//     meant.
//   * The Gradle/AGP/Kotlin dependency cache is ~500MB on first build. Warming
//     it here turns a 6-minute first `assembleDebug` into well under one.
const ANDROID_SDK = "/opt/android-sdk";
const GRADLE_HOME = "/opt/gradle-home";
const ANDROID_PLATFORM = "35";
const ANDROID_BUILD_TOOLS = "35.0.0";
const GRADLE_VERSION = "8.9";
/**
 * Absolute paths. `setEnvs` configures the RUNNING sandbox, not the build
 * shell — relying on it here got `sdkmanager` exit 127 (not found).
 */
const SDKMANAGER = `${ANDROID_SDK}/cmdline-tools/latest/bin/sdkmanager`;
const GRADLE_BIN = "/opt/gradle/bin/gradle";

const androidWarmupProject = `
# The last command in this script decides the layer's exit status. Without
# 'set -e' a failed gradle run followed by a successful 'rm -rf' reports
# success, and the image ships with an empty cache that only shows up much
# later as "No cached version available for offline mode".
set -euo pipefail
mkdir -p /tmp/warm/app/src/main/java/com/warm /tmp/warm/app/src/main/res/values
cat > /tmp/warm/settings.gradle.kts <<'EOF'
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "warm"
include(":app")
EOF
# Without android.useAndroidX the build dies at :app:checkDebugAarMetadata.
# It still downloads the dependencies first, which is why the cache LOOKED
# populated (774MB) while the AAR transforms it actually needs were missing.
cat > /tmp/warm/gradle.properties <<'EOF'
org.gradle.jvmargs=-Xmx2g
android.useAndroidX=true
EOF
cat > /tmp/warm/build.gradle.kts <<'EOF'
plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
EOF
cat > /tmp/warm/app/build.gradle.kts <<'EOF'
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "com.warm"
  compileSdk = ${ANDROID_PLATFORM}
  defaultConfig { applicationId = "com.warm"; minSdk = 24; targetSdk = ${ANDROID_PLATFORM}; versionCode = 1; versionName = "1.0" }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
dependencies { implementation("androidx.core:core-ktx:1.13.1"); implementation("androidx.appcompat:appcompat:1.7.0") }
EOF
cat > /tmp/warm/app/src/main/AndroidManifest.xml <<'EOF'
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="warm" android:theme="@style/Theme.AppCompat.DayNight">
    <activity android:name=".W" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
EOF
cat > /tmp/warm/app/src/main/java/com/warm/W.kt <<'EOF'
package com.warm
import androidx.appcompat.app.AppCompatActivity
class W : AppCompatActivity()
EOF
cd /tmp/warm && JAVA_HOME=/opt/java ANDROID_HOME=${ANDROID_SDK} GRADLE_USER_HOME=${GRADLE_HOME} ${GRADLE_BIN} assembleDebug --no-daemon --console=plain
# Prove the warm build really produced an artifact before throwing it away.
test -f /tmp/warm/app/build/outputs/apk/debug/app-debug.apk
du -sh ${GRADLE_HOME}
rm -rf /tmp/warm
`;

// --- The registry ----------------------------------------------------------

export const SANDBOX_ENVIRONMENTS: SandboxEnvironment[] = [
  {
    id: "base",
    label: "General",
    template: "flare-base",
    summary:
      "General purpose: Node 22, Python 3, git, and the usual CLI tools. Use when nothing more specific fits.",
    provides: [
      "Node 22 (LTS) + npm, pnpm, yarn, tsx, typescript",
      "Python 3.11 + pip, requests, httpx",
      "git, curl, wget, jq, ripgrep, unzip, zip, tree",
      "sqlite3, build-essential, ffmpeg, imagemagick",
    ],
    cpuCount: 2,
    memoryMB: 2048,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "git",
            "curl",
            "wget",
            "jq",
            "ripgrep",
            "unzip",
            "zip",
            "tree",
            "sqlite3",
            "build-essential",
            "ca-certificates",
            "ffmpeg",
            "imagemagick",
            "xz-utils",
          ])
          .runCmd(installNode22)
          .runCmd(linkBins("/opt/node/bin/*"))
          .runCmd(`${NPM} install -g pnpm yarn tsx typescript`)
          // Again, because the global install added pnpm/yarn/tsx to /opt/node/bin.
          .runCmd(linkBins("/opt/node/bin/*"))
          .runCmd(
            "pip install --no-cache-dir --break-system-packages requests httpx",
          ),
      ),
  },

  {
    id: "android",
    label: "Android",
    template: "flare-android",
    summary:
      "Android app development — builds real APKs. JDK 17, Android SDK 35, Gradle, Kotlin.",
    provides: [
      "JDK 17 (Temurin) at $JAVA_HOME",
      `Android SDK ${ANDROID_PLATFORM} at $ANDROID_HOME (${ANDROID_SDK}) — licences already accepted`,
      `build-tools ${ANDROID_BUILD_TOOLS}, platform-tools, cmdline-tools`,
      `Gradle ${GRADLE_VERSION} on PATH, plus a pre-warmed dependency cache for AGP 8.5 and Kotlin 1.9`,
      "aapt2, d8, apksigner, zipalign, adb",
    ],
    hints: [
      "Build with `gradle assembleDebug --no-daemon --console=plain` from the project root. Do NOT use ./gradlew — there is no wrapper jar, and the system gradle is already the right version.",
      "The debug APK lands at app/build/outputs/apk/debug/app-debug.apk, signed with the standard debug key and installable.",
      "AGP 8.5.2, Kotlin 1.9.24, androidx core-ktx 1.13.1 and appcompat 1.7.0 are already in the Gradle cache — pinning those exact versions makes the first build fast. Other versions and extra dependencies work fine, they just download first. Do not pass --offline.",
      "local.properties is unnecessary — ANDROID_HOME is already set in the environment.",
    ],
    envs: {
      JAVA_HOME: "/opt/java",
      ANDROID_HOME: ANDROID_SDK,
      ANDROID_SDK_ROOT: ANDROID_SDK,
      GRADLE_USER_HOME: GRADLE_HOME,
    },
    cpuCount: 4,
    memoryMB: 8192,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "wget",
            "unzip",
            "zip",
            "git",
            "curl",
            "ca-certificates",
          ])
          // Temurin 17 rather than distro openjdk: AGP checks the JDK version
          // and Debian's default-jdk moves under us between base image rebuilds.
          .runCmd(
            [
              "mkdir -p /opt/java",
              "wget -qO /tmp/jdk.tar.gz https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz",
              "tar -xzf /tmp/jdk.tar.gz -C /opt/java --strip-components=1",
              "rm /tmp/jdk.tar.gz",
            ].join(" && "),
          )
          .runCmd(
            [
              `mkdir -p ${ANDROID_SDK}/cmdline-tools`,
              "wget -qO /tmp/cmdline.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip",
              `unzip -q /tmp/cmdline.zip -d ${ANDROID_SDK}/cmdline-tools`,
              // The zip unpacks to `cmdline-tools/`; sdkmanager insists on
              // living at cmdline-tools/latest/ or it refuses to resolve
              // its own SDK root.
              `mv ${ANDROID_SDK}/cmdline-tools/cmdline-tools ${ANDROID_SDK}/cmdline-tools/latest`,
              "rm /tmp/cmdline.zip",
            ].join(" && "),
          )
          // Acceptance goes on stdin. `yes |` also covers licences added
          // between SDK releases, which a fixed heredoc would not.
          .runCmd(
            `yes | JAVA_HOME=/opt/java ${SDKMANAGER} --sdk_root=${ANDROID_SDK} --licenses > /dev/null`,
          )
          .runCmd(
            `JAVA_HOME=/opt/java ${SDKMANAGER} --sdk_root=${ANDROID_SDK} "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}"`,
          )
          .runCmd(
            [
              `wget -qO /tmp/gradle.zip https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
              "unzip -q /tmp/gradle.zip -d /opt",
              `mv /opt/gradle-${GRADLE_VERSION} /opt/gradle`,
              "rm /tmp/gradle.zip",
            ].join(" && "),
          )
          // Warm the dependency cache by building a throwaway project, then
          // hand the whole SDK + cache to the sandbox user.
          .runCmd(androidWarmupProject)
          .runCmd(
            [
              linkBins(
                "/opt/java/bin/*",
                "/opt/gradle/bin/gradle",
                `${ANDROID_SDK}/cmdline-tools/latest/bin/sdkmanager`,
                `${ANDROID_SDK}/platform-tools/adb`,
              ),
              `for b in aapt2 apksigner zipalign d8; do ln -sf ${ANDROID_SDK}/build-tools/${ANDROID_BUILD_TOOLS}/$b /usr/local/bin/$b; done`,
            ].join(" && "),
          ),
        ANDROID_SDK,
        GRADLE_HOME,
      ),
  },

  {
    id: "web",
    label: "Web / Frontend",
    template: "flare-web",
    summary:
      "Web apps and Node services: Node 22, pnpm/yarn/bun, Vite, TypeScript, and a warm npm cache.",
    provides: [
      "Node 22 (LTS), npm, pnpm, yarn, bun",
      "TypeScript, tsx, vite, esbuild, serve, http-server (global)",
      "Warm npm cache for react, react-dom, vite, express — installs are near-instant offline",
      "git, curl, jq",
    ],
    hints: [
      "Dev servers must bind 0.0.0.0, not localhost, to be reachable from the preview URL. For Vite: `vite --host 0.0.0.0 --port 3000`.",
      "Use action='serve' to start the server and get a public URL back.",
    ],
    cpuCount: 2,
    memoryMB: 4096,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "git",
            "curl",
            "wget",
            "jq",
            "unzip",
            "xz-utils",
            "ca-certificates",
          ])
          .runCmd(installNode22)
          .runCmd(linkBins("/opt/node/bin/*"))
          .runCmd(
            `${NPM} install -g pnpm yarn typescript tsx vite esbuild serve http-server`,
          )
          .runCmd(linkBins("/opt/node/bin/*"))
          .runCmd(
            "curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash",
          )
          // Populate the npm cache so a generated app's first install is a
          // cache hit rather than a cold network fetch.
          .runCmd(
            `cd /tmp && ${NPM} cache add react@18 react-dom@18 vite@5 express@4 @vitejs/plugin-react@4 || true`,
          ),
        "/home/user/.npm",
        "/home/user/.cache",
      ),
  },

  {
    id: "python",
    label: "Python / Data",
    template: "flare-python",
    summary:
      "Data analysis and scientific Python: pandas, numpy, scipy, scikit-learn, matplotlib, jupyter.",
    provides: [
      "Python 3.11",
      "numpy, pandas, scipy, scikit-learn, statsmodels, sympy",
      "matplotlib, seaborn, plotly (headless — save figures to files)",
      "requests, httpx, beautifulsoup4, lxml, openpyxl, pyarrow, pillow",
      "jupyter, ipython",
    ],
    hints: [
      "matplotlib has no display. Use the Agg backend and savefig() to a file, then read it back.",
      "Everything listed is already installed — no pip install needed.",
    ],
    envs: { MPLBACKEND: "Agg" },
    cpuCount: 4,
    memoryMB: 8192,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "git",
            "curl",
            "build-essential",
            "libpq-dev",
            "ca-certificates",
          ])
          .runCmd(
            "pip install --no-cache-dir --break-system-packages " +
              [
                "numpy",
                "pandas",
                "scipy",
                "scikit-learn",
                "statsmodels",
                "sympy",
                "matplotlib",
                "seaborn",
                "plotly",
                "requests",
                "httpx",
                "beautifulsoup4",
                "lxml",
                "openpyxl",
                "pyarrow",
                "pillow",
                "jupyter",
                "ipython",
                "tabulate",
              ].join(" "),
          ),
        "/home/user/.cache",
      ),
  },

  {
    id: "java",
    label: "Java / JVM",
    template: "flare-java",
    summary: "Server-side JVM work: JDK 21, Maven, Gradle, Kotlin.",
    provides: [
      "JDK 21 (Temurin 21.0.4) at $JAVA_HOME",
      "Maven 3.8.7, Gradle 8.9",
      "git, curl",
    ],
    hints: [
      "Use `gradle` / `mvn` directly — no wrapper needed, and there is no wrapper jar in a fresh project.",
      "Add `--no-daemon --console=plain` to gradle so output streams cleanly.",
    ],
    envs: { JAVA_HOME: "/opt/java", GRADLE_USER_HOME: GRADLE_HOME },
    cpuCount: 4,
    memoryMB: 4096,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "wget",
            "unzip",
            "zip",
            "git",
            "curl",
            "maven",
            "ca-certificates",
          ])
          .runCmd(
            [
              "mkdir -p /opt/java",
              "wget -qO /tmp/jdk.tar.gz https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.4%2B7/OpenJDK21U-jdk_x64_linux_hotspot_21.0.4_7.tar.gz",
              "tar -xzf /tmp/jdk.tar.gz -C /opt/java --strip-components=1",
              "rm /tmp/jdk.tar.gz",
            ].join(" && "),
          )
          .runCmd(
            [
              `wget -qO /tmp/gradle.zip https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
              "unzip -q /tmp/gradle.zip -d /opt",
              `mv /opt/gradle-${GRADLE_VERSION} /opt/gradle`,
              "rm /tmp/gradle.zip",
            ].join(" && "),
          )
          .runCmd(linkBins("/opt/java/bin/*", "/opt/gradle/bin/gradle")),
        GRADLE_HOME,
        "/home/user/.m2",
      ),
  },

  {
    id: "go",
    label: "Go",
    template: "flare-go",
    summary:
      "Go services and CLIs: Go 1.23 toolchain with the module cache primed.",
    provides: ["Go 1.23 at /usr/local/go", "gopls, git, curl, build-essential"],
    hints: [
      "GOPATH is /home/user/go and GOCACHE is writable — `go build` works out of the box.",
    ],
    envs: {
      GOROOT: "/usr/local/go",
      GOPATH: "/home/user/go",
      GOCACHE: "/home/user/.cache/go-build",
    },
    cpuCount: 2,
    memoryMB: 4096,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall(["git", "curl", "build-essential", "ca-certificates"])
          .runCmd(
            [
              "wget -qO /tmp/go.tar.gz https://go.dev/dl/go1.23.4.linux-amd64.tar.gz",
              "tar -C /usr/local -xzf /tmp/go.tar.gz",
              "rm /tmp/go.tar.gz",
            ].join(" && "),
          )
          .runCmd(linkBins("/usr/local/go/bin/*")),
        "/home/user/go",
        "/home/user/.cache/go-build",
      ),
  },

  {
    id: "rust",
    label: "Rust",
    template: "flare-rust",
    summary: "Rust: stable toolchain with cargo, clippy and rustfmt.",
    provides: [
      "Rust stable via rustup, cargo, clippy, rustfmt",
      "build-essential, pkg-config, libssl-dev for native crates",
    ],
    hints: [
      "Debug builds are much faster than release — use `cargo build` unless the user asked for an optimised binary.",
    ],
    envs: { RUSTUP_HOME: "/opt/rustup", CARGO_HOME: "/opt/cargo" },
    cpuCount: 4,
    memoryMB: 4096,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "build-essential",
            "pkg-config",
            "libssl-dev",
            "git",
            "curl",
            "ca-certificates",
          ])
          .runCmd(
            "curl -sSf https://sh.rustup.rs | RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo sh -s -- -y --no-modify-path --profile default",
          )
          .runCmd(linkBins("/opt/cargo/bin/*")),
        "/opt/cargo",
        "/opt/rustup",
      ),
  },

  {
    id: "cpp",
    label: "C / C++",
    template: "flare-cpp",
    summary: "Systems programming: gcc, clang, cmake, ninja, gdb, valgrind.",
    provides: [
      "gcc/g++ and clang/clang++",
      "cmake, ninja, make, pkg-config",
      "gdb, valgrind",
      "libboost-all-dev, libssl-dev, zlib",
    ],
    cpuCount: 4,
    memoryMB: 4096,
    define: (t) =>
      finish(
        asRoot(t)
          .runCmd("apt-get update -qq")
          .aptInstall([
            "build-essential",
            "clang",
            "cmake",
            "ninja-build",
            "gdb",
            "valgrind",
            "pkg-config",
            "libboost-all-dev",
            "libssl-dev",
            "zlib1g-dev",
            "git",
            "ca-certificates",
          ]),
      ),
  },
];

const BY_ID = new Map(SANDBOX_ENVIRONMENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// Dynamic team templates.
// ---------------------------------------------------------------------------
// Anything the flare team's build pipeline has published to E2B but that is
// not (yet) in the static registry above. `listFlareTemplates()` reads the
// live E2B templates API; it never throws and is cached 5 minutes, so this
// whole mechanism degrades to exactly the static behaviour when E2B is
// unreachable (no key, network down): the snapshot just stays empty.
// ---------------------------------------------------------------------------

/** Snapshot of the flare-* templates discovered on the E2B team. */
let teamTemplates: FlareTemplate[] = [];

let teamRefreshInFlight: Promise<void> | null = null;

/** Fire-and-forget refresh of the snapshot. Idempotent, never rejects. */
const refreshTeamTemplates = (): void => {
  if (teamRefreshInFlight) return;
  teamRefreshInFlight = listFlareTemplates()
    .then((templates) => {
      teamTemplates = templates;
    })
    .catch(() => {
      // listFlareTemplates never throws, but never let a refresh take the
      // module down either — the previous snapshot (possibly empty) stays.
    })
    .finally(() => {
      teamRefreshInFlight = null;
    });
};

/** Synchronous snapshot; refreshes in the background when stale. */
const getTeamSnapshot = (): FlareTemplate[] => {
  refreshTeamTemplates();
  return teamTemplates;
};

/** Wrap a team template as a SandboxEnvironment so consumers are none the wiser. */
const synthesizeTeamEnv = (t: FlareTemplate): SandboxEnvironment => ({
  id: t.name,
  label: t.name,
  template: t.templateId,
  summary: "Custom template built on the flare team",
  provides: [],
  cpuCount: t.cpuCount,
  memoryMB: t.memoryMB,
  define: (tb) => tb.fromTemplate(t.templateId) as never,
});

export const DEFAULT_ENV_ID = "base";

/**
 * Which environments this deployment may spawn.
 *
 * Templates are built per E2B team, so a fresh deployment has none of them.
 * `E2B_ENABLED_TEMPLATES` (comma-separated ids) records what has actually been
 * built; anything not listed falls back to the stock image rather than failing
 * sandbox creation with "template not found".
 */
export const enabledEnvIds = (): string[] => {
  const raw = process.env.E2B_ENABLED_TEMPLATES?.trim();
  const staticIds = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter((id) => BY_ID.has(id))
    : [];
  // Every flare-* template discovered on the team counts as enabled too, even
  // if it is not in the static registry or the env var. Empty when E2B is
  // unreachable, which keeps today's behaviour intact.
  const teamIds = getTeamSnapshot().map((t) => t.name);
  return [...new Set([...staticIds, ...teamIds])];
};

export const getEnvironment = (id: string): SandboxEnvironment | undefined =>
  BY_ID.get(id);

/** Environments actually offered to the model. */
export const availableEnvironments = (): SandboxEnvironment[] => {
  const enabled = new Set(enabledEnvIds());
  const staticIds = new Set(SANDBOX_ENVIRONMENTS.map((e) => e.id));
  return [
    ...SANDBOX_ENVIRONMENTS.filter((e) => enabled.has(e.id)),
    // Team templates that are not in the static registry get a synthesized
    // entry so they are offered (and described) exactly like static ones.
    ...getTeamSnapshot()
      .filter((t) => !staticIds.has(t.name))
      .map(synthesizeTeamEnv),
  ];
};

export interface ResolvedEnvironment {
  id: string;
  /** E2B template name, or undefined for the stock image. */
  template?: string;
  environment?: SandboxEnvironment;
  /** Set when the request could not be honoured, to tell the model why. */
  degradedFrom?: string;
}

/**
 * Resolve a requested env id to something spawnable.
 *
 * Degrades rather than throws: an unbuilt template should give the agent a
 * usable general-purpose box plus an explanation, not an error it will retry
 * five times.
 */
export const resolveEnvironment = (requested?: string): ResolvedEnvironment => {
  const enabled = new Set(enabledEnvIds());
  const wanted = requested?.trim() || DEFAULT_ENV_ID;

  const env = BY_ID.get(wanted);
  if (env && enabled.has(env.id)) {
    return {
      id: env.id,
      template: env.template ?? undefined,
      environment: env,
    };
  }

  // A flare-* template the team has built — possibly not in the static
  // registry yet — still resolves by name. Discovery is live, so a template
  // built after deploy becomes spawnable without a code deploy.
  const team = getTeamSnapshot().find((t) => t.name === wanted);
  if (team) {
    return {
      id: team.name,
      template: team.templateId,
      environment: synthesizeTeamEnv(team),
    };
  }

  const base = BY_ID.get(DEFAULT_ENV_ID);
  if (base && enabled.has(DEFAULT_ENV_ID)) {
    return {
      id: DEFAULT_ENV_ID,
      template: base.template ?? undefined,
      environment: base,
      ...(wanted !== DEFAULT_ENV_ID ? { degradedFrom: wanted } : {}),
    };
  }

  // Nothing built at all — stock E2B image.
  return {
    id: DEFAULT_ENV_ID,
    ...(wanted !== DEFAULT_ENV_ID ? { degradedFrom: wanted } : {}),
  };
};

/**
 * The `env` parameter's description: one line per available environment.
 * Generated rather than hand-written so it can never list an environment this
 * deployment cannot actually spawn.
 */
export const describeEnvironments = (): string => {
  const envs = availableEnvironments();
  if (envs.length === 0) {
    return "Only a general-purpose image (Node + Python) is available on this deployment.";
  }
  return [
    "Which prebuilt environment to use. Each one is a real Linux VM with PASSWORDLESS SUDO — the agent is effectively root and can install anything (`sudo apt-get install`, pip, npm, any toolchain) if the environment lacks it. Prebuilt environments are faster because the toolchain is already there, but nothing is off-limits if it is not.",
    ...envs.map((e) => `- ${e.id}: ${e.summary}`),
  ].join("\n");
};

/** Full preinstalled-software briefing for one environment. */
export const describeEnvironmentContents = (
  env: SandboxEnvironment | undefined,
): string | undefined => {
  if (!env) return undefined;
  return [
    `Environment "${env.id}" (${env.label}) — already installed, nothing to set up:`,
    ...env.provides.map((p) => `  • ${p}`),
    ...(env.hints?.length
      ? ["", "Notes:", ...env.hints.map((h) => `  • ${h}`)]
      : []),
  ].join("\n");
};

// Kick off the first team-template discovery immediately (fire-and-forget).
// It is cached 5 minutes inside `client.ts` and degrades to the static
// behaviour when E2B is unreachable.
void refreshTeamTemplates();

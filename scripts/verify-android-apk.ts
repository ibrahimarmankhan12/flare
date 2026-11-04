/**
 * End-to-end proof for the `android` environment: write a calculator project
 * in ONE batch call, run ONE gradle command, get an APK.
 *
 * The point of comparison is a measured production run on the stock image:
 * 246 tool calls, 37 failures, 24 files rewritten 117 times, no APK.
 */
import "load-env";
import { Sandbox } from "e2b";
import { SANDBOX_ENVIRONMENTS } from "lib/sandbox/templates";

const pkg = "com.flare.calc";
const dir = "/home/user/work/Calculator";

const files: { path: string; data: string }[] = [
  {
    path: `${dir}/settings.gradle.kts`,
    data: `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "Calculator"
include(":app")
`,
  },
  {
    path: `${dir}/build.gradle.kts`,
    data: `plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`,
  },
  {
    path: `${dir}/gradle.properties`,
    data: `org.gradle.jvmargs=-Xmx2g
android.useAndroidX=true
kotlin.code.style=official
`,
  },
  {
    path: `${dir}/app/build.gradle.kts`,
    data: `plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}
android {
  namespace = "${pkg}"
  compileSdk = 35
  defaultConfig {
    applicationId = "${pkg}"
    minSdk = 24
    targetSdk = 35
    versionCode = 1
    versionName = "1.0"
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}
dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
}
`,
  },
  {
    path: `${dir}/app/src/main/AndroidManifest.xml`,
    data: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application
      android:label="Calculator"
      android:theme="@style/Theme.AppCompat.DayNight">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
`,
  },
  {
    path: `${dir}/app/src/main/java/com/flare/calc/CalculatorEngine.kt`,
    data: `package ${pkg}

/** Left-to-right calculator state machine: the arithmetic, with no Android in it. */
class CalculatorEngine {
  var display: String = "0"; private set
  private var accumulator: Double? = null
  private var pendingOp: Char? = null
  private var freshEntry = true

  fun digit(d: Char) {
    display = if (freshEntry || display == "0") d.toString() else display + d
    freshEntry = false
  }

  fun dot() {
    if (freshEntry) { display = "0."; freshEntry = false }
    else if (!display.contains('.')) display += "."
  }

  fun op(o: Char) {
    applyPending()
    pendingOp = o
    freshEntry = true
  }

  fun equals() {
    applyPending()
    pendingOp = null
    freshEntry = true
  }

  fun clear() {
    display = "0"; accumulator = null; pendingOp = null; freshEntry = true
  }

  private fun applyPending() {
    val current = display.toDoubleOrNull() ?: return
    val acc = accumulator
    val op = pendingOp
    val result = if (acc == null || op == null) current else when (op) {
      '+' -> acc + current
      '-' -> acc - current
      '*' -> acc * current
      '/' -> if (current == 0.0) Double.NaN else acc / current
      else -> current
    }
    accumulator = result
    display = format(result)
  }

  private fun format(v: Double): String = when {
    v.isNaN() || v.isInfinite() -> "Error"
    v == v.toLong().toDouble() -> v.toLong().toString()
    else -> v.toString()
  }
}
`,
  },
  {
    path: `${dir}/app/src/main/java/com/flare/calc/MainActivity.kt`,
    data: `package ${pkg}

import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  private val engine = CalculatorEngine()
  private lateinit var readout: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    readout = TextView(this).apply {
      textSize = 40f
      gravity = Gravity.END
      setPadding(32, 64, 32, 32)
      text = engine.display
    }

    val grid = GridLayout(this).apply { columnCount = 4 }
    val keys = listOf(
      "7","8","9","/",
      "4","5","6","*",
      "1","2","3","-",
      "0",".","=","+",
      "C",
    )
    for (k in keys) {
      grid.addView(Button(this).apply {
        text = k
        textSize = 22f
        setOnClickListener { onKey(k) }
        layoutParams = GridLayout.LayoutParams().apply { width = 260; height = 200 }
      })
    }

    setContentView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(readout)
      addView(grid)
    })
  }

  private fun onKey(k: String) {
    when {
      k[0].isDigit() -> engine.digit(k[0])
      k == "." -> engine.dot()
      k == "=" -> engine.equals()
      k == "C" -> engine.clear()
      else -> engine.op(k[0])
    }
    readout.text = engine.display
  }
}
`,
  },
];

const main = async () => {
  const t0 = Date.now();
  // Same envs session.ts applies at spawn - without GRADLE_USER_HOME, gradle
  // looks in an empty ~/.gradle and the pre-warmed cache is invisible.
  const env = SANDBOX_ENVIRONMENTS.find((e) => e.id === "android")!;
  const sbx = await Sandbox.create({
    template: env.template!,
    envs: env.envs,
    timeoutMs: 900_000,
  });
  console.log(`spawn: ${Date.now() - t0}ms  (${sbx.sandboxId})`);

  // --- tool call 1: the whole project ---------------------------------------
  const tw = Date.now();
  await sbx.files.write(files);
  console.log(`write_many: ${files.length} files in ${Date.now() - tw}ms`);

  // --- tool call 2: build ---------------------------------------------------
  const tb = Date.now();
  const r = await sbx.commands
    .run("gradle assembleDebug --no-daemon --console=plain --offline", {
      cwd: dir,
      timeoutMs: 900_000,
    })
    .catch(
      (e: any) => e?.result ?? { stdout: "", stderr: String(e), exitCode: 1 },
    );
  console.log(
    `gradle: exit=${r.exitCode} in ${Math.round((Date.now() - tb) / 1000)}s`,
  );
  const out = `${r.stdout}\n${r.stderr}`;
  console.log(out.split("\n").slice(-25).join("\n"));

  // --- did we actually get an APK? -----------------------------------------
  const check = await sbx.commands
    .run(
      `ls -la ${dir}/app/build/outputs/apk/debug/ 2>&1; ` +
        `unzip -l ${dir}/app/build/outputs/apk/debug/app-debug.apk 2>&1 | tail -12`,
    )
    .catch((e: any) => e?.result ?? { stdout: "", stderr: String(e) });
  console.log("\n--- APK ---");
  console.log(check.stdout || check.stderr);

  console.log(`\ntotal: ${Math.round((Date.now() - t0) / 1000)}s`);
  await Sandbox.kill(sbx.sandboxId);
};

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});

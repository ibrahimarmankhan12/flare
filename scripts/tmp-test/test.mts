import "/root/zip-main/scripts/tmp-test/polyfill.mts";
import { setCookieHeader } from "/root/zip-main/scripts/tmp-test/polyfill.mts";
import { createChatRequestSecurityPayload } from "../../src/lib/security/chat-request-guard.client";
import { loginAs, CHAT_BASE } from "/root/zip-main/scripts/tmp-test/helper.mts";

const email = "zephrus@flare.ai", password = "zephrus098";

async function main() {
  const cookie = await loginAs(email, password);
  setCookieHeader(cookie);
  const body = {
    id: crypto.randomUUID(),
    message: { id: "m1", role: "user", parts: [{ type: "text", text: "Say hi in 3 words" }] },
    chatModel: { provider: "flare", model: "deepseek/v3.1" },
    toolChoice: "auto",
  };
  const sec = await createChatRequestSecurityPayload({
    requestBody: body,
    getCaptchaToken: async () => "",
  });
  if (!sec) { console.log("NO SEC (challenge disabled?)"); return; }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("aborted after 120s")), 120_000);
  try {
    const res = await fetch(`${CHAT_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Origin": "https://flare-sh.tech",
        "Referer": "https://flare-sh.tech/",
        "Cookie": cookie,
      },
      body: JSON.stringify({ ...body, security: sec }),
      signal: ac.signal,
    });
    console.log("STATUS:", res.status);
    console.log("CTYPE:", res.headers.get("content-type"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      console.log("CHUNK:", chunk);
    }
    const full = chunks.join("");
    console.log("TOTAL BYTES:", full.length);
    console.log("TAIL:", full.slice(-300));
  } finally {
    clearTimeout(timer);
  }
}
main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
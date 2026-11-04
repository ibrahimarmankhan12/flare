export const CHAT_BASE = "http://localhost:3000";
export async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${CHAT_BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://flare-sh.tech" },
    body: JSON.stringify({ email, password }),
  });
  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map(c => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("login failed: " + await res.text());
  return cookie;
}

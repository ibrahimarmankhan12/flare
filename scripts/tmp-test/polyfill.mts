const make = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
};
(globalThis as any).sessionStorage = make();
(globalThis as any).localStorage = make();
let cookieHeader = "";
export const setCookieHeader = (c: string) => { cookieHeader = c; };
export const getCookieHeader = () => cookieHeader;
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = typeof input === "string" && input.startsWith("/api/") ? "http://localhost:3000" + input : input;
  const headers = { ...(init?.headers || {}) } as Record<string, string>;
  if (typeof input === "string" && input.startsWith("/api/")) {
    headers["Origin"] = "https://flare-sh.tech";
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    headers["sec-fetch-site"] = "same-origin";
    headers["sec-fetch-mode"] = "cors";
    if (cookieHeader) headers["Cookie"] = cookieHeader;
  }
  return origFetch(url, { ...init, headers });
};

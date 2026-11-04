export const dynamic = "force-dynamic";

const script = `
(function () {
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var agentId = currentScript.getAttribute("data-agent");
  if (!agentId) {
    console.error("Flare embed: missing data-agent");
    return;
  }

  var origin = new URL(currentScript.src, window.location.href).origin;
  var containerSelector = currentScript.getAttribute("data-container");
  var width = currentScript.getAttribute("data-width") || "100%";
  var height = currentScript.getAttribute("data-height") || "640px";
  var title = currentScript.getAttribute("data-title") || "Flare chat";
  var parent = currentScript.parentNode;
  if (containerSelector) {
    try {
      parent = document.querySelector(containerSelector) || parent;
    } catch (error) {
      console.error("Flare embed: invalid data-container selector", error);
    }
  }
  if (!parent) parent = document.body;

  var frame = document.createElement("iframe");
  frame.title = title;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "clipboard-write";
  frame.style.width = width;
  frame.style.height = height;
  frame.style.border = "0";
  frame.style.borderRadius = currentScript.getAttribute("data-radius") || "16px";
  frame.style.overflow = "hidden";
  frame.setAttribute("data-flare-embed", agentId);

  parent.appendChild(frame);

  fetch(origin + "/api/embed/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: agentId }),
    credentials: "omit"
  })
    .then(function (response) {
      if (!response.ok) throw new Error("session request failed");
      return response.json();
    })
    .then(function (payload) {
      if (!payload || typeof payload.iframeUrl !== "string") {
        throw new Error("invalid session response");
      }
      frame.src = payload.iframeUrl;
    })
    .catch(function (error) {
      console.error("Flare embed failed:", error);
      frame.remove();
    });
})();
`;

export function GET() {
  return new Response(script.trim(), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

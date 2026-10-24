/** Small notification at the bottom of a web page ("URL copied"). Lives in its own shadow root. */
export function showPageToast(text: string, durationMs = 1200): void {
  document.getElementById("cmdly-toast")?.remove();

  const host = document.createElement("div");
  host.id = "cmdly-toast";
  host.style.cssText = "all: initial; position: fixed; left: 0; right: 0; bottom: 48px; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      div {
        width: fit-content;
        margin: 0 auto;
        padding: 10px 16px;
        border-radius: 10px;
        background: #1e1e1e;
        color: #ececec;
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
        font: 500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        animation: rise 0.15s ease-out;
      }
      @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
    </style>
    <div></div>`;
  shadow.querySelector("div")!.textContent = text;
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), durationMs);
}

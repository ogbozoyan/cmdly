/** Notification in the top-right corner of a web page ("URL copied"). Lives in its own shadow root. */
const FADE_MS = 300;

export function showPageToast(text: string, durationMs = 2000): void {
  document.getElementById("cmdly-toast")?.remove();

  const host = document.createElement("div");
  host.id = "cmdly-toast";
  host.style.cssText = "all: initial; position: fixed; top: 20px; right: 20px; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      div {
        padding: 12px 20px;
        border-radius: 8px;
        background: rgba(30, 30, 35, 0.95);
        color: #fff;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
        animation: in ${FADE_MS}ms ease;
        transition: opacity ${FADE_MS}ms ease;
      }
      div.out { opacity: 0; }
      @keyframes in { from { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { div { animation: none; transition: none; } }
    </style>
    <div role="status"></div>`;
  const box = shadow.querySelector("div")!;
  box.textContent = text;
  document.documentElement.appendChild(host);
  setTimeout(() => box.classList.add("out"), durationMs - FADE_MS);
  setTimeout(() => host.remove(), durationMs);
}

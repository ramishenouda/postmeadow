import { getPublicPublication } from "@/lib/public-data";
import { absoluteUrl } from "@/lib/urls";

/**
 * The sign-up pop-up for a writer's own website:
 *   <script src="https://postmeadow.com/embed/{slug}/popup.js" async></script>
 * Shows the embedded form after a delay, once; closing it hides it for 30 days.
 */
export async function GET(_request: Request, { params }: RouteContext<"/embed/[slug]/popup.js">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) {
    return new Response("/* Postmeadow: unknown publication */", {
      status: 404,
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }
  const config = {
    key: `pm-popup-${slug}`,
    src: absoluteUrl(`/embed/${slug}?popup=1`),
    delay: Math.max(0, Math.min(120, publication.popupDelaySeconds)) * 1000,
    title: `Subscribe to ${publication.name}`,
  };
  const script = `(function () {
  var c = ${JSON.stringify(config)};
  try {
    var last = Number(localStorage.getItem(c.key) || 0);
    if (Date.now() - last < 30 * 24 * 3600 * 1000) return;
  } catch (e) {}
  function close(overlay) {
    try { localStorage.setItem(c.key, String(Date.now())); } catch (e) {}
    overlay.remove();
  }
  function show() {
    var overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", c.title);
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(20,20,20,.45);display:flex;align-items:center;justify-content:center;padding:16px";
    var box = document.createElement("div");
    box.style.cssText = "position:relative;width:100%;max-width:460px;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden";
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.textContent = "\\u00d7";
    x.style.cssText = "position:absolute;top:6px;right:10px;border:0;background:none;font:28px/1 sans-serif;color:#666;cursor:pointer";
    var frame = document.createElement("iframe");
    frame.src = c.src;
    frame.title = c.title;
    frame.style.cssText = "display:block;width:100%;height:290px;border:0";
    box.appendChild(frame);
    box.appendChild(x);
    overlay.appendChild(box);
    x.onclick = function () { close(overlay); };
    overlay.onclick = function (e) { if (e.target === overlay) close(overlay); };
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(overlay); document.removeEventListener("keydown", esc); }
    });
    document.body.appendChild(overlay);
  }
  setTimeout(show, c.delay);
})();
`;
  return new Response(script, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}

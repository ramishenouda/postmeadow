/** Minimal DOM for running Tiptap headlessly. Import before anything that touches the DOM. */
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
const globals: Record<string, unknown> = {
  window,
  document: window.document,
  navigator: window.navigator, // Node 24 defines a read-only one; override it
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
};
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

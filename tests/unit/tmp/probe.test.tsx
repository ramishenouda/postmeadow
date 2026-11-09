import "../setup-dom";
import { Editor } from "@tiptap/core";
import { contentExtensions } from "../../../src/components/editor/extensions";
import { parseMarkdown } from "../../../src/lib/markdown/parse";

const md = `Intro text.

![Hero shot](https://x.test/hero.jpg "The hero")

![Linen shirt](https://x.test/a.jpg "Linen shirt · $59")

![Wide trousers](https://x.test/b.jpg "Wide trousers · $79")

![Tote](https://x.test/c.jpg)

[Shop the collection →](https://shop.test)

Text with ![inline](https://x.test/i.jpg) image.

![one](https://x.test/1.jpg) ![two](https://x.test/2.jpg)`;
const e = new Editor({ extensions: contentExtensions(), content: md, contentType: "markdown" });
console.log("=== OUT ===\n" + e.getMarkdown());
console.log(JSON.stringify(e.getJSON().content?.map((n) => n.type)));
console.log(JSON.stringify(parseMarkdown(e.getMarkdown()).children.map((n) => n.type + ":" + ("children" in n ? n.children.map((c) => c.type).join(",") : ""))));

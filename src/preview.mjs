// Serve dist/ on http://localhost:8000 to see the page before it is published.
// Usage: node src/preview.mjs [PORT]

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2] || 8000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

http
  .createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(join(dir, p));
      res
        .writeHead(200, {
          "Content-Type": types[extname(p)] || "application/octet-stream",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Preview: http://localhost:${port}/`),
  );

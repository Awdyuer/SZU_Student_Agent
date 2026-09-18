/* 极简静态服务器 —— 零依赖，仅用于本地预览
   用法： node serve.mjs        （默认 http://127.0.0.1:5173）
          PORT=8080 node serve.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  let pathname = decodeURIComponent(
    new URL(request.url || "/", "http://localhost").pathname,
  );
  if (pathname === "/") pathname = "/index.html";

  const absolutePath = resolve(ROOT, pathname.replace(/^[/\\]+/, ""));

  // 目录穿越防护，和 classroom-chat/server.mjs 里的写法保持一致
  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!(await stat(absolutePath)).isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Content-Type": MIME[extname(absolutePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(await readFile(absolutePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

/* 输出一律用 ASCII。
   Windows 控制台按系统代码页（中文系统是 GBK）解码，Node 写出去的
   却是 UTF-8 —— 中文和 → 这类符号会显示成乱码。
   给用户看的中文提示放在 start.cmd 里，那个文件本身存成 GBK。 */
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Try another one:  set PORT=8080 && node serve.mjs\n`);
  } else {
    console.error(`\n  Failed to start: ${err.message}\n`);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Server running: http://127.0.0.1:${PORT}\n`);
});

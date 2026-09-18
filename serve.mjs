/* 极简静态服务器 —— 零依赖，仅用于本地预览
   用法： node serve.mjs        （默认 http://127.0.0.1:5173）
          PORT=8080 node serve.mjs

   支持 Range 请求：视频要有它才能拖进度条、才能边下边播。
*/
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  /* 视频与音频：没有这些会以 application/octet-stream 返回，
     浏览器只能靠嗅探，不可靠 */
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/* 解析 Range 头。支持三种写法：
     bytes=0-       从头到结尾
     bytes=100-200  闭区间
     bytes=-500     最后 500 字节（也是插封面/试听常用的写法）
   返回 null 表示没有 Range 或格式不认识；返回 {unsatisfiable:true} 表示越界。 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  let start, end;
  if (rawStart === "") {
    const n = Number(rawEnd);
    if (!n) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

function streamFile(absolutePath, options, response) {
  if (options.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(absolutePath, options);
  /* 中途出错时头已经发出去了，改不了状态码，只能断开 */
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  let pathname = decodeURIComponent(
    new URL(request.url || "/", "http://localhost").pathname,
  );
  if (pathname === "/") pathname = "/index.html";

  const absolutePath = resolve(ROOT, pathname.replace(/^[/\\]+/, ""));

  // 目录穿越防护
  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) throw new Error("not a file");

    const headers = {
      "Content-Type": MIME[extname(absolutePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      /* 告诉浏览器「这个资源支持分段请求」，它才敢发 Range */
      "Accept-Ranges": "bytes",
    };

    const range = parseRange(request.headers.range, info.size);

    if (range && range.unsatisfiable) {
      response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
      response.end();
      return;
    }

    if (range) {
      response.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Content-Length": range.end - range.start + 1,
      });
      streamFile(absolutePath, { start: range.start, end: range.end, method: request.method }, response);
      return;
    }

    response.writeHead(200, { ...headers, "Content-Length": info.size });
    streamFile(absolutePath, { method: request.method }, response);
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

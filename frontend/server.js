/**
 * Servidor Next.js personalizado con túnel TCP para WebSocket.
 *
 * Por qué es necesario:
 *   - basePath "/chatcaa" hace que Next.js sirva todo bajo ese prefijo.
 *   - Los rewrites de next.config.ts cubren HTTP pero NO WebSocket.
 *   - El backend (puerto 8010) puede estar tras un firewall; el navegador
 *     solo tiene acceso al puerto 3010.
 *   - Este servidor tuneliza los upgrades WS en /chatcaa/ws/* al backend
 *     en localhost:8010 usando TCP puro (sin modificar los frames WebSocket).
 *     Elimina el prefijo /chatcaa antes de reenviar al backend.
 */

const { createServer } = require("http");
const { parse } = require("url");
const net = require("net");
const next = require("next");

const port = parseInt(process.env.PORT || "3010", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Túnel TCP puro para WebSocket upgrades en /chatcaa/ws/* → backend:8010
  // Los demás upgrades (p.ej. /_next/webpack-hmr para HMR) se dejan pasar
  // al listener interno de Next.js — pero reescribimos el Origin para evitar
  // el bloqueo cross-origin de Next.js dev (el navegador se conecta desde
  // signal4.cps.unizar.es pero el servidor corre en localhost).
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (pathname && pathname.startsWith("/chatcaa/ws/")) {
      // → Tunelar al backend (ver código abajo)
    } else {
      // → HMR u otros WS de Next.js: reescribir Origin para que pase la
      // comprobación de cross-origin del servidor de dev.
      if (req.headers.origin) {
        req.headers.origin = `http://localhost:${port}`;
      }
      return; // Next.js tiene su propio listener registrado en este servidor
    }

    console.log(`[WS tunnel] ${req.url}`);

    // Quitar el prefijo /chatcaa antes de reenviar al backend
    req.url = req.url.replace(/^\/chatcaa/, "");

    const tunnel = net.connect(8010, "localhost", () => {
      // TCP keepalive: mantiene viva la conexión durante los silencios largos
      // mientras el LLM procesa (pueden ser decenas de segundos)
      tunnel.setKeepAlive(true, 10_000); // probe cada 10 s
      tunnel.setNoDelay(true);
      socket.setKeepAlive(true, 10_000);
      socket.setNoDelay(true);

      // Reenviar la solicitud de upgrade HTTP al backend
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n");
      tunnel.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`
      );
      if (head && head.length > 0) tunnel.write(head);

      // Tubería bidireccional
      tunnel.pipe(socket);
      socket.pipe(tunnel);
    });

    tunnel.on("error", (err) => {
      console.error("[WS tunnel error]", err.message);
      socket.destroy();
    });
    socket.on("error", () => tunnel.destroy());
    socket.on("close", () => tunnel.destroy());
    tunnel.on("close", () => socket.destroy());
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`\n> Ready on http://localhost:${port}/chatcaa`);
    console.log(
      `> WebSocket tunnel: ws://[host]:${port}/chatcaa/ws/* → ws://localhost:8010/ws/*\n`
    );
  });
});

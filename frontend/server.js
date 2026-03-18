/**
 * Servidor Next.js personalizado con proxy WebSocket via túnel TCP.
 *
 * Por qué es necesario:
 *   - Los rewrites de next.config.ts solo cubren HTTP, no WebSocket.
 *   - El backend (puerto 8010) puede estar tras un firewall y no ser
 *     accesible directamente desde el navegador.
 *   - Este servidor escucha en el puerto 3010 y tuneliza los upgrades
 *     WebSocket (/ws/*) al backend en localhost:8010 usando un túnel TCP
 *     puro (sin modificar los frames WebSocket).
 *
 * Con esto, el frontend SIEMPRE conecta por el mismo puerto (3010), tanto
 * para REST como para WebSocket.
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

  // Túnel TCP puro para WebSocket upgrades en /ws/* → backend:8010
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (!pathname || !pathname.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    console.log(`[WS tunnel] ${req.url}`);

    const tunnel = net.connect(8010, "localhost", () => {
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
    console.log(`\n> Ready on http://localhost:${port}`);
    console.log(
      `> WebSocket tunnel: ws://[host]:${port}/ws/* → ws://localhost:8010/ws/*\n`
    );
  });
});


const { createHmac } = require("node:crypto");
const { createServer } = require("node:http");
const { parse } = require("node:url");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function normalizePeer(address) {
  if (!address) {
    return null;
  }
  let host = String(address).trim().toLowerCase();
  if (host.startsWith("::ffff:")) {
    host = host.slice("::ffff:".length);
  }
  if (!/^[0-9a-f:.]+$/i.test(host) || host.length < 3 || host.length > 64) {
    return null;
  }
  return host;
}

function stampPeer(peer) {
  const secret = process.env.AUTH_SECRET || "";
  if (!secret || !peer) {
    return null;
  }
  const mac = createHmac("sha256", secret).update(`peer:${peer}`).digest("base64url");
  return `${peer}.${mac}`;
}

app.prepare().then(() => {
  createServer((req, res) => {
    const trustProxy = process.env.TRUST_PROXY === "1";
    const peer = normalizePeer(req.socket.remoteAddress);
    if (!trustProxy) {
      delete req.headers["x-forwarded-for"];
      delete req.headers["x-real-ip"];
    }
    const stamped = stampPeer(peer);
    if (stamped) {
      req.headers["x-inventory-peer"] = stamped;
    } else {
      delete req.headers["x-inventory-peer"];
    }
    handle(req, res, parse(req.url || "/", true));
  }).listen(port, hostname);
});

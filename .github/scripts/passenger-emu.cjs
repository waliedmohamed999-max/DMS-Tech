// CI only: emulates the part of Phusion Passenger's Node.js loader that app.js depends on — a PhusionPassenger global with
// configure(), and server.listen('passenger') bound to a socket owned by the "web server" (here: EMU_PORT on 127.0.0.1).
// Any other listen() call fails, proving app.js binds through Passenger and nowhere else.
const http = require("node:http");
let configured = null;
global.PhusionPassenger = { configure: (o) => { configured = o; } };
const orig = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  if (args[0] !== "passenger") throw new Error(`under Passenger the app must listen('passenger'), got ${JSON.stringify(args[0])}`);
  if (!configured || configured.autoInstall !== false) throw new Error("app.js did not call PhusionPassenger.configure({ autoInstall: false }) first");
  const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
  return orig.call(this, Number(process.env.EMU_PORT), "127.0.0.1", cb);
};

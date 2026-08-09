import { createServer } from "node:http";

const port = Number(process.env.PORT || 4100);
const status = Number(process.env.RESPONSE_STATUS || 503);
const delay = Number(process.env.RESPONSE_DELAY_MS || 0);
let requests = 0;

createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    requests += 1;
    setTimeout(() => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: status >= 200 && status < 300, request: requests, bytes: Buffer.concat(chunks).length }));
    }, delay);
  });
}).listen(port, () => console.log(`Failure receiver listening on http://localhost:${port}; status=${status}; delay=${delay}ms`));

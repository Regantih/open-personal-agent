// Demo server for recordings: the real app + routes + built client, but with
// a scripted model so no API key is needed. Everything downstream of the model
// call (policy, approvals, mandates, the real Chromium browser rung) is live.
//
//   npx tsx script/serve-demo.ts        -> http://127.0.0.1:5199
//
// Requires a built client (npm run build) for the UI; single-user mode with
// seeded demo data unless OPA_DB_PATH/OPA_MULTI_USER say otherwise.

process.env.OPA_DB_PATH = process.env.OPA_DB_PATH || "demo5.db";
const PORT = Number(process.env.PORT || 5199);
process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${PORT}`;

import express from "express";
import { createServer } from "node:http";
import path from "node:path";

async function main() {
  const { registerRoutes } = await import("../server/routes");
  const { setScriptedModel, scriptOutput } = await import("../server/agent/llm");

  // Content-aware scenario (survives reruns): if the turn already has a tool
  // result, summarize; if the user mentions a browser/open -> real T3
  // browser_open driving real Chromium; otherwise a plain reply.
  setScriptedModel((req) => {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const content = JSON.stringify(lastUser?.content ?? "");
    if (/tool_result/.test(content)) {
      return scriptOutput({ say: "Done — github.com is open in my Chromium session. Open the Browser tab to watch it live, click into the view to take over, or tell me to read the page or close it." });
    }
    if (/browser|github|open a page|open github/i.test(content)) {
      return scriptOutput({ tool: "browser_open", input: { url: "https://github.com/Regantih/open-personal-agent" } });
    }
    return scriptOutput({ say: "On it — for this recording, ask me to open a page in the browser (e.g. \"open github.com/Regantih/open-personal-agent in your browser\")." });
  });

  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  const pub = path.resolve("dist/public");
  app.use(express.static(pub));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(pub, "index.html")));

  await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", r));
  console.log(`[serve-demo] http://127.0.0.1:${PORT} (scripted model, live tools)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

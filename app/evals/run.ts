// Eval runner: drives every task in tasks.ts through the real agent pipeline
// (policy engine, approvals, mandates, kill switch, memory, tools) with the
// scripted model provider, so no API key or network is needed.
//
//   npm run eval           run all tasks
//   npm run eval -- e14    run a single task by id prefix
//
// Each task starts from a freshly seeded in-memory database. A non-zero exit
// code means at least one task failed.
//
// Tenancy: each task runs as the "eval" user; tenancy-isolation tasks create
// additional users and assert store scoping.

process.env.OPA_DB_PATH = process.env.OPA_DB_PATH || ":memory:";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "eval-no-key";

import { tasks, type EvalHelpers, type EvalStep, type Expect, type PlanStep } from "./tasks";

let queue: PlanStep[] = [];

async function main() {
  const db = await import("../server/agent/db");
  const agent = await import("../server/agent/agent");
  const { setScriptedModel, scriptOutput } = await import("../server/agent/llm");
  const flights = await import("../server/agent/flights");
  const omf = await import("../server/agent/omf");
  const policy = await import("../server/agent/policy");
  const vault = await import("../server/agent/vault");
  const email = await import("../server/agent/email");
  const keys = await import("../server/agent/keys");
  const routes = await import("../server/routes");

  const EVAL_USER = "eval";
  const ctx = agent.ctxFor(EVAL_USER);
  const store = ctx.store;
  db.ensureLocalUser();
  db.findOrCreateUser({ email: "eval@example.com" }); // ensure a real user row exists for EVAL_USER-independent helpers

  setScriptedModel(async () => {
    const step = queue.shift();
    if (!step) return scriptOutput({ say: "OK." });
    return scriptOutput(step as any);
  });

  const filter = process.argv[2];
  const selected = tasks.filter((t) => !filter || t.id.startsWith(filter));
  if (!selected.length) {
    console.error(`No tasks matched "${filter}".`);
    process.exit(1);
  }

  let lastReply = "";
  let eventMark = 0;
  const stash: Record<string, any> = {};

  const h: EvalHelpers = {
    db, store, flights, omf, policy, vault, email, keys, routes, stash, ctx,
    decideApproval: (id, decision, allowCategory, via) => agent.decideApproval(ctx, id, decision, allowCategory, via),
    handleInbound: (text, channel) => agent.handleInbound(ctx, text, channel),
    lastReply: () => lastReply,
    pendingApprovals: async () => (await store.listApprovals()).filter((a) => a.status === "pending"),
    allApprovals: () => store.listApprovals(),
    eventsSince: async (mark) => (await store.listEvents(10000)).filter((e) => e.id > mark).map((e) => ({ type: e.type, summary: e.summary, data: e.data })),
  };

  async function checkExpect(exp: Expect, label: string) {
    const fail = (msg: string) => { throw new Error(`${label}: ${msg}`); };
    if (exp.reply && !exp.reply.test(lastReply)) fail(`reply did not match ${exp.reply} — got: ${lastReply.slice(0, 160)}`);
    if (exp.approvalsPending !== undefined && (await h.pendingApprovals()).length !== exp.approvalsPending) fail(`expected ${exp.approvalsPending} pending approvals, got ${(await h.pendingApprovals()).length}`);
    const all = await h.allApprovals();
    if (exp.approvalsTotal !== undefined && all.length !== exp.approvalsTotal) fail(`expected ${exp.approvalsTotal} total approvals, got ${all.length}`);
    if (exp.approval) {
      const match = all.find((a) =>
        (exp.approval!.action === undefined || a.action === exp.approval!.action) &&
        (exp.approval!.tool === undefined || a.tool === exp.approval!.tool) &&
        (exp.approval!.tier === undefined || a.tier === exp.approval!.tier) &&
        (exp.approval!.escalated === undefined || a.escalated === exp.approval!.escalated) &&
        (exp.approval!.status === undefined || a.status === exp.approval!.status));
      if (!match) fail(`no approval matching ${JSON.stringify(exp.approval)} — got: ${JSON.stringify(all.map((a) => [a.tool, a.action, a.tier, a.status, a.escalated]))}`);
    }
    if (exp.tool) {
      const evs = await h.eventsSince(eventMark);
      const { name, status } = exp.tool;
      const ok =
        status === "ok" ? evs.some((e) => e.type === "tool_call" && e.data?.tool === name) :
        status === "error" ? evs.some((e) => e.type === "error" && e.data?.tool === name) :
        evs.some((e) => e.type === "policy" && e.data?.tool === name && e.summary.startsWith(status === "blocked" ? "BLOCK" : "NEEDS_APPROVAL"));
      if (!ok) fail(`no ${status} event for tool ${name} — events: ${evs.map((e) => `${e.type}:${e.summary.slice(0, 60)}`).join(" | ").slice(0, 500)}`);
    }
    if (exp.event && !(await h.eventsSince(eventMark)).some((e) => exp.event!.test(e.summary))) fail(`no event matching ${exp.event}`);
    if (exp.fact && !(await store.listFacts()).some((f) => exp.fact!.test(f.statement))) fail(`no active fact matching ${exp.fact}`);
    if (exp.noFact && (await store.listFacts()).some((f) => exp.noFact!.test(f.statement))) fail(`fact matching ${exp.noFact} is still active`);
    if (exp.bookings !== undefined && (await store.listBookings()).length !== exp.bookings) fail(`expected ${exp.bookings} bookings, got ${(await store.listBookings()).length}`);
    if (exp.inboxCount !== undefined && (await store.listInbox()).length !== exp.inboxCount) fail(`expected ${exp.inboxCount} inbox mails, got ${(await store.listInbox()).length}`);
    if (exp.inboxAllRead && (await store.listInbox()).some((m) => !m.read)) fail("inbox has unread mail");
    if (exp.outbox) {
      const match = (await store.listOutbox()).find((o) => o.status === exp.outbox!.status && (!exp.outbox!.to || exp.outbox!.to.test(o.recipient)));
      if (!match) fail(`no outbox item matching ${JSON.stringify({ status: exp.outbox.status, to: String(exp.outbox.to) })}`);
    }
    if (exp.calendar && !(await store.listCalendar()).some((c) => exp.calendar!.test(c.title))) fail(`no calendar item matching ${exp.calendar}`);
    if (exp.paused !== undefined && (await store.getSetting("paused", false)) !== exp.paused) fail(`paused=${await store.getSetting("paused", false)}, expected ${exp.paused}`);
  }

  async function runStep(step: EvalStep, label: string) {
    if ("model" in step) {
      const plan = typeof step.model === "function" ? await step.model(h) : step.model;
      queue.push(...plan);
    } else if ("say_to_agent" in step) {
      const text = typeof step.say_to_agent === "function" ? await step.say_to_agent(h) : step.say_to_agent;
      lastReply = await agent.handleInbound(ctx, text, step.channel ?? "web");
    } else if ("decide_pending" in step) {
      for (const a of await h.pendingApprovals()) {
        const r = await agent.decideApproval(ctx, a.id, step.decide_pending, !!step.allowCategory, "eval");
        lastReply = r.message;
      }
    } else if ("expect" in step) {
      await checkExpect(step.expect, label);
    } else if ("run" in step) {
      await step.run(h);
    }
  }

  let pass = 0;
  const failures: { id: string; name: string; error: string }[] = [];

  for (const task of selected) {
    queue = [];
    lastReply = "";
    for (const k of Object.keys(stash)) delete stash[k];
    await store.seed(true);
    eventMark = (await store.listEvents(10000)).reduce((m, e) => Math.max(m, e.id), 0);

    try {
      for (let i = 0; i < task.script.length; i++) await runStep(task.script[i], `${task.id} step ${i + 1}`);
      pass++;
      console.log(`  PASS  ${task.id}  ${task.name}`);
    } catch (e: any) {
      failures.push({ id: task.id, name: task.name, error: e.message });
      console.log(`  FAIL  ${task.id}  ${task.name}\n        ${e.message}`);
    }
  }

  console.log(`\n${pass}/${selected.length} tasks passed.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f.id} ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("eval runner crashed:", e);
  process.exit(1);
});

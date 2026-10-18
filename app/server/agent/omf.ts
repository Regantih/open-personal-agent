import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Ajv2020Mod from "ajv/dist/2020";
import addFormatsMod from "ajv-formats";
const Ajv2020: any = (Ajv2020Mod as any).default ?? Ajv2020Mod;
const addFormats: any = (addFormatsMod as any).default ?? addFormatsMod;
import * as db from "./db";
import { timezone } from "./agent";

// Open Memory Format v0.1 export and import, validated against the shared spec schema.

function schemaPath() {
  const c = [process.env.OMF_SCHEMA_PATH, path.resolve(process.cwd(), "../spec/open-memory-format/schema.json"), path.resolve(process.cwd(), "omf-schema.json")].filter(Boolean) as string[];
  const f = c.find((p) => existsSync(p));
  if (!f) throw new Error("OMF schema not found. Set OMF_SCHEMA_PATH.");
  return f;
}
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath(), "utf8")));

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function exportOMF() {
  const facts = db.listFacts().map((f) => ({
    id: f.id, category: f.category, ...(f.key ? { key: f.key } : {}), statement: f.statement,
    source: { type: f.sourceType, ...(f.channel ? { channel: f.channel } : {}), ...(f.reference ? { reference: f.reference } : {}) },
    confidence: f.confidence, scope: f.scope, sensitivity: f.sensitivity, created_at: iso(f.createdAt)!, expires_at: iso(f.expiresAt),
    ...(f.supersedes.length ? { supersedes: f.supersedes } : {}),
  }));
  const doc = {
    omf_version: "0.1",
    subject: { id: "u_local", locale: "en-US", timezone },
    exported_at: new Date().toISOString(),
    exported_by: { agent: "open-personal-agent", agent_version: "0.2.0" },
    facts,
    people: [],
    grants: [
      { service: "sample_calendar", scopes: ["calendar.events"], granted_at: new Date(0).toISOString(), revoked_at: null, credential_ref: "vault://cred/sample-calendar" },
      { service: "sample_inbox", scopes: ["email.inbox:read"], granted_at: new Date(0).toISOString(), revoked_at: null, credential_ref: "vault://cred/sample-inbox" },
    ],
  };
  if (!validate(doc)) throw new Error("Export failed schema validation: " + ajv.errorsText(validate.errors));
  return doc;
}

export function importOMF(doc: unknown): { imported: number } {
  if (!validate(doc)) throw new Error("Not a valid OMF v0.1 document: " + ajv.errorsText(validate.errors));
  const d = doc as any;
  let n = 0;
  for (const f of d.facts) {
    db.insertFact({
      category: f.category, key: f.key ?? null, statement: f.statement, sourceType: "imported", channel: "omf_import",
      reference: `${d.exported_by?.agent ?? "unknown"}:${f.id}`, confidence: f.confidence ?? 1, scope: f.scope ?? "other",
      sensitivity: f.sensitivity ?? "low", expiresAt: f.expires_at ? Date.parse(f.expires_at) : null,
    });
    n++;
  }
  db.logEvent("memory", `Imported ${n} facts from OMF export by ${d.exported_by?.agent ?? "unknown agent"}`, { imported: n });
  return { imported: n };
}

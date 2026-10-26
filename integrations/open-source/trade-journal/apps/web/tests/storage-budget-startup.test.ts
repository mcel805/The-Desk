import { afterAll, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "journal-external-start-"));
const external = join(root, "external");
const local = join(root, "local");
mkdirSync(external);
mkdirSync(local);
const policy = join(local, "policy.json");
const limit = 136 * 1024 * 1024;
writeFileSync(
  policy,
  JSON.stringify({ volume: root, external_root: external, limit_bytes: limit }),
);
const previous = { ...process.env };
process.env.JOURNAL_DATA_DIR = external;
process.env.DESK_STORAGE_POLICY = policy;
process.env.DESK_STORAGE_MODE = "EXTERNAL";
process.env.JOURNAL_SECRET_FILE = join(local, "journal-secret");
delete process.env.JOURNAL_SECRET;
const { db, settings } = await import("../src/db");
const sqlite = db.$client;
let currentClient = sqlite;
afterAll(() => {
  currentClient.close();
  process.env = previous;
  rmSync(root, { recursive: true, force: true });
});
describe("connected managed Journal", () => {
  it("initializes externally and supports normal reads, writes and RETURNING", () => {
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("truncate");
    const saved = db.insert(settings).values({ key: "normal", value: "safe" }).returning().get();
    expect(saved).toEqual({ key: "normal", value: "safe" });
    expect(sqlite.prepare("select value from settings where key = ?").get("normal")).toEqual({
      value: "safe",
    });
  });
  it("rolls back an oversized transaction without losing earlier data or exceeding budget", () => {
    expect(() =>
      sqlite.transaction(() => {
        sqlite.prepare("insert into settings values (?, ?)").run("transaction", "pending");
        sqlite
          .prepare("insert into settings values (?, ?)")
          .run("oversized", "x".repeat(8 * 1024 * 1024));
      })(),
    ).toThrow();
    expect(sqlite.prepare("select value from settings where key = ?").get("normal")).toEqual({
      value: "safe",
    });
    expect(
      sqlite.prepare("select value from settings where key = ?").get("transaction"),
    ).toBeUndefined();
    const bytes = readdirSync(external).reduce(
      (sum, name) => sum + statSync(join(external, name)).size,
      0,
    );
    expect(bytes).toBeLessThan(limit);
    expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  });
  it("persists encrypted credentials externally with a reusable local-only key", async () => {
    const { encryptJson, decryptJson } = await import("../src/server/crypto");
    const credential = { token: "synthetic-test-credential" };
    const encrypted = encryptJson(credential);
    db.insert(settings).values({ key: "encrypted-test", value: encrypted }).run();
    expect(decryptJson(encrypted)).toEqual(credential);
    expect(existsSync(join(external, ".secret"))).toBe(false);
    expect(readFileSync(join(local, "journal-secret"), "utf8")).toHaveLength(64);
    expect(statSync(join(local, "journal-secret")).mode & 0o777).toBe(0o600);
  });
  it("reopens a managed database with its persisted write guards before migrations", async () => {
    sqlite.close();
    delete (globalThis as { __journalDb?: unknown }).__journalDb;
    vi.resetModules();
    const reopened = await import("../src/db");
    currentClient = reopened.db.$client;
    expect(currentClient.prepare("select value from settings where key = ?").get("normal")).toEqual(
      { value: "safe" },
    );
    currentClient.prepare("update settings set value = ? where key = ?").run("reopened", "normal");
    expect(currentClient.pragma("integrity_check", { simple: true })).toBe("ok");
  });
});

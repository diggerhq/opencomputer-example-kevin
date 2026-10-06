import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import project from "../opencomputer/project";
import { generate, header } from "../scripts/generate";

const ROOT = resolve(import.meta.dirname, "..");

test("every agent's process/ matches the source (generate --check)", async () => {
  assert.deepEqual(await generate({ root: ROOT, agents: project.agents, check: true }), []);
});

test("generate reports missing, stale and extra copies, and fixes them", async () => {
  const root = await mkdtemp(join(tmpdir(), "kevin-generate-"));
  try {
    await mkdir(join(root, "process"));
    await writeFile(join(root, "process", "a.ts"), 'export const A = "a";\n');
    await mkdir(join(root, "opencomputer", "agents", "two", "process"), { recursive: true });
    await writeFile(join(root, "opencomputer", "agents", "two", "process", "a.ts"), "edited by hand\n");
    await writeFile(join(root, "opencomputer", "agents", "two", "process", "old.ts"), "removed from source\n");

    const agents = ["one", "two"];
    assert.deepEqual(await generate({ root, agents, check: true }), [
      { agent: "one", file: "a.ts", kind: "missing" },
      { agent: "two", file: "a.ts", kind: "stale" },
      { agent: "two", file: "old.ts", kind: "extra" },
    ]);
    await generate({ root, agents, check: false });
    assert.deepEqual(await generate({ root, agents, check: true }), []);
    assert.equal(
      await readFile(join(root, "opencomputer", "agents", "one", "process", "a.ts"), "utf8"),
      `${header("a.ts")}export const A = "a";\n`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

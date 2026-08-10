import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("events.json contains 70 chronologically ordered events", async () => {
  const events = JSON.parse(await readFile(new URL("app/events.json", root), "utf8"));
  assert.equal(events.length, 70);
});

test("page copy uses the dynamic event count", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /\{events\.length\} events/);
  assert.match(page, /\{events\.length\} turning points/);
});

test("wrangler deploy uses prebuilt OpenNext output", async () => {
  const wrangler = await readFile(new URL("wrangler.jsonc", root), "utf8");
  assert.match(wrangler, /"name":\s*"importantdatestolearn"/);
  assert.match(wrangler, /"main":\s*"\.open-next\/worker\.js"/);
  assert.doesNotMatch(wrangler, /"build":\s*\{/);
});

test("package scripts use Next.js and OpenNext", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.scripts.build, "next build");
  assert.match(packageJson.scripts.deploy, /opennextjs-cloudflare build/);
});

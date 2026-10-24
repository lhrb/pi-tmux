import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { commitInstructions, launchPi, registerCommands, shellQuote, type LaunchRequest } from "./commands.js";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];

function harness(options: { busy?: boolean; mode?: string; tmux?: boolean; saved?: boolean; failure?: boolean } = {}) {
  const commands = new Map<string, Command>();
  const launches: LaunchRequest[] = [];
  const notices: string[] = [];
  const pi = { registerCommand: (name: string, command: Command) => commands.set(name, command) } as unknown as ExtensionAPI;
  const ctx = {
    cwd: "/tmp/project with 'quotes'",
    mode: options.mode ?? "tui",
    isIdle: () => !options.busy,
    ui: { notify: (message: string) => notices.push(message) },
    sessionManager: { getSessionFile: () => options.saved === false ? undefined : "/tmp/session 'one'.jsonl" },
  } as unknown as ExtensionCommandContext;
  registerCommands(pi, {
    env: options.tmux === false ? {} : { TMUX: "/tmp/tmux", TMUX_PANE: "%42" },
    exists: () => true,
    launch: (request) => {
      if (options.failure) throw new Error("tmux unavailable");
      launches.push(request);
    },
  });
  return { commands, launches, notices, ctx, run: (name: string) => commands.get(name)!.handler("", ctx) };
}

test("registers only t:-prefixed commands", () => {
  assert.deepEqual([...harness().commands.keys()], ["t:commit", "t:new", "t:fork"]);
});

test("commit dispatches its prompt and model in a right-hand pane", async () => {
  const h = harness();
  await h.run("t:commit");
  assert.deepEqual(h.launches, [{
    layout: "pane", cwd: h.ctx.cwd, pane: "%42",
    args: ["--model", "gpt-6-luna", "--thinking", "low", "--", commitInstructions],
  }]);
});

test("new starts fresh in the same directory, even while the parent works", async () => {
  const h = harness({ busy: true });
  await h.run("t:new");
  assert.deepEqual(h.launches, [{ layout: "window", cwd: h.ctx.cwd, pane: "%42", args: [] }]);
});

test("fork uses Pi's native CLI fork without switching the parent session", async () => {
  const h = harness();
  await h.run("t:fork");
  assert.deepEqual(h.launches, [{
    layout: "window", cwd: h.ctx.cwd, pane: "%42", args: ["--fork", "/tmp/session 'one'.jsonl"],
  }]);
});

for (const name of ["t:commit", "t:fork"]) {
  test(`${name} refuses a busy parent`, async () => {
    const h = harness({ busy: true });
    await h.run(name);
    assert.equal(h.launches.length, 0);
    assert.match(h.notices[0], /busy/);
  });
}

for (const options of [{ tmux: false }, { mode: "rpc" }, { mode: "print" }]) {
  test(`requires a tmux terminal: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    for (const name of h.commands.keys()) await h.run(name);
    assert.equal(h.launches.length, 0);
    assert.equal(h.notices.length, 3);
  });
}

test("fork refuses unsaved sessions", async () => {
  const h = harness({ saved: false });
  await h.run("t:fork");
  assert.equal(h.launches.length, 0);
  assert.match(h.notices[0], /not been saved/);
});

test("launch failures report errors without running work in the parent", async () => {
  const h = harness({ failure: true });
  await h.run("t:commit");
  assert.match(h.notices[0], /tmux unavailable/);
  assert.equal(h.launches.length, 0);
});

test("launcher resolves window targets to sessions and keeps pane targets for splits", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-tmux-test-"));
  const previousPath = process.env.PATH;
  const log = join(dir, "calls");
  writeFileSync(join(dir, "tmux"), `#!/bin/sh
printf '%s\\n' "$*" >> ${shellQuote(log)}
if [ "$1" = display-message ]; then printf '$7\\n'; fi
`, { mode: 0o755 });
  process.env.PATH = `${dir}:${previousPath ?? ""}`;
  try {
    launchPi({ layout: "window", cwd: "/tmp", args: [], pane: "%42" });
    launchPi({ layout: "pane", cwd: "/tmp", args: [], pane: "%42" });
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "display-message -p -t %42 #{session_id}",
      "new-window -t $7: -c /tmp exec pi",
      "split-window -h -t %42 -c /tmp exec pi",
    ]);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shellQuote round-trips shell metacharacters without expansion", () => {
  for (const value of ["", "hello", "it's quoted", "$(exit 9); $HOME `exit 8`\nnext", "a\\b"]) {
    const result = spawnSync("sh", ["-c", `printf '%s' ${shellQuote(value)}`], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, value);
  }
});

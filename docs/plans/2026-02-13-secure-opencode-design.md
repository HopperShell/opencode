# Secure OpenCode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lock down opencode so every tool invocation requires user approval and no tool can access paths outside the project directory.

**Architecture:** Surgical modifications to 7 existing files — permission evaluation, config loading, path enforcement, bash execution, and prompt descriptions. No new modules or abstractions.

**Tech Stack:** TypeScript, Bun, Zod, tree-sitter-bash

---

### Task 1: Clamp "allow" to "ask" in permission evaluation

**Files:**
- Modify: `packages/opencode/src/permission/next.ts:231-238`

**Step 1: Write the failing test**

Create a test that verifies `evaluate()` never returns `"allow"`, even when a ruleset contains an allow rule.

```ts
// packages/opencode/test/permission-secure.test.ts
import { describe, test, expect } from "bun:test"
import { PermissionNext } from "../src/permission/next"

describe("secure permission", () => {
  test("evaluate clamps allow to ask", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "bash", pattern: "*", action: "allow" },
    ]
    const result = PermissionNext.evaluate("bash", "git status", ruleset)
    expect(result.action).toBe("ask")
  })

  test("evaluate preserves deny", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "bash", pattern: "*", action: "deny" },
    ]
    const result = PermissionNext.evaluate("bash", "git status", ruleset)
    expect(result.action).toBe("deny")
  })

  test("evaluate preserves ask", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "bash", pattern: "*", action: "ask" },
    ]
    const result = PermissionNext.evaluate("bash", "git status", ruleset)
    expect(result.action).toBe("ask")
  })

  test("evaluate defaults to ask when no rule matches", () => {
    const result = PermissionNext.evaluate("bash", "git status")
    expect(result.action).toBe("ask")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test --timeout 30000 packages/opencode/test/permission-secure.test.ts`
Expected: FAIL — first test expects "ask" but gets "allow"

**Step 3: Implement the clamp**

In `packages/opencode/src/permission/next.ts`, modify the `evaluate()` function (line 231-238):

```ts
export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
  const merged = merge(...rulesets)
  log.info("evaluate", { permission, pattern, ruleset: merged })
  const match = merged.findLast(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  const result = match ?? { action: "ask", permission, pattern: "*" }
  // SECURE: never auto-approve — clamp "allow" to "ask"
  if (result.action === "allow") return { ...result, action: "ask" }
  return result
}
```

Also clamp the "always" reply handler (line 196-227). When a user replies "always", the system stores `action: "allow"` rules in `s.approved`. These get fed back into `evaluate()` on subsequent calls, but now `evaluate()` clamps them to "ask", so they have no effect. The user will still be asked every time. This is the intended behavior for the secure fork.

**Step 4: Run test to verify it passes**

Run: `bun test --timeout 30000 packages/opencode/test/permission-secure.test.ts`
Expected: PASS — all 4 tests green

**Step 5: Commit**

```bash
git add packages/opencode/test/permission-secure.test.ts packages/opencode/src/permission/next.ts
git commit -m "feat: clamp 'allow' permission to 'ask' in evaluate()"
```

---

### Task 2: Strip "allow" from config loading

**Files:**
- Modify: `packages/opencode/src/config/config.ts:586-652`

**Step 1: Write the failing test**

Add tests to the existing test file that verify config-level "allow" values get sanitized.

```ts
// packages/opencode/test/config-secure.test.ts
import { describe, test, expect } from "bun:test"
import { Config } from "../src/config/config"

describe("secure config", () => {
  test("PermissionAction rejects allow", () => {
    const result = Config.PermissionAction.safeParse("allow")
    expect(result.success).toBe(false)
  })

  test("PermissionAction accepts ask", () => {
    const result = Config.PermissionAction.safeParse("ask")
    expect(result.success).toBe(true)
  })

  test("PermissionAction accepts deny", () => {
    const result = Config.PermissionAction.safeParse("deny")
    expect(result.success).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test --timeout 30000 packages/opencode/test/config-secure.test.ts`
Expected: FAIL — "allow" currently parses successfully

**Step 3: Remove "allow" from the PermissionAction enum**

In `packages/opencode/src/config/config.ts`, change line 586:

```ts
// Before:
export const PermissionAction = z.enum(["ask", "allow", "deny"]).meta({
  ref: "PermissionActionConfig",
})

// After:
export const PermissionAction = z.enum(["ask", "deny"]).meta({
  ref: "PermissionActionConfig",
})
```

**Note:** This will cause any config file containing `"allow"` to fail validation. That's intentional — users get a clear Zod parse error telling them "allow" is not a valid value. The runtime clamp in Task 1 is the backstop for any edge case that bypasses config validation.

**Step 4: Run test to verify it passes**

Run: `bun test --timeout 30000 packages/opencode/test/config-secure.test.ts`
Expected: PASS

**Step 5: Run full test suite to check for breakage**

Run: `bun test --timeout 30000` from `packages/opencode/`
Expected: Check for any tests that rely on `"allow"` in permissions. Fix any that break by changing `"allow"` to `"ask"` in test fixtures.

**Step 6: Commit**

```bash
git add packages/opencode/test/config-secure.test.ts packages/opencode/src/config/config.ts
git commit -m "feat: remove 'allow' from PermissionAction config enum"
```

---

### Task 3: Hard-block external directory access

**Files:**
- Modify: `packages/opencode/src/tool/external-directory.ts`

**Step 1: Write the failing test**

```ts
// packages/opencode/test/external-directory-secure.test.ts
import { describe, test, expect } from "bun:test"
import { assertExternalDirectory } from "../src/tool/external-directory"

describe("secure external directory", () => {
  test("throws for path outside project", async () => {
    const ctx = {
      ask: async () => {},
    } as any
    await expect(
      assertExternalDirectory(ctx, "/etc/passwd"),
    ).rejects.toThrow("outside the project directory")
  })

  test("bypass flag is ignored", async () => {
    const ctx = {
      ask: async () => {},
      extra: { bypassCwdCheck: true },
    } as any
    await expect(
      assertExternalDirectory(ctx, "/etc/passwd", { bypass: true }),
    ).rejects.toThrow("outside the project directory")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test --timeout 30000 packages/opencode/test/external-directory-secure.test.ts`
Expected: FAIL — currently asks for permission instead of throwing

**Step 3: Replace assertExternalDirectory with hard block**

Replace the entire function in `packages/opencode/src/tool/external-directory.ts`:

```ts
import path from "path"
import type { Tool } from "./tool"
import { Instance } from "../project/instance"

export async function assertExternalDirectory(_ctx: Tool.Context, target?: string) {
  if (!target) return
  if (Instance.containsPath(target)) return
  throw new Error(
    `Access denied: ${path.resolve(target)} is outside the project directory (${Instance.directory}). All file operations are restricted to the project directory.`,
  )
}
```

Key changes:
- Removed `Options` type and `bypass` parameter entirely
- Removed the `ctx.ask()` call — no permission prompt, just a hard throw
- Simplified to two checks: null guard and containsPath

**Step 4: Fix callers that pass options**

In `packages/opencode/src/tool/read.ts` line 37-40, change:

```ts
// Before:
await assertExternalDirectory(ctx, filepath, {
  bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
  kind: stat?.isDirectory() ? "directory" : "file",
})

// After:
await assertExternalDirectory(ctx, filepath)
```

Search for any other callers of `assertExternalDirectory` that pass options and remove the options argument.

**Step 5: Run test to verify it passes**

Run: `bun test --timeout 30000 packages/opencode/test/external-directory-secure.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/opencode/src/tool/external-directory.ts packages/opencode/src/tool/read.ts packages/opencode/test/external-directory-secure.test.ts
git commit -m "feat: hard-block all external directory access"
```

---

### Task 4: Remove bypass flags from prompt.ts and task.ts

**Files:**
- Modify: `packages/opencode/src/session/prompt.ts:425,596,604,738,749,1144,1206`
- Modify: `packages/opencode/src/tool/task.ts:49`

**Step 1: Remove bypassAgentCheck from task.ts**

In `packages/opencode/src/tool/task.ts`, remove the conditional on line 49. The permission check should always run:

```ts
// Before (lines 48-59):
      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

// After:
      await ctx.ask({
        permission: "task",
        patterns: [params.subagent_type],
        always: ["*"],
        metadata: {
          description: params.description,
          subagent_type: params.subagent_type,
        },
      })
```

**Step 2: Remove bypassAgentCheck from prompt.ts**

In `packages/opencode/src/session/prompt.ts`:

- Line 425: Change `extra: { bypassAgentCheck: true }` to `extra: {}`
- Line 596: Remove the `bypassAgentCheck` variable
- Line 604: Remove `bypassAgentCheck` from the object passed to `resolveTools`
- Line 738: Remove `bypassAgentCheck: boolean` from the input type
- Line 749: Change `extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck }` to `extra: { model: input.model }`

**Step 3: Remove bypassCwdCheck from prompt.ts**

- Line 1144: Change `extra: { bypassCwdCheck: true, model }` to `extra: { model }`
- Line 1206: Change `extra: { bypassCwdCheck: true }` to `extra: {}`

**Step 4: Run full test suite**

Run: `bun test --timeout 30000` from `packages/opencode/`
Expected: PASS — bypass flags were internal shortcuts, removing them means those code paths now go through normal permission checks

**Step 5: Commit**

```bash
git add packages/opencode/src/tool/task.ts packages/opencode/src/session/prompt.ts
git commit -m "feat: remove bypassCwdCheck and bypassAgentCheck escape hatches"
```

---

### Task 5: Hard-block external paths in bash tool

**Files:**
- Modify: `packages/opencode/src/tool/bash.ts:88-155`

**Step 1: Implement hard block for bash external paths**

In `packages/opencode/src/tool/bash.ts`, replace the external directory permission check (lines 88-155) with a hard block:

```ts
      const directories = new Set<string>()
      if (!Instance.containsPath(cwd)) {
        throw new Error(
          `Access denied: working directory ${cwd} is outside the project directory (${Instance.directory}). All commands must run within the project directory.`,
        )
      }
      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue

        let commandText = node.parent?.type === "redirected_statement" ? node.parent.text : node.text

        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(cwd)
              .quiet()
              .nothrow()
              .text()
              .then((x) => x.trim())
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              if (!Instance.containsPath(normalized)) {
                throw new Error(
                  `Access denied: command references path ${normalized} which is outside the project directory (${Instance.directory}). All commands must operate within the project directory.`,
                )
              }
            }
          }
        }

        if (command.length && command[0] !== "cd") {
          patterns.add(commandText)
          always.add(BashArity.prefix(command).join(" ") + " *")
        }
      }

      // No more external_directory permission check — it's a hard block above
      // Keep the bash permission check — user must still approve every command
      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }
```

Key changes:
- `cwd` outside project → hard throw (no permission prompt)
- Resolved path outside project → hard throw (no permission prompt)
- Removed the `external_directory` permission ask for directories
- Kept the `bash` permission ask — user still approves every command

**Step 2: Run full test suite**

Run: `bun test --timeout 30000` from `packages/opencode/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/opencode/src/tool/bash.ts
git commit -m "feat: hard-block bash commands that reference external paths"
```

---

### Task 6: Update tool descriptions and system prompt

**Files:**
- Modify: `packages/opencode/src/tool/bash.txt`
- Modify: `packages/opencode/src/tool/read.txt`
- Modify: `packages/opencode/src/session/system.ts`

**Step 1: Add security notice to bash.txt**

Prepend to `packages/opencode/src/tool/bash.txt` (before the existing first line):

```
SECURITY: All commands are restricted to the project directory. Commands that reference paths outside the project directory will be blocked. Every command requires explicit user approval before execution. Do not attempt to access files, directories, or resources outside the project directory — these requests will fail.

```

**Step 2: Add security notice to system prompt**

In `packages/opencode/src/session/system.ts`, modify the `environment()` function to include security context:

```ts
export async function environment(model: Provider.Model) {
  const project = Instance.project
  return [
    [
      `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
      `Here is some useful information about the environment you are running in:`,
      `<env>`,
      `  Working directory: ${Instance.directory}`,
      `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
      `  Platform: ${process.platform}`,
      `  Today's date: ${new Date().toDateString()}`,
      `</env>`,
      `<security>`,
      `  IMPORTANT: This is a secure instance. The following restrictions are enforced at the code level and cannot be bypassed:`,
      `  - Every tool invocation requires explicit user approval. Nothing auto-executes.`,
      `  - All file operations and commands are restricted to the project directory: ${Instance.directory}`,
      `  - Any attempt to access paths outside the project directory will be blocked with an error.`,
      `  - Do not attempt to read, write, or reference files outside the project directory.`,
      `  - Do not use bash commands that reference external paths — they will fail.`,
      `</security>`,
      `<directories>`,
      `  ${
        project.vcs === "git" && false
          ? await Ripgrep.tree({
              cwd: Instance.directory,
              limit: 50,
            })
          : ""
      }`,
      `</directories>`,
    ].join("\n"),
  ]
}
```

**Step 3: Run full test suite**

Run: `bun test --timeout 30000` from `packages/opencode/`
Expected: PASS — prompt changes don't break tests

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/bash.txt packages/opencode/src/session/system.ts
git commit -m "feat: add security restrictions to tool descriptions and system prompt"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `bun test --timeout 30000` from `packages/opencode/`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `bun typecheck` from repo root
Expected: No type errors

**Step 3: Manual smoke test**

Run: `bun dev .` from repo root and verify:
- Every tool invocation prompts for approval (try asking it to read a file, run a command)
- Attempting to read a file outside the project dir returns a hard error
- Attempting to run `cat /etc/passwd` returns a hard error
- The system prompt includes the security notice

**Step 4: Commit any test fixes**

```bash
git add -A
git commit -m "test: fix tests for secure opencode enforcement"
```

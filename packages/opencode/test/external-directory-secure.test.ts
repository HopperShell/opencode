import { describe, test, expect } from "bun:test"
import { Instance } from "../src/project/instance"
import { assertExternalDirectory } from "../src/tool/external-directory"
import type { Tool } from "../src/tool/tool"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
}

describe("secure external directory", () => {
  test("throws for path outside project", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }
    await Instance.provide({
      directory: "/tmp/test-project",
      fn: async () => {
        await expect(
          assertExternalDirectory(ctx, "/etc/passwd"),
        ).rejects.toThrow("outside the project directory")
      },
    })
  })

  test("allows path inside project directory", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }
    await Instance.provide({
      directory: "/tmp/test-project",
      fn: async () => {
        // This should NOT throw — path is inside the project
        await assertExternalDirectory(ctx, "/tmp/test-project/package.json")
      },
    })
  })

  test("allows undefined target", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }
    await Instance.provide({
      directory: "/tmp/test-project",
      fn: async () => {
        await assertExternalDirectory(ctx, undefined)
      },
    })
  })
})

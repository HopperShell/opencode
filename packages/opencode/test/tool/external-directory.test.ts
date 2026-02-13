import { describe, expect, test } from "bun:test"
import path from "path"
import type { Tool } from "../../src/tool/tool"
import { Instance } from "../../src/project/instance"
import { assertExternalDirectory } from "../../src/tool/external-directory"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
}

describe("tool.assertExternalDirectory", () => {
  test("no-ops for empty target", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }

    await Instance.provide({
      directory: "/tmp",
      fn: async () => {
        await assertExternalDirectory(ctx)
      },
    })
  })

  test("no-ops for paths inside Instance.directory", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }

    await Instance.provide({
      directory: "/tmp/project",
      fn: async () => {
        await assertExternalDirectory(ctx, path.join("/tmp/project", "file.txt"))
      },
    })
  })

  test("throws for paths outside Instance.directory", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }

    const directory = "/tmp/project"
    const target = "/tmp/outside/file.txt"

    await Instance.provide({
      directory,
      fn: async () => {
        await expect(assertExternalDirectory(ctx, target)).rejects.toThrow("outside the project directory")
      },
    })
  })

  test("throws for directory paths outside Instance.directory", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }

    const directory = "/tmp/project"
    const target = "/tmp/outside"

    await Instance.provide({
      directory,
      fn: async () => {
        await expect(assertExternalDirectory(ctx, target)).rejects.toThrow("outside the project directory")
      },
    })
  })

  test("throws even for previously-bypassed external paths", async () => {
    const ctx: Tool.Context = {
      ...baseCtx,
      ask: async () => {},
    }

    await Instance.provide({
      directory: "/tmp/project",
      fn: async () => {
        await expect(assertExternalDirectory(ctx, "/tmp/outside/file.txt")).rejects.toThrow(
          "outside the project directory",
        )
      },
    })
  })
})

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

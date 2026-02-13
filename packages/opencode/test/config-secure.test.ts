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

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

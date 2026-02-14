# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](./AGENTS.md) for the style guide — follow it strictly.

## Key Facts

- **Monorepo** managed by Turborepo with Bun 1.3+ as package manager
- **Default branch**: `dev` (not `main`)
- **Language**: TypeScript throughout
- **Prettier**: no semicolons, 120 char print width (configured in root package.json)

## Commands

All commands run from the repo root unless noted.

```bash
bun install                          # install dependencies
bun dev                              # run TUI (targets packages/opencode)
bun dev <directory>                  # run TUI against a specific directory
bun dev .                            # run TUI against the repo root
bun dev serve                        # start headless API server (port 4096)
bun dev web                          # start web interface

bun typecheck                        # typecheck all packages (uses tsgo)
bun turbo test                       # run all tests via turborepo
```

From `packages/opencode/`:

```bash
bun test --timeout 30000             # run all tests
bun test --timeout 30000 test/foo.test.ts  # run a single test file
bun run typecheck                    # typecheck this package only (tsgo --noEmit)
bun run build                        # build binaries
./script/build.ts --single           # build standalone executable
```

Do NOT run `bun test` from the repo root — it will fail by design. Run tests from `packages/opencode/` or use `bun turbo test`.

## Monorepo Structure

- **`packages/opencode/`** — Core CLI, agent, and server. This is where most work happens.
- **`packages/app/`** — Shared web UI components (SolidJS)
- **`packages/desktop/`** — Native desktop app (Tauri, wraps `packages/app`)
- **`packages/plugin/`** — Source for `@opencode-ai/plugin`
- **`packages/sdk/js/`** — JavaScript SDK (regenerate with `./packages/sdk/js/script/build.ts`)
- **`packages/console/`** — Web console UI
- **`packages/ui/`** — UI component library
- **`packages/web/`** — Web server/interface

## Core Architecture (`packages/opencode/src/`)

Entry point: `src/index.ts` — Yargs CLI that registers all commands.

Key modules:

| Module | Purpose |
|--------|---------|
| `session/` | Session management, message history, compaction |
| `agent/` | Agent system, prompt engineering |
| `provider/` | Multi-provider LLM abstraction (Anthropic, OpenAI, Google, Bedrock, etc.) |
| `tool/` | 20+ built-in tools (bash, edit, read, grep, glob, etc.) |
| `skill/` | Skill discovery and execution |
| `lsp/` | Language Server Protocol client/server |
| `mcp/` | Model Context Protocol implementation |
| `cli/` | CLI commands and TUI (SolidJS + opentui) |
| `server/` | HTTP server (Hono) + WebSocket |
| `file/` | File I/O operations |
| `project/` | Project/workspace handling |
| `config/` | Configuration management |
| `storage/` | Local SQLite storage |
| `permission/` | Permission system |
| `auth/` | Authentication providers |
| `shell/`, `pty/` | Shell execution and PTY management |
| `bus/` | Event bus for inter-component communication |
| `plugin/` | Plugin loading |

Data flow: `CLI Commands → Session → Agent → Provider (LLM) → Tools → File/Project/Shell`

## Testing

- Test files live in `packages/opencode/test/` with `.test.ts` extension
- Uses Bun's native test runner
- Avoid mocks — test actual implementations
- E2E tests use Playwright

## PR Conventions

Titles follow conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

Optional scope: `feat(app):`, `fix(desktop):`, `chore(opencode):`

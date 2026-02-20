# grok-code v2.0 — Implementation Plan

## Vision
Open-source agentic coding CLI powered by xAI's Grok models. Built for OpenClaw users and anyone who wants a fast, cheap coding agent. Think "Claude Code but on Grok" — lightweight, fast, and cost-effective for implementation work.

## Current State (v1.0)
- 6 tools: read_file, write_file, edit_file, run_command, list_files, search_files
- Chat Completions API (`/v1/chat/completions`) with tool calls
- Single-shot non-streaming synchronous loop
- Works well for targeted coding tasks, but hits 256k context limit on large codebases
- No streaming feedback — blank terminal while working
- GitHub repo: https://github.com/philbert440/grok-code

## Implementation Plan

### Phase 1: Core Improvements (High Value)

#### 1.1 Streaming Output
**Why:** Currently you stare at a blank terminal. Need real-time feedback.
- Stream tool call names as they happen (already printing to stderr, but only after completion)
- Stream the final text response token-by-token
- Use OpenAI SDK `stream: true` with tool call delta handling
- Show a spinner/progress indicator between tool calls

#### 1.2 Context Management
**Why:** Hit 256k limit on large codebases. Need to be smarter about context.
- **Token counting:** Approximate token count tracking per message, warn when approaching limit
- **Automatic compaction:** When approaching limit, summarize older tool call results (keep recent ones full)
- **`--context-budget <tokens>`** flag to set a custom limit (default: 200k to leave headroom)
- **Truncated file reads:** For large files, only return first/last N lines with a note about truncation
- Show running token count in the status line

#### 1.3 File Pre-loading (`-f` / `--files`)
**Why:** Saves rounds and tokens by front-loading relevant files into context.
- `grok-code -p "fix the types" -f src/types.ts src/index.ts`
- Pre-read files and include them in the first user message
- Glob support: `-f "src/**/*.ts"` (with sensible limits)
- Auto-detect: if a directory has < 20 files, auto-include a file listing

#### 1.4 Responses API Integration
**Why:** xAI's Responses API has built-in server-side tools that expand capabilities.
- **web_search:** Let Grok search docs/Stack Overflow mid-task
- **code_execution:** Python sandbox for testing logic, running scripts
- `--web` flag to enable web_search tool
- `--exec` flag to enable code_execution tool
- These run server-side on xAI, no local overhead

### Phase 2: Developer Experience

#### 2.1 Diff Output
- Show unified diff of all changes at the end of a run
- Color-coded (green/red) in terminal
- Optional `--diff-only` to just show what would change without the summary

#### 2.2 Dry Run Mode
- `--dry-run` flag: show planned edits without writing them
- Print each edit as a diff, ask for confirmation
- Good for reviewing before committing to changes

#### 2.3 Resume / Continue
- Save conversation state to `.grok/session.json` after each run
- `--continue` flag to pick up where context ran out
- Auto-detect: if last run hit context limit, suggest `--continue`

#### 2.4 .grokignore
- Like .gitignore for list_files and search_files
- Auto-exclude: node_modules, .git, dist, build, .next, __pycache__
- Respect .gitignore by default, with .grokignore for additional patterns

#### 2.5 Better Edit Tool
- Support regex patterns in edit_file: `--regex` mode
- Multi-match replace (currently only replaces first occurrence)
- Line-number based editing as an alternative to text matching

### Phase 3: Advanced Features

#### 3.1 Multi-Model Support
- `--plan-model <model>` for high-level planning (e.g., grok-3)
- `--code-model <model>` for implementation (default: grok-code-fast-1)
- Two-phase: plan model creates a task list, code model executes each task
- Useful for complex refactors where planning benefits from a stronger model

#### 3.2 MCP Server Support
- Connect to remote MCP servers via xAI's Responses API
- `--mcp <server-url>` flag
- Enables custom tool integration (databases, APIs, etc.)

#### 3.3 Interactive Mode
- `grok-code -i` for a REPL-style coding session
- Send follow-up prompts without restarting
- Maintains conversation context across prompts
- `/clear` to reset, `/files` to list loaded files, `/diff` to show changes

### Phase 4: Documentation & Open Source

#### 4.1 README.md (Complete Rewrite)
- **What it is:** One-paragraph description with a demo GIF
- **Quick start:** npm install, set API key, first command
- **Model guide:** Which Grok models to use and when
  - `grok-code-fast-1` — default, best for implementation tasks
  - `grok-4-1-fast` — stronger reasoning, use for complex refactors
  - Cost comparison table
- **Usage examples:** Real-world examples with actual commands
  - "Implement a feature from a spec"
  - "Refactor a React component"
  - "Add tests to a module"
  - "Fix a bug from an error message"
  - "Apply a style guide across a codebase"
- **Flags reference:** All CLI flags with descriptions
- **Tips & tricks:** Context management, file pre-loading, chaining with other tools
- **Comparison:** vs Claude Code, vs Codex CLI, vs Cursor — when to use what

#### 4.2 OpenClaw Integration Guide
- **SKILL.md for OpenClaw:** How to use grok-code as an OpenClaw skill
- How to set up XAI_API_KEY in your environment
- Pattern: "Opus thinks, Grok builds" — use Opus for planning/specs, grok-code for implementation
- Example: spawning grok-code from OpenClaw via exec tool
- Rate limit management: grok-code uses xAI tokens (separate from Anthropic limits)
- Best practices for prompt engineering when calling grok-code from an agent

#### 4.3 API Key & Model Setup Docs
- How to get an xAI API key
- Available models and pricing
- Rate limits and how to stay within them
- Environment variable setup (XAI_API_KEY)

#### 4.4 Contributing Guide
- CONTRIBUTING.md with dev setup instructions
- Architecture overview (single file → modular structure)
- How to add a new tool
- How to add a new API integration
- Code style and testing expectations

#### 4.5 Modular Architecture Refactor
- Current: single 300-line index.ts
- Target structure:
  ```
  src/
    index.ts          — CLI entry point
    agent.ts          — Main agent loop
    tools/
      index.ts        — Tool registry
      files.ts        — read, write, edit, list
      search.ts       — search_files, grep
      commands.ts     — run_command
    api/
      chat.ts         — Chat Completions client
      responses.ts    — Responses API client
      streaming.ts    — Stream handling
    context/
      manager.ts      — Token counting, compaction
      session.ts      — Save/resume sessions
    config/
      ignore.ts       — .grokignore handling
      defaults.ts     — Default settings
    output/
      diff.ts         — Diff formatting
      spinner.ts      — Progress indicators
      colors.ts       — Terminal colors
  ```

### Phase 5: Polish & Release

#### 5.1 Package & Publish
- Clean up package.json (description, keywords, repository, license)
- MIT license
- npm publish as `grok-code`
- GitHub release with changelog

#### 5.2 CI/CD
- GitHub Actions: lint, typecheck, test on push
- Auto-publish to npm on tagged releases

#### 5.3 Testing
- Unit tests for tool implementations
- Integration test: run grok-code on a sample project, verify edits
- Snapshot tests for diff output

---

## Priority Order for Implementation

1. **Phase 4.5** — Modular architecture refactor (foundation for everything else)
2. **Phase 1.1** — Streaming output (biggest UX improvement)
3. **Phase 1.2** — Context management (fixes the 256k crash)
4. **Phase 1.3** — File pre-loading (saves tokens)
5. **Phase 2.4** — .grokignore (quick win)
6. **Phase 2.1** — Diff output (quick win)
7. **Phase 4.1** — README rewrite (needed for open source)
8. **Phase 4.2** — OpenClaw integration guide
9. **Phase 1.4** — Responses API integration
10. **Phase 2.3** — Resume/continue
11. **Phase 2.2** — Dry run mode
12. **Phase 3.3** — Interactive mode
13. **Phase 2.5** — Better edit tool
14. **Phase 3.1** — Multi-model support
15. **Phase 3.2** — MCP server support
16. **Phase 5** — Polish & publish

## Notes
- Keep it lightweight — single `npm install` should be all you need
- No config files required — everything via CLI flags and env vars
- Works with any OpenAI-compatible API, not just xAI (but optimized for Grok)
- Target: the coding agent you reach for when you want something fast and cheap

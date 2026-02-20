# grok-code OpenClaw Integration

## What is grok-code

grok-code is a lightweight agentic coding CLI powered by xAI Grok. It automates coding tasks like implementing features, refactoring code, adding tests, and fixing bugs using a tool-based agent loop.

## Setup

1. Install grok-code globally:
   ```bash
   npm install -g grok-code
   ```

2. Set your XAI API key:
   - Environment variable: `export XAI_API_KEY=your_key_here`
   - Or in OpenClaw auth-profiles if preferred.

## 'Opus Thinks, Grok Builds' Pattern

Use Claude (Opus) for high-level planning and architecture, then hand off implementation to grok-code for fast, cheap execution. This separates reasoning from coding work.

## Example: Calling grok-code from OpenClaw Exec Tool

```bash
# From OpenClaw, use exec to spawn grok-code
exec: grok-code -p "Implement the user registration API with validation and error handling" -f "specs/user-reg.md" -d backend/ --verbose
```

This runs grok-code with a detailed prompt, pre-loading spec files, in the backend directory, with verbose output for debugging.

## Example: Using as a Coding-Agent Skill

In OpenClaw, define grok-code as a skill:

```yaml
skills:
  grok-code:
    command: grok-code
    args:
      - -p
      - "{prompt}"
      - -d
      - "{directory}"
      - --verbose
```

Then invoke it: `grok-code -p "Refactor the data layer to use async/await" -d src/`

## Tips

- Use `--verbose` for debugging tool calls and outputs.
- Set `--context-budget` for large projects to manage token usage.
- Pre-load specs with `-f` to give grok-code full context upfront.

## Rate Limits

grok-code uses xAI tokens, separate from Anthropic's Claude quota. It won't burn your Claude limits, allowing parallel usage.

## When to Use grok-code vs Claude Code

- **grok-code**: Bulk implementation, repetitive tasks, quick fixes. Best for when you have a clear spec and want fast execution.
- **Claude Code**: Nuanced reasoning, complex planning, interactive sessions. Use for architecture or when human oversight is needed.
# grok-code

[![npm version](https://badge.fury.io/js/grok-code.svg)](https://www.npmjs.com/package/grok-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Lightweight agentic coding CLI powered by xAI Grok. Fast, cheap alternative to Claude Code/Codex CLI.

## Quick Start

```bash
npm install -g grok-code
export XAI_API_KEY=your_xai_api_key_here
grok-code -p "add a hello world function to index.js"
```

## Usage Examples

### Implement a Feature from Spec

```bash
grok-code -p "Implement user authentication with JWT tokens, including login/logout endpoints" -f "specs/auth.md" -d backend/
```

### Refactor a Component

```bash
grok-code -p "Refactor the UserProfile component to use hooks instead of class components" -f "src/components/UserProfile.js"
```

### Add Tests

```bash
grok-code -p "Add unit tests for the calculateTotal function using Jest" -f "src/utils.js" -f "tests/utils.test.js"
```

### Fix a Bug from Error

```bash
grok-code -p "Fix the TypeError: Cannot read property 'length' of undefined in the parseData function" -f "src/parser.js"
```

### Apply Style Guide

```bash
grok-code -p "Apply ESLint rules to all JavaScript files in src/, fixing any violations automatically"
```

### Bulk Rename

```bash
grok-code -p "Rename all instances of 'oldName' to 'newName' in TypeScript files, excluding node_modules"
```

## Model Guide

| Model | Description | Use Case |
|-------|-------------|----------|
| grok-code-fast-1 | Default, fast and cheap | Implementation tasks, quick edits |
| grok-4-1-fast | Stronger reasoning | Complex refactors, architecture decisions |

## CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --prompt <prompt>` | Task prompt (required) | - |
| `-d, --directory <dir>` | Working directory | Current directory |
| `-m, --model <model>` | Model to use | grok-code-fast-1 |
| `-k, --api-key <key>` | xAI API key | XAI_API_KEY env var |
| `--max-rounds <n>` | Max tool-call rounds | 100 |
| `--verbose` | Print full tool call details to stderr | false |
| `--context-budget <tokens>` | Context token budget | 200000 |
| `-f, --files <paths...>` | Pre-load files (supports globs) | - |
| `--no-diff` | Do not show diffs at the end | false |

## Tips

- **Context Management**: Use `--context-budget` to control token usage. The agent automatically compacts older messages when approaching the limit.
- **File Pre-loading**: Use `-f` to include relevant files in the initial prompt, reducing round trips.
- **.grokignore**: Create a `.grokignore` file to exclude directories like `node_modules` from listings and searches.
- **Piping Output**: Pipe output to other tools: `grok-code -p "..." | grep "error"`.

## Comparison

| Feature | grok-code | Claude Code | Codex CLI | Cursor |
|---------|-----------|-------------|-----------|--------|
| Speed | Fast | Medium | Medium | Medium |
| Cost | Low | High | High | High |
| Models | Grok | Claude | GPT | Claude/GPT |
| Offline | No | No | No | No |
| Open Source | Yes | No | No | No |

## How It Works

grok-code runs an agentic loop where the Grok model receives a prompt, then uses tools to read files, write/edit code, run shell commands, and search codebases. It streams output in real-time and provides a summary with diffs at the end.

## Contributing

Contributions welcome. Fork the repo, make changes, and submit a PR. See [GitHub](https://github.com/philbert440/grok-code) for issues.

## License

MIT

## GitHub

https://github.com/philbert440/grok-code
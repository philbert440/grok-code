# grok-code

Minimal agentic coding CLI powered by xAI's Grok.

## Install

```bash
npm install -g .
```

## Usage

```bash
# Set your API key
export XAI_API_KEY=your-key

# Run a coding task
grok-code -p "Add error handling to src/index.ts" -d ./my-project

# Use a different model
grok-code -p "Write tests" -m grok-4-1-fast-reasoning

# Verbose output
grok-code -p "Refactor the auth module" --verbose
```

## Tools

The agent has access to: `read_file`, `write_file`, `edit_file`, `run_command`, `list_files`, `search_files`.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --prompt` | Task prompt (required) | — |
| `-d, --directory` | Working directory | cwd |
| `-m, --model` | Model | `grok-code-fast-1` |
| `-k, --api-key` | API key | `$XAI_API_KEY` |
| `--max-rounds` | Max tool rounds | 100 |
| `--verbose` | Verbose tool output | false |

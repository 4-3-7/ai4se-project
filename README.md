# Seahorse - Coding Agent Harness

**Agent = LLM + Harness**

A TypeScript CLI tool that wraps LLMs with a governance framework, feedback loop, and audit trail.

## Features

### Governance (main dimension)
- 13 danger patterns auto-detection (rm -rf, DROP TABLE, curl|bash, fork bomb, etc.)
- Sandbox path boundaries
- HITL state machine: pause, approve, deny, or terminate
- JSONL audit log with API key sanitization

### Feedback Loop (secondary dimension)
- Test/lint result parsers (Vitest, Jest, Mocha, ESLint)
- 8-category failure classifier
- Markdown feedback report injection

### Engineering
- Dual providers: Anthropic Claude + OpenAI GPT (native fetch, no SDK)
- Mock LLM for 100% deterministic testing
- xterm.js Web UI with WebSocket
- Docker multi-stage build
- npm package ready

## Quick Start

```bash
npm install -g seahorse
export ANTHROPIC_API_KEY=sk-ant-...
seahorse run "fix the failing tests"
seahorse web
seahorse demo
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `seahorse run <task>` | Run the coding agent |
| `seahorse setup` | Configure API keys |
| `seahorse status` | Show status |
| `seahorse config` | Show configuration |
| `seahorse web` | Start Web UI terminal |
| `seahorse demo` | Run demonstrations |
| `seahorse clear` | Clear credentials |

## Architecture

```
src/
  core/           Agent loop, LLM providers, action parser, stop judge
  governance/     Guardrail, HITL, sandbox, audit log
  feedback/       Parsers, classifier, injector
  tools/          Registry, file tools, shell exec, test runner
  memory/         File store, retriever
  config/         YAML/JSON loader
  credentials/    AES-256-GCM encrypted storage
  cli/            Commander.js entry point
  web/            WebSocket server + xterm.js frontend
```

## Development

```bash
npm install
npm test          # 233 tests
npm run lint
npm run typecheck
npm run build
npm run demo      # Run 3 mechanism demos
```

## Docker

```bash
docker build -t seahorse .
docker run -it seahorse --help
```

## License

MIT
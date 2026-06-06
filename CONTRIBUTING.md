# Contributing to Cyberpunk RED - CORE

Entry point for contributors. Detailed guides live under `docs/` — this file routes you to the right one.

## Documentation map

| Document                                         | What it covers                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)     | Setup, build/watch, code style, task checklists, performance patterns, PR checklist       |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Module map, entity factory, data models, sheets, rolls, hooks, migrations, build pipeline |
| [docs/ACTIVE-EFFECTS.md](docs/ACTIVE-EFFECTS.md) | Effect keys, suppression, situational mods, V14 change types, troubleshooting             |
| [AGENTS.md](AGENTS.md)                           | Docker Foundry, cloud agent setup, CI commands                                            |

## Quick start

```bash
npm ci && npm run build && npm run lint
```

For Foundry runtime testing, see [docs/CONTRIBUTING.md — Running Foundry](docs/CONTRIBUTING.md#running-foundry) or [AGENTS.md](AGENTS.md) for the Docker stack.

## CI minimum bar

Every pull request must pass the steps in [AGENTS.md](AGENTS.md) (mirrored in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `npm ci`, version sync between `package.json` and `src/system.json`, `npm run lint`, and `npm run build`.

## Common tasks

| Task                           | Guide                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Add an actor or item type      | [docs/CONTRIBUTING.md — Common tasks](docs/CONTRIBUTING.md#common-tasks)                           |
| Add a Foundry hook             | [docs/CONTRIBUTING.md — Adding a Foundry hook](docs/CONTRIBUTING.md#adding-a-foundry-hook)         |
| Add a migration script         | [docs/CONTRIBUTING.md — Adding a migration script](docs/CONTRIBUTING.md#adding-a-migration-script) |
| Understand the codebase layout | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                       |
| Work with Active Effects       | [docs/ACTIVE-EFFECTS.md](docs/ACTIVE-EFFECTS.md)                                                   |

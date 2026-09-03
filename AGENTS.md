<!-- docs-authority:start -->

# Documentation Authority

Before following any project documentation, read these canonical files in order:

1. `docs/archive/SURFACE_AUDIT.md`
2. `docs/archive/RECONSTRUCTION_PLAN.md`
3. `docs/archive/ACCOUNT_SEPARATION_PLAN.md`

These three files are the active project documentation baseline. All other Markdown is subordinate.

Archived, deprecated, review-needed, historical, generated, or prompt-handoff Markdown files are not active instructions. Future agents must not follow archived or deprecated Markdown unless the user explicitly names that file as the task target.

If another Markdown file conflicts with the three canonical files, treat the other file as outdated unless current source code, tests, package/config files, or deployment files clearly prove the canonical file is wrong. Report the conflict before changing direction.

Active supporting references are limited to:

- `AGENTS.md`
- `README.md`
- `.claude/skills/gitnexus/*/SKILL.md`
- `docs/native-release.md`
- `docs/product-direction.md`
- `edgecase-cockpit-video-catalog/notes/video-catalog.md`
- `ios/App/CapApp-SPM/README.md`

<!-- docs-authority:end -->

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **edgecase-cockpit** (2657 symbols, 6504 relationships, 217 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                                          | Use for                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/edgecase-cockpit/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/edgecase-cockpit/clusters`       | All functional areas                     |
| `gitnexus://repo/edgecase-cockpit/processes`      | All execution flows                      |
| `gitnexus://repo/edgecase-cockpit/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->

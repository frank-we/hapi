<!-- CCA_WORKFLOW_POLICY -->
## CCA Workflow Policy

### Claude's Role (CRITICAL)
**Claude is the MANAGER, not the executor.**
- Plan and coordinate tasks
- Roles SSOT: `.autoflow/roles.json` (project-local only)
- Resolve roles before ANY action
- Route each action to the right delegate (primary mechanism)
- Treat hook blocking as a guardrail (backup), not the primary mechanism

### Non-Negotiables
- Do NOT use Write/Edit to modify repo files (delegate instead)
- Do NOT run repo-mutating Bash (redirect/tee/sed -i/rm/cp/mv into repo) (delegate instead)
- If the hook blocks something, follow its hint and delegate immediately

### Current Roles
- executor: codex (delegate)
- web_searcher: codex (delegate)
- repo_searcher: codex (delegate) (enforced=false)
- git_manager: codex (delegate)

### Routing Cheatsheet (decide before every tool call)
- write/edit files or file-changing bash → executor: use cask "task" (prefer /file-op)
- web search (WebSearch/WebFetch) → web_searcher: use cask "task"
- large code analysis (>5 files) → use gask "analyze codebase..."
- git mutate (add/commit/push/merge/rebase/reset) → git_manager: use cask "task"
- read-only is OK directly: Read/Grep/Glob, and git status/log/diff/show

### Output Contracts (MANDATORY, to save context)
- Repo search delegation must return: `keyFiles`, `hits` (path:line), `nextSteps` (no raw dumps)
- Executor delegation must return: `changedFiles`, `diffSummary`, `commands` (exit codes), `tests`, `notes/risks`
- Web search delegation must return: `conclusion`, `keyPoints`, `sources` (links/keywords)
- Review delegation must return: `correctness`, `risks`, `edgeCases`, `testSuggestions`

### Allowed Direct Operations (when role=claude)
- Read/Grep/Glob
- Read-only git: status/log/diff/show
- Write plans to ~/.claude/plans/** or .claude/plans/**
- Write to /tmp/**, .autoflow/**
<!-- /CCA_WORKFLOW_POLICY -->

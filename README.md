# VELYQ workspace

This repository is the Phase 1 VELYQ foundation. It contains no product behavior, no external-provider connection, and no credentials.

Use the pinned Node.js and pnpm runtimes, then install and run the available verification in one command:

```powershell
corepack pnpm bootstrap
```

`lint`, `typecheck`, `test`, and `build` are available now. `test:integration`, `test:e2e`, `db:reset`, and `mock:replay` deliberately return a nonzero result until their respective later milestones add real targets; they cannot silently pass.

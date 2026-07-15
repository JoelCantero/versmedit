---
description: "after_implement hook — run the pre-PR quality gate (lint, typecheck, tests) before opening the pull request."
---

You are running the mandatory `after_implement` hook for `/speckit.implement`.
Do exactly the following and nothing else:

1. From the repository root, run this terminal command:

   ```bash
   .specify/scripts/bash/quality-gate.sh
   ```

2. Check the exit code:
   - **Non-zero exit** (lint, typecheck, or a test failed): STOP. Report the
     failing output to the user verbatim and tell them the branch is **not**
     ready for a pull request until the gate passes. Do **not** open a PR.
   - **Zero exit**: the gate passed. Briefly tell the user the branch is green
     and ready to open a pull request, then return control.

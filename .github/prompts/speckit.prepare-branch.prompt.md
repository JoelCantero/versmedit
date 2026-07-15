---
description: "before_specify hook — create a fresh feature branch from an up-to-date origin/main, aborting on uncommitted changes."
---

You are running the mandatory `before_specify` hook for `/speckit.specify`.
Do exactly the following and nothing else:

1. Identify the feature description from the `/speckit.specify` command that
   triggered this hook. If the user supplied an explicit `GIT_BRANCH_NAME`,
   note that exact value.

2. From the repository root, run this terminal command (quote the description):

   ```bash
   .specify/scripts/bash/prepare-feature-branch.sh --json "<feature description>"
   ```

   - If an explicit branch name was provided, pass
     `--branch-name "<value>"` instead of relying on the description.

3. Check the exit code:
   - **Non-zero exit** (for example: uncommitted changes, or `origin/main`
     unavailable): STOP immediately. Report the script's error message to the
     user verbatim and do **not** continue with `/speckit.specify`.
   - **Zero exit**: parse the JSON on stdout and record `BRANCH_NAME` and
     `FEATURE_NUM`.

4. Instruct `/speckit.specify` to reuse the returned `BRANCH_NAME` as the spec
   directory name — set `SPECIFY_FEATURE_DIRECTORY=specs/<BRANCH_NAME>` — so the
   git branch and the `specs/` folder stay in sync.

5. Briefly tell the user which branch was created, then return control to
   `/speckit.specify`.

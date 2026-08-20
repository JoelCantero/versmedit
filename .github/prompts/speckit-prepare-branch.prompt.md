---
description: "before_specify hook - create a fresh date-named feature branch from an up-to-date origin/main, aborting on uncommitted changes."
---

You are running the mandatory `before_specify` hook for `/speckit-specify`.
Do exactly the following and nothing else:

1. Identify the feature description from the `/speckit-specify` command that
   triggered this hook. If the user supplied an explicit `GIT_BRANCH_NAME`,
   preserve that exact value.

2. Read `.specify/init-options.json` and determine `feature_numbering`:
   - For `date`, generate a concise English 2-4-word lowercase kebab-case short
     name from the feature description, then construct
     `GIT_BRANCH_NAME=<YYYYMMDD>-<english-short-name>` using the current date.
   - For `sequential` or an absent setting, let the branch script derive the
     name from the feature description.
   - An explicit user-provided `GIT_BRANCH_NAME` always takes precedence.

3. From the repository root, run this terminal command:

   ```bash
   .specify/scripts/bash/prepare-feature-branch.sh --json "<feature description>"
   ```

   When `GIT_BRANCH_NAME` was supplied or generated, pass
   `--branch-name "<value>"` instead of relying on the description.

4. Check the exit code:
   - **Non-zero exit** (for example: uncommitted changes, duplicate branch, or
     `origin/main` unavailable): STOP immediately. Report the script's error
     message to the user verbatim and do not continue with `/speckit-specify`.
   - **Zero exit**: parse the JSON on stdout and record `BRANCH_NAME` and
     `FEATURE_NUM`.

5. Instruct `/speckit-specify` to reuse the returned `BRANCH_NAME` as the spec
   directory name by setting
   `SPECIFY_FEATURE_DIRECTORY=specs/<BRANCH_NAME>`. This keeps the branch and
   specs directory aligned.

6. Briefly tell the user which branch was created, then return control to
   `/speckit-specify`.
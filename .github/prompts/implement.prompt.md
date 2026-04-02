---
description: "Implement a project item: branch, code, PR, and update the issue"
---

Implement a GitHub issue from the **Versmedit** project (repo: `versmedit`).

The user will provide an **issue number**. Follow all steps below in order.

---

## Step 0 — Identify the current user

Use `get_me` to fetch the authenticated GitHub user. Store the returned `login` as `<owner>` and use it for all subsequent API calls where `owner` is required.

## Step 1 — Read the issue

Use `issue_read` with method `get` to fetch issue `#<number>` from `<owner>/versmedit`.
Parse the **acceptance criteria** (checkboxes) and the **summary** so you know exactly what to build.

## Step 1.5 — Set project item to "In progress"

Find the project item for issue `#<number>` in **project #2** and set its **Status** field to **In progress**.

Use `projects_list` (method `list_project_items`, project_number `2`, fields `["271527944"]`) to list items, then match the item whose `content.number` equals `<number>`.

Once you have the `item_id`, use `projects_write` (method `update_project_item`) with:
- `project_number`: `2`
- `item_id`: the matched item ID
- `updated_field`: `{"id": 271527944, "value": "47fc9ee4"}`

This sets the status to "In progress" (`47fc9ee4`).

## Step 2 — Create a branch

Use `create_branch` to create a new branch from `main`:
- `owner`: `<owner>`
- `repo`: `versmedit`
- `branch`: use the pattern `feat/<number>-<short-slug>` (e.g. `feat/5-rename-memorize-app`)
  - For bugs use `fix/` instead of `feat/`.
  - For refactors use `refactor/`.

Then switch to that branch locally:

```sh
git fetch origin && git checkout <branch>
```

## Step 3 — Implement the changes

Follow the **acceptance criteria** from the issue one by one.
Apply the project's coding conventions (see the agent instructions).
After each meaningful sub-task:

1. **Comment on the issue** using `add_issue_comment` with a short progress update (e.g. "Created `VersePlayer.tsx` component with `mode` prop.").

Validate the implementation:
- Frontend changes → `npx tsc --noEmit` in `frontend/`
- Backend changes → `npx tsc --noEmit` in `backend/`, and `npx prisma generate` if schema changed
- Both → run both checks

## Step 4 — Push changes and create a Pull Request

Push the branch:

```sh
git add -A && git commit -m "<conventional commit message>" && git push origin <branch>
```

Use conventional commit format: `feat(scope): description`, `fix(scope): ...`, `refactor(scope): ...`.

Then use `create_pull_request`:
- `owner`: `<owner>`
- `repo`: `versmedit`
- `title`: same conventional commit message
- `body`: include a brief summary of the changes, a checklist of what was done, and `Closes #<number>` to auto-close the issue on merge
- `head`: the branch name from step 2
- `base`: `main`

## Step 5 — Update the issue

Use `add_issue_comment` to post a final summary comment on the issue:
- List what was implemented
- Link to the PR
- Mention any remaining risk or follow-up items

## Step 6 — Wait for user validation

**STOP HERE.** The PR is now created and open.

Provide a summary:
- PR title, number, and URL
- Verification result (TypeScript build, Prisma generate, etc.)
- List of changes implemented

**Wait for the user to confirm** that the PR is ready to close (either by merging, reviewing, or other validation).

## Step 7 — Set project item to "Done"

Once the user confirms, use `projects_write` (method `update_project_item`) with:
- `project_number`: `2`
- `item_id`: the same item ID from Step 1.5
- `updated_field`: `{"id": 271527944, "value": "98236657"}`

This sets the status to "Done" (`98236657`).

## Output

After all steps, confirm:
- Branch name
- PR title, number, and URL
- Number of comments added to the issue
- Verification result (TypeScript build, Prisma generate, etc.)

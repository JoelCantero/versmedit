---
description: "Create a new item in the Versmedit GitHub project board"
---

Create a new item in the **Versmedit** GitHub project (owner: `JoelCantero`, project number: `2`).

## Priority

The item must have a priority. Valid values are: **Critical**, **High**, or **Low**.

- If the user has not specified a priority, **infer one yourself** based on the nature of the request and briefly explain your reasoning before proceeding.
  - Use **Critical** for blockers, broken auth, data loss, or anything that prevents the product from working.
  - Use **High** for important features or bugs that should land in the next sprint.
  - Use **Low** for nice-to-haves, polish, and backlog improvements.

Priority → `option_id` mapping (do not change these):
| Priority | option_id  |
|----------|------------|
| Critical | `79628723` |
| High     | `0a877460` |
| Low      | `da944a9c` |

## Estimate

The item must have a story-point estimate. Valid values are: **1, 2, 3, 5, 8, 13** (Fibonacci scale).

- If the user has not specified an estimate, **infer one yourself** and briefly explain your reasoning before proceeding.
  - **1–2** — trivial change, a few lines or a config tweak.
  - **3** — small self-contained feature or bug fix, well understood.
  - **5** — medium feature with some complexity or multiple files.
  - **8** — large feature, significant backend + frontend work.
  - **13** — very large, likely needs splitting; use only if clearly justified.

## Labels

The item must have one or more labels applied at issue creation time.

Available labels in `JoelCantero/versmedit`:

**Type labels** — describe what kind of change it is:
| Label | When to use |
|-------|-------------|
| `enhancement` | New feature or improvement to existing functionality |
| `bug` | Something isn't working correctly |
| `refactor` | Code restructuring without functional changes |
| `documentation` | Improvements or additions to documentation |
| `good first issue` | Simple and well-scoped, good for newcomers |
| `help wanted` | Needs extra attention or outside input |
| `question` | Further information is requested |

**Feature/page labels** — describe which area of the product is affected. Apply at least one when the scope is clear:
| Label | When to use |
|-------|-------------|
| `Blog` | Related to the Blog page (posts, backend, UI) |
| `VersePlayer` | Related to the VersePlayer component (Memorize & Practice modes) |
| `My Account` | Related to the My Account page and user profile |
| `FAQ` | Related to the FAQ page |
| `About` | Related to the About Me page |

- If the user has not specified labels, **infer the appropriate ones** based on the nature of the request. Multiple labels can be combined (e.g. `enhancement` + `Blog`).
- If none of the existing labels fit, create a new one with `gh label create` before proceeding.

---

Follow these five steps in order:

1. **Create a GitHub issue** in the `JoelCantero/versmedit` repository using `issue_write` with method `create`. Write the title and body in **English**. The body should include a brief summary and acceptance criteria. Pass the inferred labels in the `labels` parameter (array of label name strings).

2. **Add the issue to the project** using `projects_write` with method `add_project_item` and these parameters:
   - `owner`: `JoelCantero`
   - `owner_type`: `user`
   - `project_number`: `2`
   - `item_type`: `issue`
   - `item_owner`: `JoelCantero`
   - `item_repo`: `versmedit`
   - `issue_number`: the number from step 1

3. **Get the numeric item ID** using `projects_list` with method `list_project_items` and these parameters:
   - `owner`: `JoelCantero`
   - `owner_type`: `user`
   - `project_number`: `2`

   Find the item whose `content.number` matches the issue number from step 1. Use its top-level numeric `id` field (e.g. `171798881`) — **not** the `node_id` string.

4. **Set the priority field** using `projects_write` with method `update_project_item` and these parameters:
   - `owner`: `JoelCantero`
   - `owner_type`: `user`
   - `project_number`: `2`
   - `item_id`: the numeric ID from step 3
   - `updated_field`: `{"id": 271528039, "value": "<option_id from priority table>"}` — e.g. `{"id": 271528039, "value": "0a877460"}` for High

5. **Set the estimate field** using `projects_write` with method `update_project_item` and these parameters:
   - `owner`: `JoelCantero`
   - `owner_type`: `user`
   - `project_number`: `2`
   - `item_id`: the numeric ID from step 3
   - `updated_field`: `{"id": 271528041, "value": <estimate number>}` — e.g. `{"id": 271528041, "value": 5}`

After all steps complete, confirm the issue title, URL, project item ID, the priority, and the estimate that were set.

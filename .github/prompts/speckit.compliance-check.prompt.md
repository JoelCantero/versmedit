---
description: "after_implement hook — verify SpecKit artifact completeness and constitutional compliance."
---

You are running the mandatory `after_implement` compliance hook.
Do exactly the following and nothing else:

1. From the repository root, run:

   ```bash
   .specify/scripts/bash/compliance-check.sh
   ```

2. If it exits non-zero, STOP and report the failed requirement. The branch is
   not ready for a pull request.
3. If it exits zero, briefly report that the governance artifacts comply and
   return control so the technical quality hook can run.
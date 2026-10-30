---
description: Fix one confirmed bug as one reviewed commit
argument-hint: <short bug name>
---
Fix `$ARGUMENTS` as exactly one commit.

1. `git switch -c fix/<name> submission`.
2. Make the smallest change that fixes the root cause. Money is integer fils; the day is Asia/Bahrain.
3. Add a test. Then prove it: `git stash`, restore only the test file from the stash,
   run it on the old code and show that it FAILS, then `git stash pop` and show it PASSES.
4. Run `npx tsc -p <package> --noEmit` for every package you touched.
5. Commit with a message that states the symptom, the root cause and the effect.
   No `Co-Authored-By`.
6. `git switch submission && git merge --ff-only fix/<name> && git branch -d fix/<name>`.
7. Add an entry to `BUGS.md`: Where, What, Why, Impact, Fix, Tests.
Do not push.

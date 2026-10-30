---
description: Reproduce a suspected bug against the real code before touching anything
argument-hint: <file, ticket or symptom>
---
Investigate `$ARGUMENTS` like a sceptical reviewer.

1. Read the code that actually runs. Ignore comments, changelog entries and ADR
   "implemented" notes until the code confirms them.
2. State the claim you are testing in one sentence ("capture ignores an expired hold").
3. Reproduce it: write the smallest failing test, a SQL query against a migrated
   database, or a Node snippet that shows the wrong output. Show the output.
4. If it does not reproduce, say so and stop. Do not "fix" it.
5. If it does, report: symptom, where, root cause, who is affected, severity.
Do not edit code in this command.

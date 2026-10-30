---
description: Scan the code for the money patterns that caused most of the bugs here
---
Run `bash tools/ai/money-smells.sh` and read every hit. For each one decide whether it
is a real problem (a float or two-decimal assumption on a money value, a UTC day
used for a Bahrain day, an INTEGER money column, Math.random for a secret) or a
harmless display or test use. Report real ones with file:line and the fix; do not
change anything until asked.

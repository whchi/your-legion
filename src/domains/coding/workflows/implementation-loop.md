# Implementation Loop

Use this workflow for code changes, tests, refactors, configuration changes, and documentation that is directly coupled to code behavior.

1. Define the intended behavior and the smallest useful success check.
2. Inspect the public surface, immediate callers, related helpers, and existing tests before editing.
3. Add or update the focused test that would fail without the intended behavior.
4. Implement the smallest conventional change that satisfies the test.
5. Run the focused check first, then the relevant broader suite.
6. Report what changed, what was verified, and anything intentionally left unverified.

Keep the loop local. Do not broaden the design unless the current boundary cannot express the requested behavior.

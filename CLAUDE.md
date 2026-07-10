# Task execution rules (auto-loaded — applies to every run in this repo)

These make automated runs land correctly. Follow them on every task.

## Verify before you commit
- Never commit code you have not built and tested. Run the build, and the relevant test/seal, and confirm it passes BEFORE any `git commit`.
- If you cannot run the build/test/verification (tooling missing, approval denied), STOP and report exactly what you could not run and why. Do NOT commit unverified changes.

## Confirm your edits actually landed
- When you edit files on a remote host (e.g. over SSH), read them back (cat/grep) to confirm the change persisted before moving on. An edit you cannot read back did not happen.

## Green-or-clean
- Leave the working tree either building-green or reverted. Never leave it parked broken with uncommitted changes.

## Read back every change
- After each edit, grep/cat the change to confirm it is exactly what you intended.

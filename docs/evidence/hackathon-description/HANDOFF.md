# Git and Draft PR handoff

The owner granted a one-time exception to perform task-scoped staging, commit, push and Draft PR creation. The commands below record the audited file scope and remain useful for reviewing the handoff; permanent repository rules are unchanged. The original `frontend` worktree's pre-existing `.kiro/` is unrelated and must not be staged.

## Audit before staging

Run these commands yourself. Confirm the branch and compare every modified/untracked path with the explicit file list below. If new unrelated changes have appeared since handoff, leave them out.

```powershell
Set-Location 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hackathon-description-guide'
git branch --show-current
git status --short --untracked-files=all
```

Expected branch: `feat/hackathon-description-guide`, based on `c0a7da5` (PR #111 included). The pre-commit audit found the task files listed below plus the excluded proposed `.github/workflows/hackathon-description.yml`. That workflow stays untracked and is not included in the commit or PR.

## Stage the exact approved files

These paths include the implementation, lockfile, fixtures, tests, plan and all 36 screenshots with review documentation. There are no directory globs or blanket staging commands.

```powershell
$taskFiles = @(
    'docs/evidence/hackathon-description/HANDOFF.md'
    'docs/evidence/hackathon-description/PR_DRAFT.md'
    'docs/evidence/hackathon-description/SCREENSHOTS.json'
    'docs/evidence/hackathon-description/VERIFICATION.md'
    'docs/evidence/hackathon-description/nasa-about-guest-dark-1440.png'
    'docs/evidence/hackathon-description/nasa-about-guest-dark-390.png'
    'docs/evidence/hackathon-description/nasa-about-guest-dark-768.png'
    'docs/evidence/hackathon-description/nasa-about-guest-light-1440.png'
    'docs/evidence/hackathon-description/nasa-about-guest-light-390.png'
    'docs/evidence/hackathon-description/nasa-about-guest-light-768.png'
    'docs/evidence/hackathon-description/nasa-about-member-dark-1440.png'
    'docs/evidence/hackathon-description/nasa-about-member-dark-390.png'
    'docs/evidence/hackathon-description/nasa-about-member-dark-768.png'
    'docs/evidence/hackathon-description/nasa-about-member-light-1440.png'
    'docs/evidence/hackathon-description/nasa-about-member-light-390.png'
    'docs/evidence/hackathon-description/nasa-about-member-light-768.png'
    'docs/evidence/hackathon-description/nasa-guest-dark-1440.png'
    'docs/evidence/hackathon-description/nasa-guest-dark-390.png'
    'docs/evidence/hackathon-description/nasa-guest-dark-768.png'
    'docs/evidence/hackathon-description/nasa-guest-light-1440.png'
    'docs/evidence/hackathon-description/nasa-guest-light-390.png'
    'docs/evidence/hackathon-description/nasa-guest-light-768.png'
    'docs/evidence/hackathon-description/nasa-member-dark-1440.png'
    'docs/evidence/hackathon-description/nasa-member-dark-390.png'
    'docs/evidence/hackathon-description/nasa-member-dark-768.png'
    'docs/evidence/hackathon-description/nasa-member-light-1440.png'
    'docs/evidence/hackathon-description/nasa-member-light-390.png'
    'docs/evidence/hackathon-description/nasa-member-light-768.png'
    'docs/evidence/hackathon-description/secondary-guest-dark-1440.png'
    'docs/evidence/hackathon-description/secondary-guest-dark-390.png'
    'docs/evidence/hackathon-description/secondary-guest-dark-768.png'
    'docs/evidence/hackathon-description/secondary-guest-light-1440.png'
    'docs/evidence/hackathon-description/secondary-guest-light-390.png'
    'docs/evidence/hackathon-description/secondary-guest-light-768.png'
    'docs/evidence/hackathon-description/secondary-member-dark-1440.png'
    'docs/evidence/hackathon-description/secondary-member-dark-390.png'
    'docs/evidence/hackathon-description/secondary-member-dark-768.png'
    'docs/evidence/hackathon-description/secondary-member-light-1440.png'
    'docs/evidence/hackathon-description/secondary-member-light-390.png'
    'docs/evidence/hackathon-description/secondary-member-light-768.png'
    'docs/plans/2026-11-04-hackathon-description-guide.md'
    'package-lock.json'
    'package.json'
    'qa/fixtures/description-browser.jsx'
    'qa/fixtures/descriptions/cases.cjs'
    'qa/fixtures/descriptions/nasa-raipur.json'
    'scripts/test-hackathon-description-browser.cjs'
    'scripts/test-hackathon-description.cjs'
    'src/components/StructuredHackathonDescription.tsx'
    'src/lib/hackathons/description.ts'
)
git add -- $taskFiles
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

Review the staged list before continuing. Then run:

```powershell
git commit -m "feat: present organizer descriptions as readable event guides"
git push -u origin feat/hackathon-description-guide
```

## Create the separate Draft PR

After your push, open [the branch comparison](https://github.com/yashshah1211/HackerMate_Backup/compare/main...feat/hackathon-description-guide?expand=1). Use title **Make hackathon organizer descriptions readable and safe**, paste the contents of [PR_DRAFT.md](PR_DRAFT.md), and choose **Create draft pull request** from the button menu. Do not merge or deploy.

If GitHub CLI is installed in your own shell, the equivalent command is:

```powershell
gh pr create --repo yashshah1211/HackerMate_Backup --draft --base main --head feat/hackathon-description-guide --title "Make hackathon organizer descriptions readable and safe" --body-file docs/evidence/hackathon-description/PR_DRAFT.md
```

GitHub CLI was not found in this session. The GitHub connector is used to create the authorized Draft PR after the scoped commit and push.

## Verification

[VERIFICATION.md](VERIFICATION.md) records checks, source provenance, screenshots, scope and limitations. Recommendation: **GO for Draft PR review**, subject to GitHub CI. Keep merge/deployment disabled for this task.

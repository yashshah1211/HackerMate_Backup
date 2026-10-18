# Round 2 invitation safety — disabled review candidate

Based on production main `d256811842ffd9abf2e418583c625fca90a41464`. This patch changes only the standalone private invitation/organizer page and focused tests. Registration stays production-disabled. No SQL, authorization, token generation/exchange endpoint, cookie contract, public participation guard, dependency, communications feature or PR #28 file changes.

## Fragment recovery

The invitation page reads and strips the initial fragment and subsequent `hashchange` fragments with `history.replaceState`. It validates token syntax and keeps the token only in the current page's memory until the existing deliberate same-origin POST exchange. Refresh/no-token/invalid-fragment states disable Continue; reopening the original link in the same tab restores it. A different fragment replaces the previous in-memory token. Clean Back/Forward entries and a restored bfcache page clear the ephemeral token rather than recovering it from browser storage. A token change during exchange prevents the older response from navigating to the wrong team; the new token waits until that exchange completes before Continue is enabled.

No token is put in the DOM, history state, local/session storage, query strings, logs or added persistence. The existing HttpOnly/SameSite exchange cookie and server-side validation remain unchanged. JavaScript must run for immediate fragment removal; this is not a guarantee about extensions, clipboard sync, email/chat providers or browser synchronization before script execution. Existing deployment logging/body/cookie redaction remains a separate release prerequisite.

## Recipient verification

Each admin Create button has escaped recipient markup rendered from the **same authorized organizer snapshot** as its row. After a successful creation, that exact row's Team ID, Team Name, Leader Name, Leader Email and WhatsApp (or “Not provided”) appear prominently above the private URL. No extra participant/roster API call is added. The input's accessible description includes the recipient details and sharing warning.

Only one invitation action can be unresolved at a time. Other row actions are disabled while issuance is pending or its link remains displayed; Close and refresh clears both the URL and recipient context. Failed issuance clears stale output and restores the actions. This display is an operator check, not proof of contact ownership or an authorization boundary; the existing server still authorizes and validates issuance.

## Two-person procedure — use only after separate launch/outreach approval

1. **Verifier** finds the official Team ID in the reviewed shortlist and verifies the team, designated leader and full email/approved international-format WhatsApp destination. Prepare exactly one approved individual composer. Confirm ownership/contact through the organizer's approved process; display names, a valid email syntax or a phone format alone do not prove identity.
2. **Admin issuer** selects that Team ID in the private organizer view and creates one link. Both people compare **all five displayed fields** with the reviewed shortlist and the composer's actual full destination. No autofill/display-name shortcut. Missing/incorrect contact means stop and escalate; do not invent a destination or edit the bearer.
3. Only after both agree, the authorized operator copies the complete fragment URL directly into that one verified private conversation/email. Never use a group, shared draft, CSV/spreadsheet, support ticket, log, screenshot, shortener, tracking rewrite or bearer-bearing `wa.me` URL. No automatic delivery is introduced. The chosen approved channel and recipient necessarily receive the capability.
4. Close/refresh the panel and clear the clipboard/composer as appropriate before the next team. If an issuance outcome or delivery is ambiguous, do not blindly retry; inspect current metadata and escalate. A lost link for a still-pending team requires the existing explicit authorized revoke/reissue process, with a fresh recipient check. No raw-link recovery is added.
5. The recipient checks the displayed team/leader before submitting. Opening or exchanging the link is not attendance confirmation. Monitor the existing confirmed/declined/pending counts separately from manual contact observations. Stop issuance and delivery before the exact October 23, 23:00 IST cutoff; external composers are not stopped by the server.

**A bearer link is not identity-bound: possession permits access.** Anyone holding or receiving a forwarded/misdelivered link may access that invitation and submit the first team response. A completed response **cannot currently be corrected through the supported interface**. Revoke/reissue does not reset a completed decision. Wrong-recipient access or a wrong completed response requires immediate organizer/admin incident escalation; this patch does not add a correction/reset control or bypass.

## Focused validation

- `node scripts/test-hustle-phase2.cjs`: existing authorization/CSRF/private-header/token contracts plus snapshot-only recipient escaping, missing WhatsApp and read-only-organizer checks.
- `PARTNER_TEST_PG_BIN=/path/to/pg/bin PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node scripts/test-hustle-phase2-browser.cjs`: actual Next routes, synthetic Auth/PostgREST adapter, disposable marked loopback PostgreSQL and Chromium. Covers initial navigation, refresh, same-tab original/different token, invalid syntax, unknown token rejection, Back/Forward/history, restored page, replacement during a held real exchange, exact recipient context, concurrent-row blocking, clearing, mobile layout, no token in URLs/console/storage and existing confirm/decline/cutoff/auth-refresh contracts.
- `node scripts/test-hustle-phase2-production.cjs`: default production build and existing eight hard-disabled HTTP/public-portal/workshop checks with synthetic loopback configuration only; zero Round 2 DB requests expected even with enable flags supplied. This builds locally; it does not deploy or activate registration.
- TypeScript and scoped ESLint for the changed page/test files.

The browser runner keeps generated capabilities and raw server logs in memory only, saves no traces/video or link-panel screenshots, and redacts failure diagnostics before writing artifacts. Its fixture creates no real account or message. Local PostgreSQL checks do not establish production database readiness; Desktop owns that separate audit.

Final local validation: **22 unit/security tests**, **110 actual Next/browser/API/PostgreSQL checks** at 390/1440px, **eight production-disabled HTTP/public-route checks**, the **default Next 16.3.8 production build**, **TypeScript** and **scoped ESLint** passed. The production run made **zero Round 2 DB requests** with enable flags deliberately supplied. Clean `npm ci` installed the unchanged lockfile. An initial production attempt could not build through an external node_modules symlink; a direct clean installation resolved that fixture setup limitation without any code/configuration/dependency change.

The branch and draft PR text are prepared locally but not published: this repository automatically creates Vercel Previews on publication, conflicting with the no-deployment instruction. There are no new hosted deployment side effects. The exact local commit SHA is reported in the handoff. No merge, production deployment, migration, provisioning, activation or messaging is performed by this patch.

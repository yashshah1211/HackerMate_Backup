# Presigned upload usage investigation

Date: 2026-11-05. Branch: `stabilize/full-codebase-20261105`, base `652d1ef`.

User decision: external clients are unknown; verify usage before changing the contract. This is not authorization to remove the endpoint or change its successful response shape.

## Verified repository evidence

- Current tracked source has no client request to `/api/upload/presign`. `createPresignedUploadUrl` is called only by the presign route. The successful JSON contract is `{ uploadUrl, publicUrl, key }`.
- Image and voice uploads currently POST multipart files to `/api/upload` in `src/components/chatThread.tsx` (current call sites at lines 1187 and 1244).
- [Commit 91732f7](https://github.com/yashshah1211/HackerMate_Backup/commit/91732f7) introduced the presign + direct PUT flow for image/voice uploads on 2026-08-18.
- [Commit c7a5e76](https://github.com/yashshah1211/HackerMate_Backup/commit/c7a5e761d7db0b63f22df245fcef75b112fc7124) replaced both callers with the server upload flow on 2026-08-18. Its patch explicitly describes preventing browser CORS issues. The endpoint and R2 signing helper remained.
- `git merge-base --is-ancestor c7a5e76 main` returns 0: the migration belongs to the main branch history. Searching all available local refs for additions/removals of the literal endpoint found the introduction and migration commits above.
- Current repository documentation references to the endpoint outside the implementation are historical build-failure paths, not API consumer instructions. Existing GA4 bridge tracks explicit client events/pageviews; the inspected bridge does not establish server API request counts.

These facts establish retirement of the known in-repository callers. They do not establish absence of external clients, old browser bundles, scripts or other deployments.

## Runtime evidence and access limit

- At the initial check, no connected Vercel or Cloudflare tool was available; neither CLI was on PATH.
- An existing local Vercel CLI login was found. A read-only GET to Vercel's projects API returned HTTP **403**, before any project/runtime-log access. No production endpoint was invoked.
- A follow-up read-only `/v2/user` authentication check also returned **403**, code `forbidden`. This establishes that the existing login is rejected even before team/project selection; it does not establish why access was rejected or that the token expired.
- The authentication token stayed in process memory and was not printed or copied into workspace files. Only the error status was emitted. The temporary inspection script lives under ignored `scratch/stabilization/` and reads credentials at execution time.
- A Vercel connection was requested and then installed/authorized by the user. The connected follow-up below supersedes the initial access blocker. The local CLI authentication failure is historical evidence, not a current connector blocker.

## Connected Vercel follow-up

- Confirmed team `team_pV8mlFqYXbGw5rSoqm39Ry0S`, project `prj_dXTET08w44oZnkTBXh72Nu9nqACT`, display name `hacker-mate-backup`. Production deployment metadata links `githubOrg=yashshah1211`, `githubRepo=HackerMate_Backup` and commit `652d1ef0a34ef6b6bfbab480677892a153100343`. This matches the stabilization base; the new fixes are not deployed.
- The latest ready production deployment is `dpl_Hp12FvQ1tXA6rpV1KYNco8uN9kgY`; project domains include `www.hackermate.in`, `hackermate.in` and Vercel aliases. Log queries used project scope, not only a single deployment alias.
- Connected runtime-event queries filtered to production and `requestPath:/api/upload/presign` returned no grouped rows for the fixed window **2026-11-05T07:26:58Z–08:16:58Z**. A source-grouped recent control returned one function event. The same fixed-window direct-upload event query returned no grouped rows. One earlier direct-upload query aborted; the fixed-window retry succeeded.
- These connector results count individual runtime/application events, not complete HTTP request records, and do not expose method/status coverage. They are not evidence of zero successful signing requests on their own.
- A seven-day runtime-log query was rejected with HTTP 400: **the Hobby plan does not retain runtime logs for that range**. The service reports one-hour Hobby retention. A legacy observability request-count query also returned 400; no request metric was obtained from it.
- Used the already authenticated Vercel dashboard to inspect **Request Logs** and **CDN Requests**, with **Last hour** selected. Both showed no matches for the exact presign path. The final CDN query additionally selected **environment:production** and visibly reported **No CDN Requests Match Your Filters**.
- At final inspection, the dashboard displayed **2026-11-05 12:52–13:52 IST** (07:22–08:22 UTC) for its relative last-hour window. The chart retained rounded bucket labels from the earlier query; this is dashboard minute-level evidence, not a millisecond-exact exported request archive.
- Positive control in CDN Requests: the exact root-path query returned **five visible HTTP records**, with GET 200/308 and POST 400 responses, then **No more logs to show within selected timeline**. This establishes that the HTTP request data source was populated; the presign query was not merely searching an entirely empty dataset. No raw user identifiers, IP addresses, headers, signed URLs or log messages were saved in committed evidence.
- [Dashboard query](https://vercel.com/yashshah1211s-projects/hacker-mate-backup/logs?datasource=cdn-requests&timeline=pastHour&search=requestPath%3A%2Fapi%2Fupload%2Fpresign%20environment%3Aproduction) uses a relative window: opening it later will query a different hour. The observations above record the inspection window.

**Result:** no production presign HTTP traffic was observed in the displayed retained window. This is a bounded negative observation, not proof that external clients do not exist. Infrequent clients, older browser bundles and activity outside retention remain unknown. No longer-term request archive was identified or queried.

## Read-only verification once access is available

1. Identify the Vercel project by its linked `yashshah1211/HackerMate_Backup` repository, then identify production deployments and aliases. Do not infer the project from a similar display name.
2. Inspect available request logs for the exact normalized pathname `/api/upload/presign`, including all HTTP statuses/methods. Record the actual query window, retention limit, pagination/completeness and production/preview scope.
3. Report aggregate invocation counts by method/status and deployment. Distinguish successful signing responses from rejected requests. A successful request demonstrates usage but does not by itself identify a legitimate external client.
4. Keep request bodies, tokens, signed URLs, IP addresses and personal identities out of committed evidence. If client attribution is necessary, summarize the classification rather than copying raw log records.
5. An empty retained window only supports "no matching requests observed in this complete window." It does not prove no external clients exist. Missing/expired/sampled/truncated logs remain unknown; inspect an existing longer-term archive only if available and authorized.
6. Use the evidence to propose the compatible STAB-006 remediation. Preserve the contract while consumer compatibility is unresolved.

[Vercel runtime-log documentation](https://vercel.com/docs/logs/runtime) describes filtering by request path/method/deployment and plan-dependent retention; [CLI documentation](https://vercel.com/docs/cli/logs) describes read-only log queries. Runtime-event and dashboard queries succeeded through the new connection; local CLI authentication remained rejected.

## Outcome

Known first-party callers migrated to direct uploads. No recent presign traffic was observed in available request records, but one hour of retention cannot establish that external consumers are absent. Keep STAB-006 open and preserve the successful contract until an existing longer-term archive or consumer inventory resolves compatibility. No application code, successful presign contract, storage policy, deployment or production records were changed during this follow-up.

## Compatibility-safe remediation boundary

STAB-006 remains open after the release review. Preserve POST, its successful uploadUrl/publicUrl/key fields and existing consumer behavior. Inventory longer-retained requests/custom consumers and inspect storage publication policy read-only before selecting a correction. Do not treat the new active-profile gate or unknown-signature rejection on the direct endpoint as presign byte/moderation enforcement.

Full parity needs bytes inspected before public publication, plus actual size/ownership enforcement and safe denied-object cleanup. A separately approved quarantine/finalization or controlled serving approach must preserve agreed consumer contracts or provide an explicit migration path; keeping response field names alone does not establish compatibility. Bucket/serving/integration changes and any new finalize protocol require separate design/authorization and regression coverage. No such infrastructure/API change was made in PR#116.

## Mission 03 boundary investigation

STAB-006 remains open with its public contract preserved. The [remediation plan](STAB_006_REMEDIATION_PLAN.md) records callers, direct/presigned byte checks, identity, publication, MIME/rendering, ownership, scope/replay, quotas and orphans. An offline execution of the real SDK used synthetic credentials only: exact PUT key, 900-second expiry, host signed header and unsigned payload, with checksum query metadata. No R2 request was made; checksum enforcement was not inferred. Publication must bind exact inspected bytes and prevent a reusable staging capability from replacing them. A HEAD/scan marker, private-named folder in a public bucket or copy of the latest mutable key is insufficient. Compatibility, private storage/serving, finalization/ownership/quota persistence and cleanup require founder authorization before implementation.

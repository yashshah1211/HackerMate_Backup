# Official shortlist contract and offline preflight

One row is **one officially selected team**, with **one designated leader and zero or one second member**. Expected launch volume is 50–75 teams, but the parser/database cap is 500. Only Club Ellusion can establish the official grouping, identity, leader and contact ownership. File validation cannot establish those facts.

## Files and exact mapping

Reuse the seven-column organizer master, with exactly three explicitly synthetic example teams, in `organizer-master.synthetic-template.csv`:

| Organizer master column | Importer target |
| --- | --- |
| Team ID | `team_id` |
| Team Name | `team_name` |
| Leader Name | `leader_name` |
| Leader Email | `leader_email` |
| Leader WhatsApp | `leader_whatsapp` |
| Second Member | `optional_second_member_name` |
| College | Keep in private master; no importer target |

Do not upload the seven-column master. Prepare a separately reviewed six-column projection with this exact canonical header:

```csv
team_id,team_name,leader_name,leader_email,leader_whatsapp,optional_second_member_name
```

`import.synthetic-template.csv` contains the matching three fake teams. `synthetic-75.import.csv` is the rehearsal's 75-team/112-person file. All sample emails use reserved `example.invalid`; phone destinations are blank. **Never import these samples into production.**

The importer technically supports **4–6 columns**: the first four targets are required; the last two may be omitted when the explicit mapping lists only the supplied headers. Arbitrary organizer header labels require an explicit JSON/UI mapping, not guessed aliases. Canonical six-column files can use `mapping.canonical.json`. Every supplied column must map exactly once; unsupported columns cannot be ignored.

`Sno, Name, Phone number, Gmail, College name` is insufficient: it does not establish official Team IDs/names, grouping or the leader. A serial number is not a Team ID without written organizer confirmation. Never group adjacent rows, choose the first person as leader, infer country codes, invent team names, or turn everyone into a solo team. Obtain an explicitly approved team-wise version first.

The tool cannot authenticate the semantics of a supplied mapping. A deliberately false map (such as treating a college as a team name) can satisfy field syntax. This limitation is explicitly tested; the report still requires human approval and grants no authority. Neither header mapping nor a model's output replaces the official grouping/leader record.

## Current application validation

These rules come from `src/lib/hustle-phase2/core.ts`; the preflight executes that parser rather than duplicating it.

| Area | Rule |
| --- | --- |
| File | UTF-8, comma-separated CSV, at most **512 KiB**; use CSV, not XLSX or UTF-16. BOM and CRLF are supported. Quoted commas and escaped quotes work; malformed/unclosed quotes fail. |
| Shape | Header plus 1–500 team records; at most six columns; every record has the same width. Truly empty records are skipped; whitespace-only records can fail. |
| Headers | Trimmed; unique, nonempty, at most 80 characters; case-sensitive labels. Map every header to one allowed target, with no target reused. |
| Raw cells | At most 400 JavaScript string units before field-specific checks. Values are trimmed and normalized to Unicode NFC. Control characters U+0000–001F/U+007F fail, including embedded newlines even in quoted cells. |
| Spreadsheet prefixes | Values beginning `=`, `+`, `@` or `-` fail, except that WhatsApp permits `+`. |
| `team_id` | Uppercased; 1–64 ASCII letters/digits/underscores/hyphens, starting with a letter/digit. Unique after normalization. |
| `team_name`, `leader_name` | Required; maximum 120 characters each. Team names and leader names are not globally unique identity keys. |
| `leader_email` | Required, trimmed/lowercased, maximum 254 characters; application's email-pattern checks must pass, including a dotted domain and no consecutive dots/leading dot. Unique after normalization. Syntax is not ownership verification. A non-Gmail address is acceptable. |
| `leader_whatsapp` | Optional; spaces, parentheses and hyphens are removed; supplied values must match `+` followed by 8–15 digits total, first digit nonzero. Nonblank normalized values must be unique. Do not add a country code by inference. |
| `optional_second_member_name` | Optional, maximum 120 characters; must differ from the leader's name ignoring case. This field holds one name, not several people or a second contact record. |

The live dry run additionally compares IDs, leader emails and nonblank phones against the authorized **existing shortlist**, and checks total capacity. Existing data is not overwritten. Database uniqueness/transaction constraints provide an additional backstop. Offline preflight has **no database** and cannot detect an earlier import or verify current access.

List-style separators in the second-member cell also trigger a human-review hold: a single field cannot silently stand for several people. Legitimate punctuation can occur in names; never automatically split or rewrite a name to clear a flag. Cross-team repeated member/leader names are not proof of duplicate people. The offline tool flags them as `HOLD_FOR_REVIEW`; Club Ellusion must distinguish real duplicates from namesakes. There is no stable second-member identity/contact field in the importer, so official membership verification remains a human gate even when there are no name collisions. A syntactically valid, incorrectly grouped file can pass the application parser: do not treat that as roster approval.

## Offline command

Run from the approved repository checkout with its existing npm dependencies. Keep the real file and reports in restricted private storage outside Git, shared chat groups and public artifacts.

```sh
node scripts/hustle-csv-preflight.cjs --csv "<private-six-column.csv>" --expected-teams <official-team-count> --out "<new-private-report.json>"
```

For explicit noncanonical labels, add `--mapping "<private-header-map.json>"`. For an intentionally four-column file, the map must contain exactly its four headers. Do not use the six-field default map for a four-column file.

Windows PowerShell: use the same command with quoted Windows paths. Check `$LASTEXITCODE` immediately. Exit **0** means syntax/count passed only; **2** means invalid file/arguments or report-write failure; **3** means count/grouping review hold. Resolve every hold through the organizer. A structural failure is never overridable. A count mismatch requires a reconciled approved total and a rerun. If the file legitimately retains a repeated/punctuated name, retain exit 3 and the flag in the evidence; Club Ellusion must explicitly resolve the exact flagged records/identities, with independent signoff bound to this file hash. Do not alter legitimate names to force exit 0 or treat an unresolved hold as a pass. An output report is created with exclusive-create semantics and restrictive mode where the OS supports it; it never overwrites an input/report. On Windows, separately apply the approved private-folder ACLs.

The report contains counts, row/field validation instructions, grouping flags, raw-file SHA256, parser-source SHA256 and the application preview digest. It contains **no normalized participant rows, email values, names, phone values, links or credentials**. `acceptedRow` in a grouping flag is an ordinal in the accepted-row list, not a physical CSV line number. The tool neither imports nor sends, reads no `.env`, instantiates no SDK and makes no network request. It requires the existing TypeScript development dependency; if dependencies are missing, restore the approved lockfile installation first.

The raw-file SHA256 and application preview digest are **different**. The latter binds the exact browser-decoded text and ordered mapping. The tool uses UTF-8 decoding matching `File.text()`'s initial-BOM removal. Do not change encoding, line endings, bytes, mapping or file version after approval. Compare the offline digest with the real dry run; mismatch means STOP and investigate, not override.

This report is **not** the signed 15-minute live dry-run receipt. The receipt is bound to the verified admin, digest and expiry. Any changed source/mapping, expired receipt or different admin requires another live dry run. No preflight result authorizes import, batch activation, release flags or delivery.

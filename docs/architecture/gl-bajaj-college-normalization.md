# GL Bajaj college normalization

Status: Phase A (application code and offline tests) implemented locally. Phase B (database) not approved or started.

## Canonical colleges

Two separate entries in `COLLEGES` (`src/lib/colleges.ts`). They are never merged.

- `GL Bajaj Group of Institutions, Mathura`
- `GL Bajaj Institute of Technology & Management, Greater Noida`

## Normalization rules (`normalizeCollege`)

The existing steps run first and are unchanged: exact case-insensitive match against `COLLEGES`, then `COLLEGE_EXACT_ALIASES`. Only if both miss, the input's match key is compared exactly against a reviewed list.

The match key lowercases, turns `&` into `and`, replaces other punctuation with spaces, collapses whitespace, and joins runs of single letters (`G.L.` and `G l` both become `gl`).

| Key | Canonical |
| --- | --- |
| `gl bajaj group of institutions mathura` | Mathura |
| `gl bajaj group of institution mathura` | Mathura |
| `gl bajaj mathura` | Mathura |
| `gl bajaj institute of technology and management greater noida` | Greater Noida |

There is no substring, prefix or fuzzy matching in normalization. Everything else is returned whitespace-collapsed, as before. That includes city-less names (`GL Bajaj`, `GL Bajaj Group of Institutions`, `GL Bajaj Institute of Technology and Management`), `GLBITM`, `GL Bajaj Greater Noida`, values naming both cities, and unrelated colleges.

## Dashboard compatibility (`collegeMatchValues`)

The dashboard's same-campus list is an exact match on `profiles.college`. Existing GL Bajaj profiles still hold legacy spellings until a backfill. Normalizing alone would therefore hide those peers.

- Colleges other than the two GL Bajaj entries return one value, and the query stays `.eq("college", value)` exactly as before.
- For GL Bajaj Mathura, the query uses `.in("college", …)` with the canonical name, the reviewed legacy spellings listed in `CAMPUS_REVIEWED_SPELLINGS`, and the user's own stored spelling.
- Greater Noida uses its canonical name and the user's own spelling only. No Greater Noida legacy spellings have been reviewed.

Coverage is incomplete. A stored spelling that is not on the reviewed list and is not the viewer's own spelling is not matched. Do not add unreviewed spellings to close the gap; the Phase B backfill is the fix.

## Phase B dependencies (separate approval required)

- **Profile backfill:** the ~19 existing GL Bajaj-like profiles keep their stored values. Only campus-explicit Mathura spellings are candidates. City-less values need user confirmation, not inference.
- **`matchmaking.college_alias`:** the recommendation RPC computes `same_college` in the database. Until the new canonical names and reviewed aliases are added there, recommendations will not treat canonical and legacy Mathura spellings as the same college.
- After both are done, `CAMPUS_REVIEWED_SPELLINGS` can be reduced or removed.

Until Phase B ships, the application change is not complete for same-campus matching.

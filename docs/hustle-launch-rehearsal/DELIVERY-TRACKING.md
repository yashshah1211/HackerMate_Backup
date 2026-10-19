# Manual delivery tracking — metadata only

Use `delivery-ledger.template.csv` in approved private storage. Its examples are explicitly synthetic, with no real recipients or messages. Keep the verified contacts in the separate approved master; reference a Team ID and source version here. Do not paste private links, token hashes, cookies, message bodies, screenshots, phone numbers or emails into the ledger. Do not use PR #28 or build a message service.

One operator owns each team's current delivery attempt; the independent verifier signs the recipient check. For recovery, append an attempt with a new revision number and preserve the incident reference instead of erasing history. Lock/reconcile the sheet so two operators cannot independently generate two competing attempts.

## Distinct states

| Field | Allowed meaning |
| --- | --- |
| `link_state` | `NOT_CREATED`, `GENERATED`, `REVOKED`, `REISSUED`. Dashboard `ready` is GENERATED only. Record generation time separately. |
| `contact_state` | `NOT_ATTEMPTED`, `COMPOSED`, `OPERATOR_REPORTED_SENT`, `FAILED`, `UNKNOWN`. Only the named manual sender can attest that Send was pressed. A composed draft is not sent. |
| `provider_evidence` | `NONE`, `ACCEPTED`, `DELIVERED`, `READ`, `RECIPIENT_ACK`, or `UNKNOWN`, with a checked-at IST time and a safe reference if available. Acceptance is not delivery. No evidence means no delivery claim. |
| `registration_response` | `PENDING`, `CONFIRMED`, `DECLINED`, copied only from a fresh authorized HackerMate snapshot. A message reply/read does not change this value. |
| `next_action` | A short non-sensitive instruction such as `VERIFY_DESTINATION`, `RECONCILE_UNKNOWN`, `FOLLOW_UP_PENDING`, `INCIDENT_HOLD`, `NONE`. Do not paste conversation content. |

The simulation uses `SIMULATED_*` contact/evidence values and `real_messages_sent=0`; these must never be counted as real delivery. Do not carry the synthetic example rows into the real tracker.

## Procedure for each attempt

1. Find the approved Team ID/master version and inspect the authorized snapshot. If a response is complete, stop routine issuance and check whether outreach is still appropriate. If link state is ready, do not press Create again.
2. Verifier compares the five recipient-panel fields with the master and actual full one-to-one composer address/number. Record verifier/operator identifiers and verification time; the founder creates and controls one displayed capability at a time.
3. Authorized sender copies directly into the verified composer and manually sends. Record the actual attempt time in IST and accurate contact/evidence states. Provider references are optional; store only a non-secret identifier, never a URL that could include a bearer. If uncertain, use UNKNOWN.
4. Close the panel, clear clipboard/composer and refresh the dashboard before the next team. Do not retain extra link copies, expose clipboard history or open the recipient's link for a test.
5. At each monitoring checkpoint, count teams with generated links, reported-sent attempts, evidenced delivery and recorded decisions independently. Reconcile every roster Team ID exactly once, counting the current active attempt, not all historical attempts. Explicitly list holds and unknown outcomes. No status in this sheet overrides the database.

For lost links or uncertain issuance, read back metadata first. Pending-team replacement requires explicit revoke/reissue, independent recipient re-verification and an incident/recovery decision. For UNKNOWN send outcomes, inspect authorized sent/provider records before deciding on a retry. No blind resend or untracked channel switch.

**Bearer possession permits access and can permit the first response; the link is not identity-bound. Completed responses cannot currently be corrected through the supported interface.** Misdelivery is an incident even if the sender deletes a message. Revocation cannot undo an already completed choice.

Club Ellusion and HackerMate must name the private storage/access owner, retention/deletion period and incident owner before real data is handled. The approved sender/provider and intended recipient necessarily receive the capability; avoid additional copies and validate provider/privacy settings through the separate release process.

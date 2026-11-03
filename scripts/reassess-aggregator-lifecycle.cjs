/* eslint-disable @typescript-eslint/no-require-imports -- Pure offline derivation from the preserved audit; no database, provider fetch or writer. */
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const reportPath='docs/qa/aggregator-repair/RECONCILIATION-PREVIEW.json';
const assessmentPath='docs/qa/aggregator-repair/LIFECYCLE-REASSESSMENT.json';
const adoptionPath='docs/qa/aggregator-repair/ADOPTION-REVIEW.json';
// Report text digest is checkout-independent; provider response hashes remain untouched.
const sha=b=>crypto.createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const day=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):null;
function reassess(report,reportHash){
 const priorActive=report.results.filter(r=>['registration_open','ongoing_registration_closed','ongoing'].includes(r.classification));
 const priorEnded=report.results.filter(r=>r.classification==='confirmed_ended_propose_suppression');
 const records=report.results.map(r=>{
  const m=r.evidence,isUnstop=m?.provider==='unstop';
  // This is a documented per-record audit hold, never application exclusion logic.
  const hold=isUnstop&&m.provider_id==='1768100'?'Published organizer mode Offline contradicts cached API region hybrid; fresh field review required.':null;
  const registrationCandidate=m?.check_status==='ok'&&m.category==='hackathon'&&m.facts.registration_status==='open'&&!hold;
  const classification=registrationCandidate?'historical_registration_open_candidate':!isUnstop&&r.classification==='confirmed_ended_propose_suppression'?'historical_supported_event_end':'requires_fresh_evidence';
  return {id:r.id,provider:r.provider||null,provider_id:m?.provider_id||null,canonical_url:m?.canonical_url||null,
   originalClassification:r.classification,originalEventStatus:m?.event_status||null,
   eventClassification:isUnstop?'unverified':m?.event_status||'unverified',classification,
   reason:hold||(isUnstop?'Competition window/publication status withdrawn as event schedule evidence. Registration evidence is historical only.':'Original provider-specific evidence retained, not freshly verified.'),
   sourceCheckedAt:m?.checked_at||null,sourceHash:m?.source_hash||null,
   proposedFieldsForReview:Object.keys(r.changes||{}).filter(k=>!isUnstop||!['start_date','end_date'].includes(k))};
 });
 const counts=records.reduce((a,r)=>(a[r.classification]=(a[r.classification]||0)+1,a),{});
 return {mode:'READ_ONLY_OFFLINE_REASSESSMENT_NOT_CURRENT_LIVE_COUNTS',sourceReport:reportPath,sourceReportSha256:reportHash,sourceReportHashEncoding:'UTF-8, CRLF normalized to LF; original provider response hashes unchanged',
  originalCounts:{active:priorActive.length,registrationOpen:priorActive.filter(r=>r.evidence?.facts.registration_status==='open').length,ongoing:priorActive.filter(r=>r.evidence?.event_status==='ongoing').length,ended:priorEnded.length,unresolved:report.results.filter(r=>r.classification==='unresolved').length},
  reproducedIndiaCalendarComparisons:{activeStartEqualsRegistrationStart:priorActive.filter(r=>day(r.evidence?.facts.start_date)===day(r.evidence?.facts.registration_start)).length,
   activeBothBoundariesEqual:priorActive.filter(r=>day(r.evidence?.facts.start_date)===day(r.evidence?.facts.registration_start)&&day(r.evidence?.facts.end_date)===day(r.evidence?.facts.registration_end)).length,
   unstopEndedEndEqualsRegistrationDeadline:priorEnded.filter(r=>r.provider==='unstop'&&day(r.evidence?.facts.end_date)===day(r.evidence?.facts.registration_end)).length},
  withdrawnClaims:{unstopOngoing:priorActive.filter(r=>r.provider==='unstop'&&r.evidence?.event_status==='ongoing').length,additionalUnresolvedUnstopOngoingObservations:report.results.filter(r=>r.provider==='unstop'&&r.classification==='unresolved'&&r.evidence?.event_status==='ongoing').length,unstopEnded:priorEnded.filter(r=>r.provider==='unstop').length},
  derivedHistoricalCounts:counts,currentVerifiedCounts:null,approvedForWrite:0,
  limitations:['Original report and observations are preserved unchanged; no raw payloads are reinterpreted as if newly checked.',
   'Historical open-registration candidates are a review queue, not currently open opportunities or approved adoption.',
   'Four non-Unstop historical ended records retain provider-specific support but still need fresh evidence before action.',
   'No Unstop event schedule can be verified from the saved competition-window projection; fresh public typed-stage evidence is required.',
   'Missing facts do not authorize clearing database values; protected source projection hides unsupported dates without a migration.'],records};
}
function adoption(assessment){
 return {mode:'REVIEW_ONLY_NOT_EXECUTABLE',sourceReport:reportPath,sourceReportSha256:assessment.sourceReportSha256,reassessment:assessmentPath,
  supersedes:'The previous 116-candidate shortlist relied partly on unsupported ongoing claims.',
  counts:{historicalCandidates:assessment.derivedHistoricalCounts.historical_registration_open_candidate,approvedForWrite:0,originalUnresolvedHeld:assessment.originalCounts.unresolved,originalEndedClaims:assessment.originalCounts.ended,originalActiveClaims:assessment.originalCounts.active},
  rules:['Fresh category, actual schedule uncertainty, registration, cancellation/completion and mode/team evidence must be reviewed before approval.',
   'No target count; no automatic adoption. Retain original UUIDs, editorial controls, registrations, teams, Saved and partner links.',
   'Unstop start_date/end_date proposals from the historical report are withdrawn, not approved for writing or clearing.',
   'All candidates require complete current in-memory expected fields and individual field ownership/approval; never replay the historical report.',
   'Apply requires separately authorized server context and evidence checked within five minutes. No database snapshot/export is created.'],
  candidates:assessment.records.filter(r=>r.classification==='historical_registration_open_candidate').map(r=>({id:r.id,provider:r.provider,provider_id:r.provider_id,canonical_url:r.canonical_url,
   reportClassification:r.originalClassification,reportCheckedAt:r.sourceCheckedAt,reportSourceHash:r.sourceHash,
   actualEventSchedule:r.provider==='unstop'?'UNVERIFIED_REQUIRES_FRESH_STAGE_EVIDENCE':'REQUIRES_FRESH_PROVIDER_EVIDENCE',
   proposedFieldsForReview:r.proposedFieldsForReview,approval:{status:'PENDING_FRESH_SOURCE_AND_FIELD_REVIEW',approvedFields:[],approver:null,approvedAt:null},controlsVerified:false,freshEvidenceVerified:false}))};
}
function main(){
 const raw=fs.readFileSync(reportPath),report=JSON.parse(raw),assessment=reassess(report,sha(raw));
 assert.equal(report.records,410);assert.equal(new Set(assessment.records.map(r=>r.id)).size,410);
 fs.writeFileSync(assessmentPath,JSON.stringify(assessment,null,2)+'\n');fs.writeFileSync(adoptionPath,JSON.stringify(adoption(assessment),null,2)+'\n');
  assert.equal(Buffer.compare(fs.readFileSync(reportPath),raw),0,'Never mutate historical evidence');
 console.log(JSON.stringify({original:assessment.originalCounts,withdrawn:assessment.withdrawnClaims,derivedHistoricalCounts:assessment.derivedHistoricalCounts,currentVerifiedCounts:null,approvedForWrite:0}));
}
if(require.main===module)main();
module.exports={reassess,adoption};

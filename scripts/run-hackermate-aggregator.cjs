/* eslint-disable @typescript-eslint/no-require-imports -- Privileged unattended Node.js operator, no browser bundle. */
"use strict";
const fs=require("node:fs");
const {randomUUID}=require("node:crypto");
const {createClient}=require("@supabase/supabase-js");
const {harness}=require("./ppt-vision-harness.cjs");
const policy=require("./aggregator-worker-policy.cjs");
const REPO="yashshah1211/HackerMate_Backup";
const PROJECT_REF="rhryjrbebfrrfhtyyzbs";
const PROJECT_URL="https://"+PROJECT_REF+".supabase.co";
const APPROVAL_POLICY="Founder-authorized standing metadata-only source adoption policy (2026-11-03)";
const MAX_SOURCE_MS=230000;
const MIN_BUDGET_MS=15000;

function assertEnvironment(mode,env=process.env) {
  if (!["--dry-run","--apply"].includes(mode)) throw new Error("Specify --dry-run or --apply");
  if (env.NEXT_PUBLIC_SUPABASE_URL!==PROJECT_URL) throw new Error("Project URL does not match reviewed existing Supabase project");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Aggregator service role secret is not configured");
  if (mode==="--apply" && (env.HACKERMATE_AGGREGATOR_ENABLED!=="true"
    || env.GITHUB_ACTIONS!=="true" || env.GITHUB_REPOSITORY!==REPO
    || env.GITHUB_REF!=="refs/heads/main"
    || !["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME))) {
    throw new Error("Production source writing is disabled outside the authorized main-branch GitHub workflow");
  }
}
function keyForRow(record,source) {
  const parsed=source.validateSourceObservation(record.source_metadata,record.website_url);
  const inferred=source.identifySource(record.website_url);
  if (record.source_metadata!=null && !parsed.identity) return null;
  const candidate=parsed.identity||inferred;
  return policy.sourceKey(candidate);
}
function identityForRow(record,source) {
  const base=source.identifySource(record.website_url);
  const validated=source.validateSourceObservation(record.source_metadata,record.website_url);
  if (!base || (record.source_metadata!=null && !validated.identity)) return null;
  if (validated.identity && (base.provider!==validated.identity.provider
    || base.canonical_url!==validated.identity.canonical_url)) return null;
  return {...base,provider_id:validated.identity?.provider_id||base.provider_id};
}
function admission(validated,observation,now,source,forNew=false) {
  if (!policy.eligibleObservation(validated,observation,now)) return false;
  if (!forNew) return true;
  const schedule=validated.schedule;
  const state=schedule ? source.windowState(schedule.start,schedule.end,now) : "unknown";
  return state!=="ended" && (observation.facts.registration_status==="open" || state==="ongoing");
}
function writeSummary(out) {
  const body=JSON.stringify(out);
  console.log("AGGREGATOR_RESULT "+body);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "### HackerMate unattended source refresh\n\n\`\`\`json\n"+JSON.stringify(out,null,2)+"\n\`\`\`\n");
}
async function main(mode=process.argv[2]) {
  assertEnvironment(mode);
  const dryRun=mode!=="--apply";
  // All imports use the repository's existing production source parser, identity rules and robots policy.
  const loader=harness({}, {fetch,Date,URLSearchParams});
  const {readCatalog,observe,sourcePatch}=loader.load("src/lib/hackathons/synchronize.ts");
  const {activeOpportunity,registrationState,eventState}=loader.load("src/lib/hackathons/lifecycle.ts");
  const {SourceTransport,discoverSources}=loader.load("src/lib/hackathons/sourceTransport.ts");
  const {identifySource}=loader.load("src/lib/hackathons/providers.ts");
  const {validateSourceObservation,sourceFresh}=loader.load("src/lib/hackathons/source.ts");
  const {windowState}=loader.load("src/lib/hackathons/sourceEvidence.ts");
  const {summarizeSourceCoverage}=loader.load("src/lib/hackathons/sourceCoverage.ts");
  const {persistApprovedSourceEvidence,evidenceSnapshot}=loader.load("src/lib/hackathons/sourceEvidenceWriter.ts");
  const source={identifySource,validateSourceObservation,windowState};
  const client=createClient(PROJECT_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{autoRefreshToken:false,persistSession:false},global:{headers:{"X-HackerMate-Worker":"source-refresh-v1"}}});
  const started=Date.now(),slot=Math.floor(started/policy.RUN_SLOT_MS),observations=[];
  const catalog=await readCatalog(client);
  const counts=policy.countIdentities(catalog,r=>identityForRow(r,source)),known=new Set(counts.keys());
  const result={mode:dryRun?"dry-run":"apply",dry_run_no_writes:dryRun,project_ref:PROJECT_REF,started_at:new Date(started).toISOString(),
    catalog_before:catalog.length,refreshed:0,adopted:0,created:0,
    refresh_held:0,legacy_held:0,discovery_held:0,checked:{refresh:0,legacy:0,new:0},
    providers_unavailable:[],remaining_refresh:0,phase_errors:[],accepted_closed_registration_ongoing:0,
    source_failures:{},discovery_failure_details:[],
    discovered_candidates:0,discovery_attempts_by_feed:{},discovery_admissions_by_feed:{}};
  const failure=(provider,error)=>{
    const reason=String(error?.message||'unknown_source_failure');
    const key=provider+':'+reason;result.source_failures[key]=(result.source_failures[key]||0)+1;
    console.error('Aggregator source held:',provider,error);
  };
  const approvedRow=r=>(r.status==="approved" && r.archived===false
    && ["external","official"].includes(String(r.type)));
  // Existing trusted records are refreshed first, even if their evidence has expired.
  const allRefresh=catalog.filter(approvedRow).filter(r=>r.source_metadata != null);
  const refresh=policy.refreshPlan(allRefresh);
  const refreshTransport=new SourceTransport(fetch,MAX_SOURCE_MS,1000);
  for(const row of refresh){
    if(refreshTransport.remaining()<MIN_BUDGET_MS)break;
    const identity=identityForRow(row,source),key=policy.sourceKey(identity);
    if(!identity || !key || counts.get(key)!==1){result.refresh_held++;continue;}
    const evidenceOnly=row.source_metadata.evidence_only===true;
    result.checked.refresh++;
    const attempt=randomUUID();
    let leased=false;
    try {
      let snapshot=null;
      if(!dryRun){
        const lease=await client.rpc(evidenceOnly?"store_hackathon_source_evidence":"begin_hackathon_source_check",
          evidenceOnly?{
            p_id:row.id,p_identity:identity,p_observation:null,
            p_expected:evidenceSnapshot(row),p_attempt:attempt,p_action:"lease",p_allow_initial:false,
          }:{p_id:row.id,p_attempt:attempt});
        if(lease.error){console.error("Refresh lease RPC failed:",lease.error);throw new Error("refresh lease RPC failed");}
        if(lease.data?.status!=="leased"){result.refresh_held++;continue;}
        snapshot=lease.data.snapshot;leased=true;
      }
      const observation=await observe(identity,refreshTransport);
      observations.push({source_metadata:observation,website_url:row.website_url});
      const validated=validateSourceObservation(observation,row.website_url);
      if(!admission(validated,observation,Date.now(),source))throw new Error("invalid refresh evidence");
      if(!dryRun){
        const apply=await client.rpc(evidenceOnly?"store_hackathon_source_evidence":"apply_hackathon_source_check",
          evidenceOnly?{
            p_id:row.id,p_identity:identity,p_observation:observation,p_expected:snapshot,
            p_attempt:attempt,p_action:"apply",p_allow_initial:false,
          }:{
            p_id:row.id,p_identity:identity,p_observation:observation,p_patch:sourcePatch(observation,row.website_url),
            p_expected:snapshot,p_attempt:attempt,p_failure:null,p_adopt_fields:null,
          });
        if(apply.error)console.error("Refresh apply RPC failed:",apply.error);
        if(apply.error || apply.data?.status!==(evidenceOnly?"evidence_refreshed":"refreshed"))
          throw new Error("refresh apply rejected");
      }
      result.refreshed++;
    }catch(error){
      failure(identity.provider,error);
      result.refresh_held++;
      if(leased && !dryRun){
        const failed=await client.rpc(evidenceOnly?"store_hackathon_source_evidence":"apply_hackathon_source_check",
          evidenceOnly?{
            p_id:row.id,p_identity:identity,p_observation:null,p_expected:null,
            p_attempt:attempt,p_action:"failure",p_allow_initial:false,
          }:{
            p_id:row.id,p_identity:identity,p_observation:null,p_patch:{},
            p_expected:null,p_attempt:attempt,p_failure:"source_check_unsuccessful",p_adopt_fields:null,
          });
        if(failed.error){console.error("Refresh failure receipt unavailable:",failed.error);result.phase_errors.push("refresh_failure_receipt_unavailable");}
      }
    }
  }
  result.remaining_refresh=Math.max(0,allRefresh.length-result.checked.refresh);
  // Legacy adoption never replaces source/editorial fields. A standing founder approval
  // authorizes this policy, NOT an unreviewed factual overwrite or identity exception.
  const legacyTransport=new SourceTransport(fetch,MAX_SOURCE_MS,1000);
  const legacy=policy.legacyPlan(catalog.filter(approvedRow),started,slot);
  for(const row of legacy){
    if(legacyTransport.remaining()<MIN_BUDGET_MS)break;
    const identity=identityForRow(row,source),key=policy.sourceKey(identity);
    if(!identity||!key||counts.get(key)!==1){result.legacy_held++;continue;}
    result.checked.legacy++;
    try{
      const observation=await observe(identity,legacyTransport);
      observations.push({source_metadata:observation,website_url:row.website_url});
      const validated=validateSourceObservation(observation,row.website_url);
      if(!admission(validated,observation,Date.now(),source))throw new Error("unverified legacy evidence");
      if(!dryRun){
        const approval={record_id:row.id,provider_id:observation.provider_id,
          source_hash:observation.source_hash,checked_at:observation.checked_at,
          approved_by:APPROVAL_POLICY,approved_at:new Date().toISOString()};
        const applied=await persistApprovedSourceEvidence(client,row,observation,approval);
        if(applied.status!=="evidence_refreshed")throw new Error("legacy policy writer held record");
      }
      result.adopted++;known.add(key);
    }catch(error){failure(identity.provider,error);result.legacy_held++}
  }
  // Discover from all supported providers. Source transport enforces origin allowlists,
  // robots rules, redirect denial, per-origin pacing, response caps and request timeouts.
  const discoveryTransport=new SourceTransport(fetch,MAX_SOURCE_MS,1000);
  const discovered=await discoverSources(discoveryTransport);
  result.providers_unavailable=discovered.failures;
  result.discovery_failure_details=discovered.failureDetails;
  result.discovered_candidates=discovered.identities.length;
  const newItems=policy.discoveryPlan(discovered.identities,known,slot);
  for(const identity of newItems){
    if(discoveryTransport.remaining()<MIN_BUDGET_MS)break;
    result.checked.new++;
    const feedKey=identity.provider+":"+(["open","upcoming","closed"].includes(identity.feed_bucket)?identity.feed_bucket:"unknown");
    result.discovery_attempts_by_feed[feedKey]=(result.discovery_attempts_by_feed[feedKey]||0)+1;
    const key=policy.sourceKey(identity);
    if(!key || known.has(key) || counts.has(key)){result.discovery_held++;continue;}
    try{
      const observation=await observe(identity,discoveryTransport);
      observations.push({source_metadata:observation,website_url:identity.canonical_url});
      const validated=validateSourceObservation(observation,identity);
      if(!admission(validated,observation,Date.now(),source,true))throw new Error("unverified new source");
      const patch=sourcePatch(observation,identity);
      if(!patch.website_url || patch.website_url!==identity.canonical_url
        || typeof patch.name!=="string" || !patch.name.trim())throw new Error("incomplete source patch");
      if(!dryRun){
        const applied=await client.rpc("apply_hackathon_source_check",{
          p_id:null,p_identity:identity,p_observation:observation,p_patch:patch,
          p_expected:null,p_attempt:randomUUID(),p_failure:null,p_adopt_fields:null});
        if(applied.error)console.error("New source writer failed:",applied.error);
        if(applied.error || applied.data?.status!=="created")throw new Error("new source writer held record");
        const id=applied.data.id;
        const {data:inserted,error}=await client.from("hackathons")
          .select("id,website_url,type,status,archived,source_metadata").eq("id",id).single();
        if(error)console.error("New source postcondition query failed:",error);
        if(error || !inserted || inserted.website_url!==identity.canonical_url ||
          inserted.type!=="external" || inserted.status!=="approved" || inserted.archived!==false ||
          inserted.source_metadata?.source_hash!==observation.source_hash)
          throw new Error("new source postcondition failed");
      }
      known.add(key);result.created++;
      result.discovery_admissions_by_feed[feedKey]=(result.discovery_admissions_by_feed[feedKey]||0)+1;
      if(observation.facts.registration_status==='closed' && validated.schedule
        && windowState(validated.schedule.start,validated.schedule.end,Date.now())==='ongoing')result.accepted_closed_registration_ongoing++;
    }catch(error){failure(identity.provider,error);result.discovery_held++}
  }
  const finalRows=dryRun?catalog:await readCatalog(client);
  const now=Date.now();
  result.observed_evidence=summarizeSourceCoverage(observations,now);
  result.catalog_evidence=summarizeSourceCoverage(finalRows.filter(approvedRow),now);
  result.catalog_after=finalRows.length;
  result.verified_metadata=finalRows.filter(r=>approvedRow(r)
    && sourceFresh(validateSourceObservation(r.source_metadata,r.website_url).metadata,now)).length;
  // Use the exact production lifecycle projections, not raw registration timestamps.
  result.registration_open=finalRows.filter(r=>approvedRow(r)
    && registrationState(r,now)==="open"
    && sourceFresh(validateSourceObservation(r.source_metadata,r.website_url).metadata,now,
      ["registration_start","registration_end","registration_status"])).length;
  result.active=finalRows.filter(r=>approvedRow(r)&&activeOpportunity(r,now)).length;
  result.ongoing=finalRows.filter(r=>approvedRow(r)&&eventState(r,now)==="ongoing").length;
  result.fresh_open=result.registration_open;
  result.finished_at=new Date(now).toISOString();
  writeSummary(result);
  if(result.providers_unavailable.length)console.warn("::warning::Provider discovery unavailable: "+result.providers_unavailable.join(","));
  if(allRefresh.length>=10 && result.refreshed===0)
    throw new Error("All previously verified source refreshes failed; source authority may expire");
  if(result.remaining_refresh>policy.REFRESH_LIMIT*2)
    throw new Error("Refresh backlog exceeds two additional scheduled runs");
  if(result.providers_unavailable.length===3)throw new Error("All three providers unavailable; unattended discovery requires intervention");
  if(result.phase_errors.length)throw new Error("Source failure receipts unavailable");
  return result;
}
if(require.main===module)main().catch(e=>{console.error("AGGREGATOR_FAILURE "+String(e?.message||e));process.exitCode=1});
module.exports={main,assertEnvironment,keyForRow,identityForRow,admission};

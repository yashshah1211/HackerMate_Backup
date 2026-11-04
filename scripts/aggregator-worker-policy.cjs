"use strict";
const PROVIDERS = ["unstop","devfolio","hack2skill"];
const REFRESH_LIMIT = 145;
const LEGACY_LIMIT = 24;
const DISCOVERY_LIMIT = 24;
const RUN_SLOT_MS = 8 * 60 * 60 * 1000;
function sourceKey(identity) {
  if (!identity || !PROVIDERS.includes(identity.provider) || !identity.canonical_url) return null;
  return identity.provider === "unstop"
    ? "unstop:" + identity.provider_id : identity.provider + ":" + identity.canonical_url.replace(/\/+$/, "");
}
function countIdentities(records, identify) {
  const counts=new Map();
  for (const record of records) {
    const id=identify(record);
    const key=sourceKey(id);
    if (key) counts.set(key,(counts.get(key)||0)+1);
  }
  return counts;
}
function rotate(records, slot, limit) {
  if (!records.length || limit <= 0) return [];
  const sorted=[...records].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const start=((slot*limit)%sorted.length+sorted.length)%sorted.length;
  return Array.from({length:Math.min(limit,sorted.length)},(_,i)=>sorted[(start+i)%sorted.length]);
}
/** Cache age orders rechecks; cached status never constitutes source authority. */
function refreshPlan(records, limit=REFRESH_LIMIT) {
  return records.filter(x=>x.source_metadata != null)
    .sort((a,b)=>Date.parse(a.source_metadata?.checked_at||0)-Date.parse(b.source_metadata?.checked_at||0)
      || String(a.id).localeCompare(String(b.id))).slice(0,limit);
}
/** Quotas prevent a large stale historical backlog from starving likely current records. */
function legacyPlan(records, now, slot, limit=LEGACY_LIMIT) {
  const unverified=records.filter(r=>r.source_metadata == null);
  const today=new Date(now).toISOString().slice(0,10);
  const likely=unverified.filter(r=>!r.end_date || String(r.end_date).slice(0,10)>=today);
  const historical=unverified.filter(r=>r.end_date && String(r.end_date).slice(0,10)<today);
  const priority=Math.min(limit,Math.max(1,Math.ceil(limit*0.8)));
  const first=rotate(likely,slot,priority);
  const second=rotate(historical,slot,limit-first.length);
  const selected=new Set([...first,...second].map(r=>r.id));
  const fill=rotate([...likely,...historical].filter(r=>!selected.has(r.id)),slot,limit-selected.size);
  return [...first,...second,...fill];
}
/** Feed buckets prioritize *what we inspect*, never what we assert or write. */
function feedBucket(candidate) {
  return ["open","upcoming","closed"].includes(candidate.feed_bucket) ? candidate.feed_bucket : "unknown";
}
function prioritizeCandidates(candidates,slot,quota) {
  const selected=[],seen=new Set();
  const take=(bucket,n)=>{
    if(n<=0)return;
    const pool=candidates.filter(x=>feedBucket(x)===bucket&&!seen.has(sourceKey(x)));
    for(const candidate of rotate(pool,slot,n)){
      const key=sourceKey(candidate);
      if(!key||seen.has(key))continue;
      seen.add(key);selected.push(candidate);
    }
  };
  // Always reserve at least one sample of closed registration (possibly
  // genuinely ongoing) and upcoming buckets when provider coverage allows it.
  const closed=quota>=3 && candidates.some(x=>feedBucket(x)==="closed")?1:0;
  const upcoming=quota>=4 && candidates.some(x=>feedBucket(x)==="upcoming")?1:0;
  take("open",quota-closed-upcoming);
  take("upcoming",upcoming);
  take("closed",closed);
  for(const bucket of ["open","upcoming","closed","unknown"])take(bucket,quota-selected.length);
  return selected;
}
function discoveryPlan(identities, existingKeys, slot, limit=DISCOVERY_LIMIT) {
  const perProvider=new Map(PROVIDERS.map(p=>[p,new Map()]));
  for(const candidate of identities) {
    const key=sourceKey(candidate);
    if(!key||existingKeys.has(key))continue;
    const found=perProvider.get(candidate.provider);
    if(!found)continue;
    const previous=found.get(key);
    if(!previous || ["open","upcoming","closed","unknown"].indexOf(feedBucket(candidate))
        < ["open","upcoming","closed","unknown"].indexOf(feedBucket(previous)))
      found.set(key,candidate);
  }
  // Only the default bounded worker run uses measured provider allocation:
  // more probing of currently productive Unstop/Devfolio details, while
  // retaining Hack2Skill and closed-registration discovery coverage.
  const defaultCaps={unstop:12,devfolio:9,hack2skill:3};
  const equal=Math.ceil(limit/PROVIDERS.length);
  const quotas=PROVIDERS.map(provider=>limit===DISCOVERY_LIMIT?defaultCaps[provider]:equal);
  const selected=[],seen=new Set();
  const add=(candidate)=>{
    const key=sourceKey(candidate);
    if(!key||seen.has(key)||selected.length>=limit)return;
    seen.add(key);selected.push(candidate);
  };
  PROVIDERS.forEach((provider,i)=>{
    const choices=[...perProvider.get(provider).values()];
    prioritizeCandidates(choices,slot,quotas[i]).forEach(add);
  });
  // Empty provider feeds should not waste the remaining allowed detail checks.
  // Redistribute only existing candidates; never synthesize new identities.
  if(selected.length<limit)for(const provider of PROVIDERS){
    const choices=[...perProvider.get(provider).values()].filter(x=>!seen.has(sourceKey(x)));
    prioritizeCandidates(choices,slot,limit-selected.length).forEach(add);
    if(selected.length>=limit)break;
  }
  return selected;
}
function eligibleObservation(validated, observation, now) {
  const meta=validated?.metadata;
  return Boolean(meta && validated.errors.length===0 && meta.check_status==="ok"
    && meta.category==="hackathon" && meta.issues.length===0
    && Number.isFinite(Date.parse(meta.checked_at))
    && Date.parse(meta.checked_at)<=now+60000
    && now-Date.parse(meta.checked_at)<=300000
    && Date.parse(meta.expires_at)>now);
}
module.exports={REFRESH_LIMIT,LEGACY_LIMIT,DISCOVERY_LIMIT,RUN_SLOT_MS,sourceKey,countIdentities,
  rotate,refreshPlan,legacyPlan,discoveryPlan,eligibleObservation};

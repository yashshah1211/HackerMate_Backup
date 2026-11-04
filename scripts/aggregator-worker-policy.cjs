"use strict";
const PROVIDERS = ["unstop","devfolio","hack2skill"];
const REFRESH_LIMIT = 145;
const LEGACY_LIMIT = 24;
const DISCOVERY_LIMIT = 18;
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
function discoveryPlan(identities, existingKeys, slot, limit=DISCOVERY_LIMIT) {
  const reserved=Math.ceil(limit/PROVIDERS.length);
  const queues=PROVIDERS.map(provider=>{
    const candidates=identities.filter(i=>i.provider===provider && !existingKeys.has(sourceKey(i)));
    const unique=[...new Map(candidates.map(i=>[sourceKey(i),i])).values()]
      .map(i=>({...i,id:sourceKey(i)}))
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    if (!unique.length) return [];
    // Rotate by the reserved quota, even when this provider can fill more slots.
    const start=((slot*reserved)%unique.length+unique.length)%unique.length;
    return [...unique.slice(start),...unique.slice(0,start)];
  });
  const result=[],seen=new Set();
  const add=queue=>{
    const next=queue.shift(),key=sourceKey(next);
    if(next && key && !seen.has(key)){seen.add(key);result.push(next);}
  };
  // First reserve a fair share for each provider with actual candidates.
  for(let round=0;round<reserved && result.length<limit;round++)
    for(const queue of queues) if(result.length<limit)add(queue);
  // Unused shares are work-conserving, not wasted: fill from any remaining provider.
  for(let i=0;result.length<limit && queues.some(q=>q.length);i++)
    add(queues[i%queues.length]);
  return result;
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

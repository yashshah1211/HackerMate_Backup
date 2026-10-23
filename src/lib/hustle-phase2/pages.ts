import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { API, BASE, escapeHtml as h, FIELDS } from "./core";
import { authorize, enabled, inactiveImportEnabled, HttpError, participantView, PARTICIPANT_LOGIN, PARTICIPANT_ONBOARDING, secure, snapshot, type Snapshot, withAuthCookies } from "./server";
import type { AuthCookieUpdate } from "@/lib/admin/requireAdmin";

const style = `
:root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;color:#f4f0e6;background:#11110f;font-size:16px}
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:24px 32px 72px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 0 28px;border-bottom:1px solid #383329}a{color:#e8c580;text-underline-offset:4px}header strong{font-size:20px}h1{font-size:clamp(32px,5vw,58px);letter-spacing:-.045em;line-height:1.08;margin:42px 0 18px}h2{font-size:24px;letter-spacing:-.025em;margin:0 0 18px}p{line-height:1.65;max-width:70ch}.muted,small{color:#b5afa1}.schedule{border-left:3px solid #e8c580;padding-left:18px;margin:24px 0 36px}.panel{padding:26px;border:1px solid #565041;background:#191915;border-radius:6px;margin:24px 0}.narrow{max-width:680px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 0}button,.button{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:11px 18px;border-radius:5px;border:1px solid #e8c580;background:#e8c580;color:#1c180f;font-weight:600;cursor:pointer;text-decoration:none}.secondary{background:transparent;color:#f4f0e6;border-color:#82755b}button:disabled{opacity:.45;cursor:not-allowed}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e8c580;outline-offset:4px}label{display:block;margin:16px 0 8px}input,select{font:inherit;min-height:46px;max-width:100%;padding:10px 12px;background:#11110f;color:#f4f0e6;border:1px solid #82755b;border-radius:4px}input[type=search],input[type=file],input[type=url]{width:100%}input[type=checkbox]{min-height:auto;width:20px;height:20px;vertical-align:middle;margin-right:10px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#565041;border:1px solid #565041;margin:32px 0}.metrics div{background:#191915;padding:22px}.metrics strong{display:block;font-size:36px;color:#e8c580;margin-bottom:10px}.scroll{overflow-x:auto;max-width:100%}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}th,td{padding:16px 12px;border-bottom:1px solid #383329;vertical-align:top}th{color:#b5afa1;font-weight:normal}td small{display:block;margin-top:7px}td button{font-size:13px;margin:4px 0}.status{display:inline-block;padding:5px 9px;border:1px solid #82755b;border-radius:4px}.mapping{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mapping label{overflow-wrap:anywhere}.mapping select{display:block;width:100%;margin-top:8px}code{overflow-wrap:anywhere;font-size:13px}.notice{color:#e8c580;white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#ffb3a7}.team{font-size:26px}footer{border-top:1px solid #383329;margin-top:48px;padding-top:24px;color:#b5afa1;font-size:13px}ul{line-height:1.7;padding-left:22px}[hidden]{display:none!important}
.recipient{overflow-wrap:anywhere}.recipient dt{color:#b5afa1;margin-top:14px}.recipient dd{margin:4px 0 0;font-weight:600}
@media(max-width:600px){main{padding:16px 18px 48px}header{align-items:flex-start;font-size:13px}header strong{font-size:17px}h1{margin-top:32px}.panel{padding:20px}.metrics{grid-template-columns:1fr 1fr}.metrics div{padding:18px}.mapping{grid-template-columns:1fr}.actions button{flex:1}.schedule{font-size:14px}th,td{padding:12px 8px}}
`;
function shell(title: string, content: string, script = "", status = 200) {
  const nonce = randomBytes(18).toString("base64");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>${h(title)} | HackerMate</title><style nonce="${nonce}">${style}</style></head><body><main><header><strong>HackerMate × Hustle Carnival</strong><a href="/partners/hustle-carnival">Event information</a></header>${content}<footer>Hustle Carnival 2026 · Round 2<br>One leader responds for the whole shortlisted team. Registration is free.</footer></main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
  return secure(new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } }));
}
const schedule = `<div class="schedule"><strong>23 October 2026 · 9:00 AM–11:00 PM IST</strong><p class="muted">The deadline is exactly 11:00 PM. Only teams on the activated official shortlist can respond.</p></div>`;
const clientCommon = `const api=${JSON.stringify(API)}; async function post(action,data){const r=await fetch(api+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'});let result;try{result=await r.json()}catch{throw Error('Unable to read the response. Refresh and try again.')}if(!r.ok)throw Error(result.error||'Request failed.');return result} const notice=document.getElementById('notice');function message(text,error=false){notice.textContent=text;notice.classList.toggle('error',error);notice.focus()}`;
function leaderScript() { return clientCommon + `document.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',async()=>{if(!document.getElementById('leader').checked){message('Please confirm that you are responding as the team leader.',true);return}if(!confirm(button.dataset.decision==='confirmed'?'Confirm attendance for your whole team? This response cannot be changed here.':'Decline Round 2 for your whole team? This response cannot be changed here.'))return;const buttons=document.querySelectorAll('[data-decision]');buttons.forEach(b=>b.disabled=true);try{await post('respond',{decision:button.dataset.decision});location.reload()}catch(error){message(error.message,true);buttons.forEach(b=>b.disabled=false)}}));`; }
function recipientDetails(t: Snapshot["teams"][number]) {
  return `<dl class="recipient"><dt>Team ID</dt><dd>${h(t.external_team_id)}</dd><dt>Team Name</dt><dd>${h(t.team_name)}</dd><dt>Leader Name</dt><dd>${h(t.leader_name)}</dd><dt>Leader Email</dt><dd>${h(t.leader_email)}</dd><dt>Leader WhatsApp</dt><dd>${h(t.leader_whatsapp || "Not provided")}</dd></dl>`;
}
function accountProgress(t: Snapshot["teams"][number]) {
  const members = t.members || []; const verified = members.filter(m => m.verified).length;
  const status = verified === 0 ? "Not started" : verified === members.length ? "Fully verified" : "Partially verified";
  return `<span class="status">${status}</span>${members.map(m => `<small>${h(m.role)}: ${h(m.name)} — ${h(m.email)} — ${m.verified ? "Verified" : "Verification pending"}</small>`).join("")}`;
}
function roster(data: Snapshot, admin: boolean) {
  return data.teams.map(t => `<tr data-search="${h([t.external_team_id,t.team_name,t.leader_name,t.leader_email,t.decision].join(" ").toLowerCase())}"><td><strong>${h(t.team_name)}</strong><small>${h(t.external_team_id)}</small></td><td>${h(t.leader_name)}<small>${h(t.leader_email)}</small>${t.leader_whatsapp ? `<small>${h(t.leader_whatsapp)}</small>` : ""}${t.second_member_name ? `<small>Member: ${h(t.second_member_name)}</small>` : ""}</td><td><span class="status">${h(t.decision)}</span>${t.decided_at ? `<small>${h(new Date(t.decided_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</small>` : ""}</td><td>${accountProgress(t)}</td><td>${h(t.invite_status.replaceAll("_", " "))}${admin && t.invite_status === "ready" && t.decision === "pending" ? `<br>${t.invite_status === "ready" ? `<button class="secondary" data-action="revoke" data-team="${h(t.id)}">Revoke link</button>` : `<button class="secondary" data-action="invite" data-team="${h(t.id)}">Create private link</button><template data-invite-recipient>${recipientDetails(t)}</template>`}` : ""}</td></tr>`).join("");
}
function organizer(data: Snapshot, admin: boolean, importOnly = false) {
  const manage = admin && !importOnly;
  const upload = `<section class="panel"><h2>Import the official shortlist</h2><p class="muted">Map the organizer’s column names explicitly. Each row explicitly identifies the leader and an optional second member by name and distinct official email. Leave both member fields blank for solo teams. No existing team will be overwritten.</p><label for="csv">CSV file (up to 512 KiB, 500 teams)</label><input type="file" id="csv" accept=".csv,text/csv"><div class="mapping" id="mapping"></div><div class="actions"><button id="preview" disabled>Validate dry run</button><button id="commit" disabled>Import reviewed shortlist</button></div><div id="preview-result" aria-live="polite"></div></section>`;
  const batches = data.batches.map(b => `<section class="panel"><h2>${b.row_count} shortlisted ${b.row_count === 1 ? "team" : "teams"}</h2><p>${b.activated_at ? "Activated" : "Imported, not activated"}</p><p class="muted">Source digest<br><code>${h(b.source_digest)}</code></p>${manage ? `<div class="actions"><button data-launch="${h(b.id)}">Activate and prepare approved batch</button><button data-dispatch="${h(b.id)}">Schedule approved leader invitations</button></div>` : ""}</section>`).join("");
  return shell("Round 2 organizer", `<h1>Round 2 shortlist</h1>${importOnly ? `<p class="notice">Import-only preparation. Imported batches remain inactive. Participant access, activation, invitation issuance and exports are disabled.</p>` : ""}<p class="muted">Private organizer view. Attendance counts include only imported shortlisted teams, separately from account onboarding and Unstop registrations. Launch requires an exact separately approved batch manifest. Provider acceptance does not confirm inbox delivery.</p><p>Second-member account onboarding entry (no invitation secret): <a href="${BASE}">${BASE}</a>. Only an authenticated account matching an activated official roster slot can verify.</p>${schedule}<div class="metrics">${Object.entries(data.counts).map(([label,count]) => `<div><strong>${count}</strong>${h(label === "shortlisted" ? "Shortlisted teams" : label[0].toUpperCase()+label.slice(1))}</div>`).join("")}</div><p id="notice" class="notice" role="status" tabindex="-1"></p><section id="created-link" class="panel" aria-labelledby="link-recipient-title" hidden><h2 id="link-recipient-title">Verify the recipient before sharing</h2><div id="link-recipient"></div><p id="link-sharing-notice">Shown once. Share only with this team’s recorded leader after outreach approval. No message has been sent. Check every destination with a second organizer before copying. The link alone grants no participant access. The designated leader must sign in and verify the exact official account identity.</p><label for="link-value">Invitation URL</label><input id="link-value" type="url" aria-describedby="link-recipient link-sharing-notice" readonly><button id="dismiss-link" class="secondary">Close and refresh</button></section>${admin ? upload : ""}${batches}${manage ? `<button id="delivery-status" class="secondary">Refresh aggregate delivery status</button><pre id="delivery-report" class="notice" aria-live="polite"></pre>` : ""}${!importOnly ? `<div class="actions"><a class="button secondary" href="${API}/export">Export shortlist CSV</a></div>` : ""}<label for="search">Search teams, leaders or response status</label><input type="search" id="search" placeholder="Search shortlist"><div class="scroll" tabindex="0" role="region" aria-label="Shortlisted teams"><table><thead><tr><th scope="col">Team</th><th scope="col">Leader and members</th><th scope="col">Attendance</th><th scope="col">HackerMate onboarding</th><th scope="col">Invitation</th></tr></thead><tbody>${roster(data,manage)}</tbody></table></div>${!data.teams.length ? "<p>No shortlist has been imported. Registration remains unavailable.</p>" : ""}`, organizerScript());
}
function organizerScript() { return clientCommon + `
document.getElementById('search').addEventListener('input',event=>document.querySelectorAll('tr[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(event.target.value.toLowerCase())));
document.getElementById('dismiss-link').addEventListener('click',()=>location.reload());
const invitationActions=[...document.querySelectorAll('[data-action]')],linkPanel=document.getElementById('created-link'),linkValue=document.getElementById('link-value'),linkRecipient=document.getElementById('link-recipient');let invitationBusy=false;
invitationActions.forEach(button=>button.addEventListener('click',async()=>{
  if(invitationBusy)return;
  const recipient=button.closest('tr').querySelector('template[data-invite-recipient]');
  if(button.dataset.action==='invite'&&!recipient){message('Refresh and verify the recipient before creating a link.',true);return}
  if(!confirm(button.dataset.action==='revoke'?'Revoke this invitation link?':'Create a private invitation link for this team? No message will be sent.'))return;
  invitationBusy=true;invitationActions.forEach(b=>b.disabled=true);linkValue.value='';linkRecipient.replaceChildren();linkPanel.hidden=true;
  try{const result=await post(button.dataset.action,{teamId:button.dataset.team});if(result.url){linkRecipient.replaceChildren(recipient.content.cloneNode(true));linkValue.value=result.url;linkPanel.hidden=false;linkPanel.scrollIntoView({block:'nearest'});linkValue.focus();message(result.notice)}else location.reload()}
  catch(error){message(error.message,true);invitationBusy=false;invitationActions.forEach(b=>b.disabled=false)}
}));
let launchBusy=false;
document.querySelectorAll('[data-launch],[data-dispatch]').forEach(button=>button.addEventListener('click',async()=>{
 if(launchBusy||!confirm(button.dataset.launch?'Activate and prepare only this exact independently approved batch? No attendance decision is made.':'Schedule one leader invitation per prepared team? Keep this page open until complete. STOP on any error; never retry an unknown outcome.'))return;
 launchBusy=true;document.querySelectorAll('[data-launch],[data-dispatch]').forEach(b=>b.disabled=true);
 try{if(button.dataset.launch){const result=await post('launch',{batchId:button.dataset.launch,confirm:'ACTIVATE AND PREPARE'});message(JSON.stringify(result))}
 else{let remaining=1;while(remaining){const result=await post('dispatch',{batchId:button.dataset.dispatch,confirm:'SCHEDULE LEADER INVITATIONS'});remaining=result.remaining;message('Prepared invitations remaining: '+remaining+'. Provider acceptance is not inbox delivery.')}message('Scheduling finished. Review provider acknowledgments and aggregate status before leaving.')}}
 catch(error){message('STOP: '+error.message+' No automatic retry. Review durable delivery state.',true)}
 finally{launchBusy=false;document.querySelectorAll('[data-launch],[data-dispatch]').forEach(b=>b.disabled=false)}
}));
const statusButton=document.getElementById('delivery-status');if(statusButton)statusButton.addEventListener('click',async()=>{try{const result=await post('delivery-status',{});document.getElementById('delivery-report').textContent=JSON.stringify(result.counts,null,2)}catch(error){message(error.message,true)}});
const file=document.getElementById('csv');if(file){let csv='',receipt=null;const fields=${JSON.stringify(FIELDS)}, labels=['Team identifier','Team name','Leader name','Leader email','Leader WhatsApp (optional)','Second member name (optional)','Second member email (optional)'];const preview=document.getElementById('preview'),commit=document.getElementById('commit'),mapping=document.getElementById('mapping'),result=document.getElementById('preview-result');function invalidate(){receipt=null;commit.disabled=true;result.textContent=''}function getMapping(){return Object.fromEntries([...mapping.querySelectorAll('select')].map(s=>[s.dataset.header,s.value]))}
file.addEventListener('change',async()=>{invalidate();preview.disabled=true;mapping.replaceChildren();csv='';const selected=file.files[0];if(!selected)return;if(selected.size>524288){message('CSV exceeds 512 KiB.',true);return}try{csv=await selected.text();const data=await post('columns',{csv});for(const header of data.headers){const label=document.createElement('label');label.textContent=header;const select=document.createElement('select');select.dataset.header=header;select.add(new Option('Choose a field',''));fields.forEach((field,i)=>select.add(new Option(labels[i],field)));select.value=fields.includes(header)?header:'';select.addEventListener('change',invalidate);label.append(select);mapping.append(label)}preview.disabled=false}catch(error){message(error.message,true)}});
preview.addEventListener('click',async()=>{invalidate();preview.disabled=true;try{const data=await post('import',{mode:'preview',csv,mapping:getMapping()});const p=document.createElement('p');p.textContent=data.total+' rows reviewed; '+data.issues.length+' validation issues. Source digest: '+data.digest;result.append(p);const list=document.createElement('ul');for(const issue of data.issues){const li=document.createElement('li');li.textContent='Row '+issue.row+' / '+issue.field+': '+issue.message;list.append(li)}result.append(list);if(!data.issues.length){for(const row of data.rows){const li=document.createElement('li');li.textContent=row.external_team_id+' — '+row.team_name+' — '+row.leader_name+' — '+row.leader_email+(row.second_member_name?' + '+row.second_member_name+' — '+row.second_member_email:' (solo)');list.append(li)}receipt=data.receipt;commit.disabled=!receipt;message('Review the normalized teams below before importing. The batch will remain inactive.')}else message('Resolve every validation issue before import.',true)}catch(error){message(error.message,true)}finally{preview.disabled=false}});
commit.addEventListener('click',async()=>{if(!receipt||!confirm('Import this exact reviewed shortlist? Registration stays unavailable until separate activation.'))return;commit.disabled=true;try{await post('import',{mode:'commit',csv,mapping:getMapping(),receipt});location.reload()}catch(error){invalidate();message(error.message,true)}});}
`; }

function invitationScript() { return `
const form=document.getElementById('exchange'),button=form.querySelector('button'),notice=document.getElementById('notice');
let token='',revision=0,exchanging=false;
function readFragment(){
  const candidate=location.hash.slice(1);
  history.replaceState(null,'',${JSON.stringify(BASE + "/invite")});
  token=/^[A-Za-z0-9_-]{43}$/.test(candidate)?candidate:'';revision++;
  button.disabled=!token||exchanging;
  notice.textContent=token?'':'Invitation is invalid or unavailable. Reopen the original private link or contact the organizer.';
}
readFragment();
addEventListener('hashchange',readFragment);
addEventListener('popstate',()=>{if(!location.hash)readFragment()});
addEventListener('pageshow',event=>{if(event.persisted)readFragment()});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!token||exchanging)return;
  const submittedToken=token,submittedRevision=revision;exchanging=true;button.disabled=true;
  try{
    const response=await fetch(form.action,{method:'POST',mode:'cors',credentials:'same-origin',body:new URLSearchParams({token:submittedToken})});
    if(submittedRevision!==revision)return;
    if(!response.ok){const result=await response.json();throw Error(result.error||'Unable to open invitation.')}
    location.replace(${JSON.stringify(BASE)});
  }catch(error){if(submittedRevision===revision){notice.textContent=error.message;notice.focus()}}
  finally{exchanging=false;button.disabled=!token}
});
`; }

function recoveryScript() { return `
const form=document.getElementById('clear-context'),notice=document.getElementById('recovery-notice');
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{
    // Native no-referrer form navigation sends Origin:null. CORS fetch preserves
    // the same-origin CSRF boundary without relaxing the private-page policy.
    const response=await fetch(form.action,{method:'POST',mode:'cors',credentials:'same-origin'});
    if(!response.redirected||response.url!==new URL(${JSON.stringify(BASE)},location.origin).href)throw Error('Unable to clear invitation context. Please try again.');
    location.replace(${JSON.stringify(BASE)});
  }catch{notice.textContent='Unable to clear invitation context. Please try again.';notice.focus();button.disabled=false}
});
`; }

export function handlePage(req: NextRequest, path: string[] = []): Promise<Response> {
  return withAuthCookies(onCookies => handlePageRequest(req, path, onCookies));
}
async function handlePageRequest(req: NextRequest, path: string[], onCookies: (cookies: AuthCookieUpdate[]) => void) {
  try {
    const registrationEnabled = enabled();
    const importOnly = !registrationEnabled && path.length === 1 && path[0] === "organizer" && inactiveImportEnabled(req.nextUrl.origin);
    if (!registrationEnabled && !importOnly) return shell("Round 2 registration", `<h1>Round 2 registration</h1>${schedule}<section class="panel narrow"><h2>Registration is not available yet</h2><p>Registration opens only after the official shortlist is imported and activated. Every shortlisted participant needs their own verified HackerMate account. Leaders receive private attendance invitations; second members verify their own account separately.</p><p>No payment is required.</p></section>`);
    if (path.length === 1 && path[0] === "organizer") { const auth = await authorize(req,importOnly,onCookies); return organizer(await snapshot(auth.client),auth.isAdmin,importOnly); }
    if (path.length === 1 && path[0] === "invite") {
      // No bearer enters server-rendered HTML. Strip the fragment immediately,
      // before any exchange/navigation; this page has no third-party resources.
      return shell("Private team invitation", `<h1>Your Round 2 invitation</h1>${schedule}<section class="panel narrow"><h2>Continue to your team</h2><p>Only the invited team leader should use this link. Continuing does not confirm attendance.</p><form id="exchange" method="post" action="${API}/session"><button disabled>Continue securely</button></form><p id="notice" class="notice" role="status" tabindex="-1"></p><noscript>Enable JavaScript to continue securely.</noscript></section>`, invitationScript());
    }
    if (path.length) throw new HttpError(404,"Page not found.");
    const invitation = await participantView(req, onCookies);
    if (!invitation) return shell("Verify your account", `<h1>Verify your official roster identity</h1><section class="panel narrow"><p>Your HackerMate account is signed in and onboarding is complete. Verification is pending: match it securely to your exact official leader or second-member entry.</p><p>No team details are shown before verification. Use the account with the organizer-approved email. If the roster is not activated or your email differs, contact Club Ellusion; do not create duplicate accounts.</p><button id="verify-account">Verify my approved roster entry</button><p id="notice" class="notice" role="status" tabindex="-1"></p></section>`, clientCommon + `document.getElementById('verify-account').addEventListener('click',async event=>{event.target.disabled=true;try{await post('claim',{});location.reload()}catch(error){message(error.message,true);event.target.disabled=false}});`);
    const decided = invitation.decision !== "pending";
    const canRespond = !decided && invitation.can_respond && invitation.window === "open";
    return shell("Team account and attendance", `<h1>Round 2 team account and attendance</h1>${schedule}<section class="panel narrow"><h2 class="team">${h(invitation.team_name)}</h2><p>Your official role: ${h(invitation.role)}. Your account: <strong>Verified</strong>.</p><p>HackerMate onboarding: <strong>${invitation.fully_onboarded ? "Fully verified" : "Partially verified"}</strong> (${h(invitation.members_verified)} / ${h(invitation.members_required)} members).</p><p>Attendance: <strong>${h(invitation.decision)}</strong>.</p><p>Attendance and account onboarding are independent. The verified leader may respond while the second member is pending. Later account verification never changes attendance. No separate second-member signup cutoff has been set.</p>${decided ? `<p class="notice">Your team’s response: ${h(invitation.decision)}.</p><p>Contact the organizer if this needs review.</p>` : canRespond ? `<label><input type="checkbox" id="leader">I am the verified leader responding for this team.</label><div class="actions"><button data-decision="confirmed">Confirm attendance</button><button class="secondary" data-decision="declined">Decline attendance</button></div><p>One response for the whole team. You cannot change it here after submitting.</p>` : `<p class="notice">${invitation.role === "member" ? "Only your verified leader can submit attendance." : invitation.window === "before" ? "Attendance confirmation has not opened yet." : invitation.window === "closed" ? "Attendance confirmation has closed. Account onboarding remains separate." : "Reopen your original private leader invitation to respond."}</p>`}<p id="notice" class="notice" role="status" tabindex="-1"></p></section>`, canRespond ? leaderScript() : "");
  } catch (error) {
    const known = error instanceof HttpError;
    if (!known) console.error("[hustle-phase2] Page failed", { type: error instanceof Error ? error.name : "unknown" });
    const status = known ? error.status : 503;
    const organizerPage = path[0] === "organizer";
    return shell("Round 2 account verification", `<h1>${organizerPage ? "Organizer access required" : "HackerMate account verification"}</h1><p>${h(known ? error.message : "Please try again later.")}</p>${status === 401 || status === 403 ? `<a class="button" href="${organizerPage ? `/login?next=${encodeURIComponent(BASE + "/organizer")}` : PARTICIPANT_LOGIN}">Sign up / Sign in with HackerMate</a>` : ""}${status === 428 ? `<a class="button" href="${PARTICIPANT_ONBOARDING}">Complete HackerMate onboarding</a>` : ""}${!organizerPage ? `<p>If this is the wrong account, use the <a href="/dashboard">HackerMate account menu</a> to sign out, then sign in with your official roster email. Ask the organizer to reconcile changed or ambiguous addresses.</p><form id="clear-context" method="post" action="${API}/clear-context"><button class="secondary">Use account onboarding without an attendance link</button></form><p id="recovery-notice" role="status" tabindex="-1"></p><noscript>Enable JavaScript to clear invitation context securely.</noscript>` : ""}`, organizerPage ? "" : recoveryScript(), status);
  }
}

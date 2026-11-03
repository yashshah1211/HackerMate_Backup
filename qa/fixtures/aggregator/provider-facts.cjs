/* Public factual fields only. These are synthetic parser inputs shaped by the read-only provider audit, not raw page copies. */
const buildStage=(start_date,end_date)=>({entity_type:'App\\Model\\OfflineRound',status:'LIVE',is_hidden:0,is_inactive:0,
 details:[{title:'Offline build',display_text:'The actual hackathon build takes place in this stage.',start_date,end_date}]});
const incompleteInventory=(start,end,laterStart,laterEnd)=>{
 const later=buildStage(laterStart,laterEnd);Object.assign(later.details[0],{title:'Final coding',display_text:'Teams build prototypes for the final hackathon.'});
 return [buildStage(start,end),later];
};
module.exports = {
 buildStage,incompleteInventory,
 unstopDiscrepancies:[
  {id:1768100,title:'Ooty Hacks',region:'hybrid',start_date:'2026-10-09T00:00:00+05:30',end_date:'2026-11-25T00:00:00+05:30',details:'A hackathon. Event Dates: 19–20 December 2026. Mode: Offline. Team Size: 1–4 Members.',min:1,max:4,rounds:[]},
  {id:1783256,title:'AGENTX 2.0',region:'hybrid',start_date:'2026-10-29T00:00:00+05:30',end_date:'2026-11-10T00:00:00+05:30',details:'A hackathon. Event Date: 14 November 2026. Team Size: 2–4 Members.',min:2,max:4,rounds:[]},
  {id:1777504,title:'Agents that act. Systems that answer.',region:'online',start_date:'2026-10-26T00:00:00+05:30',end_date:'2026-11-28T07:00:00+05:30',details:'A virtual hackathon on November 28–30, 2026. Solo or teams up to four.',min:1,max:4,
   rounds:[{entity_type:'App\\Models\\AssessmentRound\\AssessmentRound',status:'DRAFT',is_hidden:0,is_inactive:0,details:[{title:'Assessment',start_date:'2026-10-26T23:58:00+05:30',end_date:'2026-11-27T23:58:00+05:30'}]}]},
 ],
 algorush: {data:{competition:{id:1737089,title:'CodeNeuraX: AlgoRush',type:'hackathons',subtype:'online_coding_challenge',status:'FINISHED',region:'online',
 start_date:'2026-08-15T00:00:00+05:30',end_date:'2026-08-30T07:05:00+05:30',details:'Individual coding contest.',
 regnRequirements:{start_regn_dt:'2026-08-15T00:00:00+05:30',end_regn_dt:'2026-08-15T22:51:56+05:30',reg_status:'FINISHED',min_team_size:1,max_team_size:1},
 rounds:[{details:[{title:'Code Contest',start_date:'2026-08-16T07:05:00+05:30',end_date:'2026-08-30T07:05:00+05:30'}]}]}}},
 unstop: {data:{competition:{id:1234,title:'Synthetic city build',type:'hackathons',status:'LIVE',region:'offline',details:'A hackathon for building useful tools.',organisation:{name:'Synthetic public organizer'},start_date:'2026-11-06T09:00:00+05:30',end_date:'2026-11-07T18:00:00+05:30',regnRequirements:{start_regn_dt:'2026-10-01T00:00:00+05:30',end_regn_dt:'2026-11-05T23:59:00+05:30',min_team_size:2,max_team_size:3},rounds:[buildStage('2026-11-06T09:00:00+05:30','2026-11-07T18:00:00+05:30')]}}},
 devfolio: {props:{pageProps:{hackathon:{uuid:'synthetic-devfolio-uuid',slug:'synthetic-build',name:'Synthetic Devfolio build',type:'HACKATHON',team_min:2,team_max:4,starts_at:'2026-11-27T18:30:00Z',ends_at:'2026-11-28T18:30:00Z',is_online:false,city:'Synthetic City',settings:{reg_starts_at:'2026-09-18T18:30:00Z',reg_ends_at:'2026-11-03T18:30:00Z'}}}}},
 bootcamps: {success:true,data:{title:'Build with AI: Bootcamps',type:'EVENT',status:'APPROVED',registrationStart:'2026-02-15T16:30:00Z',registrationEnd:'2026-11-30T16:30:00Z',submissionStart:'2026-11-01T16:30:00Z',submissionEnd:'2026-11-30T16:30:00Z',tags:{}}},
};

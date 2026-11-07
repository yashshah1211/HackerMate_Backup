/* eslint-disable @typescript-eslint/no-require-imports -- Real outreach auth and routes; synthetic adapters only. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const ID = '00000000-0000-4000-8000-000000000501';
const OTHER = '00000000-0000-4000-8000-000000000502';
function setup(options = {}) {
  const state = { reads: [], rpcs: [], logs: [], sends: 0 };
  const user = options.signedOut ? null : { id: OTHER, email: options.ordinary ? 'visitor@example.invalid' : 'owner@example.invalid' };
  const database = options.database || {
    from(table) {
      assert.equal(table, 'organizer_leads');
      const filters = []; let limit, columns;
      const q = {
        select(value) { columns = value; return q; },
        eq(k,v) { filters.push(['eq',k,v]); return q; },
        gt(k,v) { filters.push(['gt',k,v]); return q; },
        order(k,v) { assert.equal(k,'id'); assert.equal(v.ascending,true); return q; },
        limit(value) { limit=value; return q; },
        then(resolve,reject) {
          state.reads.push({columns,filters,limit});
          if (options.readThrows) return Promise.reject(Error('PRIVATE_DETAIL')).then(resolve,reject);
          const rows = (options.rows || []).filter(row => filters.every(([op,k,v]) => op==='eq' ? row[k]===v : row[k]>v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);
          return Promise.resolve({data: options.badRead ? null : rows, error: options.readError ? {message:'PRIVATE_DETAIL'} : null}).then(resolve,reject);
        },
      }; return q;
    },
    async rpc(name,args) {
      state.rpcs.push({name,args});
      if (options.rpcThrows) throw Error('PRIVATE_DETAIL');
      return {data: Object.hasOwn(options,'receipt') ? options.receipt : {outcome:'restored',lead_id:args.p_lead_id,status:'restored_review'}, error: options.rpcError ? {message:'PRIVATE_DETAIL',details:'PRIVATE_DETAIL'} : null};
    },
  };
  const h = harness({
    'next/server': {NextRequest,NextResponse},
    '@supabase/ssr': {createServerClient:()=>({auth:{getUser:async()=>({data:{user},error: options.authError ? Error('PRIVATE_DETAIL') : null})}})},
    '@supabase/supabase-js': {createClient:()=>database},
    '@/lib/emailDispatch': {dispatchEmail: async()=>{state.sends++; throw Error('Unexpected dispatch');}},
  }, {console:{error:(...args)=>state.logs.push(args)}});
  Object.assign(h.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',OUTREACH_ADMIN_EMAIL:'owner@example.invalid'});
  const restore = (body={leadId:ID}, raw, query='') => h.load('src/app/api/admin/organizer-leads/restore/route.ts').POST(new NextRequest('http://localhost/api/admin/organizer-leads/restore'+query,{method:'POST',body:raw ?? JSON.stringify(body)}));
  const browse = (query='') => h.load('src/app/api/admin/organizer-leads/removed/route.ts').GET(new NextRequest('http://localhost/api/admin/organizer-leads/removed'+query));
  return {...h,state,restore,browse};
}
module.exports={setup,ID,OTHER};

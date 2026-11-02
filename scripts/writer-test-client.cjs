/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic PostgREST builder for existing UI harnesses. */
const assert=require('node:assert/strict');
function writerTestClient(client, actor) {
  client.auth.getSession ||= async()=>({data:{session:actor()?{user:{id:actor()},access_token:'fixture-token'}:null},error:null});
  const rpc=client.rpc.bind(client);
  client.rpc=(name,args)=>({
    setHeader(key,value){assert.equal(key,'Authorization');assert.equal(value,'Bearer fixture-token');return this;},
    abortSignal(){return this;},retry(enabled){assert.equal(enabled,false);return this;},
    then(resolve,reject){return Promise.resolve().then(()=>rpc(name,args)).then(resolve,reject);},
  });
  return client;
}
module.exports={writerTestClient};

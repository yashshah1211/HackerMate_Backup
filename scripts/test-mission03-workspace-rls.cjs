/* eslint-disable @typescript-eslint/no-require-imports -- Real RLS/privilege regression tests in a fresh native localhost cluster. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { workspaceFixture, OWNER, MEMBER, BANNED, TEAM, ROW } = require('./mission03-workspace-db.cjs');
test('workspace backend actor boundaries from actual migration definitions', async t => {
  const db = await workspaceFixture();
  try {
    for (const table of ['team_tasks','team_links']) {
      await t.test(`${table}: removed creator cannot delete using minimal-return SQL`, () => {
        db.reset(); db.sql(`DELETE FROM team_members WHERE user_id='${MEMBER}';`);
        assert.equal(db.as(MEMBER,`SELECT count(*) FROM ${table};`),'0');
        assert.equal(db.as(MEMBER,`WITH pgrst_source AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM pgrst_source;`),'0');
        assert.equal(db.sql(`SELECT count(*) FROM ${table};`),'1');
      });
      await t.test(`${table}: ordinary member cannot forge creator deletion authority`, () => {
        db.reset(); db.sql(`UPDATE ${table} SET created_by='${OWNER}';`);
        assert.equal(db.as(MEMBER,`WITH removed AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM removed;`),'0');
        assert.throws(() => db.as(MEMBER,`UPDATE ${table} SET created_by='${MEMBER}' WHERE id='${ROW}';`),/permission denied/);
        assert.equal(db.sql(`SELECT created_by FROM ${table};`),OWNER);
      });
      await t.test(`${table}: suspended current member cannot read or update`, () => {
        db.reset(); assert.equal(db.as(BANNED,`SELECT count(*) FROM ${table};`),'0');
        assert.equal(db.as(BANNED,`WITH changed AS (UPDATE ${table} SET title='Forbidden change' RETURNING 1) SELECT count(*) FROM changed;`),'0');
        assert(!db.sql(`SELECT title FROM ${table};`).includes('Forbidden'));
      });
      await t.test(`${table}: owner and active member retain mutable updates and creator delete`, () => {
        db.reset(); assert.equal(db.as(OWNER,`SELECT count(*) FROM ${table};`),'1');
        assert.equal(db.as(OWNER,`WITH changed AS (UPDATE ${table} SET title='Owner edit' RETURNING id) SELECT count(*) FROM changed;`),'1');
        assert.equal(db.as(MEMBER,`WITH changed AS (UPDATE ${table} SET title='Member edit' RETURNING id) SELECT count(*) FROM changed;`),'1');
        assert.equal(db.as(MEMBER,`WITH removed AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM removed;`),'1');
      });
      await t.test(`${table}: immutable grants are absent even when formerly inherited from PUBLIC`, () => {
        db.reset();
        for (const column of ['id','team_id','created_by','created_at']) assert.equal(db.sql(`SELECT has_column_privilege('authenticated','${table}','${column}','UPDATE');`),'f');
        assert.equal(db.sql(`SELECT has_column_privilege('service_role','${table}','title','UPDATE');`),'t');
      });
      await t.test(`${table}: suspended inserts and creator forgery remain denied`, () => {
        db.reset();
        const values = table === 'team_tasks' ? `(team_id,title,created_by) VALUES('${TEAM}','Synthetic','${OWNER}')` : `(team_id,title,url,created_by) VALUES('${TEAM}','Synthetic','https://example.invalid','${OWNER}')`;
        assert.throws(() => db.as(MEMBER,`INSERT INTO ${table}${values};`),/row-level security/);
        assert.throws(() => db.as(BANNED,`INSERT INTO ${table}${values.replace(OWNER,BANNED)};`),/row-level security/);
      });
      await t.test(`${table}: legacy nullable creator inserts, owner delete and live suspension checks`, () => {
        db.reset();
        const columns=table==='team_tasks'?'team_id,title,created_by':'team_id,title,url,created_by';
        const values=table==='team_tasks'?`'${TEAM}','Legacy synthetic',NULL`:`'${TEAM}','Legacy synthetic','https://example.invalid',NULL`;
        db.as(MEMBER,`INSERT INTO ${table}(${columns}) VALUES(${values});`);
        assert.equal(db.as(OWNER,`WITH removed AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM removed;`),'2');
        for(const flag of ['true','NULL']){
          db.reset();db.sql(`UPDATE profiles SET is_banned=${flag} WHERE id='${MEMBER}';`);
          assert.equal(db.as(MEMBER,`WITH removed AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM removed;`),'0');
          db.sql(`UPDATE profiles SET is_banned=false WHERE id='${MEMBER}';`);
        }
      });
    }
    await t.test('task mutable fields, FK cleanup and service maintenance remain compatible', () => {
      db.reset();
      db.as(MEMBER,`UPDATE team_tasks SET description='Synthetic details',status='completed',priority='high',assignee_id='${OWNER}',due_date='2026-11-30';`);
      db.sql(`DELETE FROM profiles WHERE id='${MEMBER}';`);
      assert.equal(db.sql('SELECT created_by IS NULL FROM team_tasks;'),'t');
      assert.equal(db.sql('SET ROLE service_role;UPDATE team_tasks SET title=\'Maintenance\';RESET ROLE;SELECT title FROM team_tasks;').split('\n').at(-1),'Maintenance');
    });
    await t.test('mutable resource fields and migration reapplication remain compatible',()=>{
      for(const migration of db.migrations)db.sql(db.read(migration));
      db.reset();
      db.as(OWNER,`UPDATE team_links SET title='Resource',url='https://example.invalid/resource',category='document',hackathon_id=NULL;`);
      assert.equal(db.sql('SELECT title FROM team_links;'),'Resource');
    });
    await t.test('same session observes membership removal committed before its next mutation',async()=>{
      db.reset();
      const writer=db.asyncSql(`BEGIN;SET ROLE authenticated;SET request.jwt.claim.sub='${MEMBER}';
        SELECT count(*) FROM team_tasks;
        SELECT pg_sleep(1) /* mission03_revoke_wait */;
        WITH changed AS(UPDATE team_tasks SET title='Revoked write' RETURNING 1) SELECT count(*) FROM changed;
        COMMIT;`);
      try {
        const deadline=Date.now()+5000;let waiting=false;
        while(Date.now()<deadline){
          waiting=db.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%mission03_revoke_wait%');")==='t';
          if(waiting)break;
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert(waiting,'writer reached the controlled pre-mutation pause');
        db.sql(`DELETE FROM team_members WHERE user_id='${MEMBER}';`);
        assert.equal((await writer).split('\n').at(-2).trim(),'0');
        assert.equal(db.sql('SELECT title FROM team_tasks;'),'Synthetic task');
      } finally { await writer; }
    });
    await t.test('suspended member cannot read/save/delete documents; active CAS semantics remain',()=>{
      db.reset();
      const id=db.sql('SELECT id FROM team_documents;');
      assert.equal(db.as(BANNED,'SELECT count(*) FROM team_documents;'),'0');
      const result=JSON.parse(db.as(BANNED,`SELECT save_team_document('${TEAM}','${id}',1,'Forbidden content');`));
      assert.notEqual(result.status,'saved');
      assert.equal(db.sql('SELECT content FROM team_documents;'),'Synthetic document');
      assert.equal(db.as(BANNED,'WITH removed AS(DELETE FROM team_documents RETURNING 1) SELECT count(*) FROM removed;'),'0');
      assert.throws(()=>db.as(BANNED,`INSERT INTO team_documents(team_id,content) VALUES('${TEAM}','Forbidden creation');`),/row-level security/);
      assert.equal(JSON.parse(db.as(OWNER,`SELECT save_team_document('${TEAM}','${id}',1,'Owner content');`)).status,'saved');
      assert.equal(JSON.parse(db.as(MEMBER,`SELECT save_team_document('${TEAM}','${id}',1,'Stale content');`)).status,'conflict');
      assert.equal(JSON.parse(db.as(MEMBER,`SELECT save_team_document('${TEAM}','${id}',2,'Member content');`)).status,'saved');
    });
  } finally { await db.close(); }
});

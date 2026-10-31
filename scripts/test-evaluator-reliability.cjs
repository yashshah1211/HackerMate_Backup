/* eslint-disable @typescript-eslint/no-require-imports -- Offline real PPT route/provider/engine contracts. */
const assert=require('node:assert/strict');
const {test,after}=require('node:test');
const fs=require('node:fs'),path=require('node:path');
const {harness,ROOT}=require('./ppt-vision-harness.cjs');
const {cases,customRubric}=require('./fixtures/evaluator-benchmarks.cjs');
const USER='00000000-0000-4000-8000-000000000001',OTHER='00000000-0000-4000-8000-000000000002',SAVED='00000000-0000-4000-8000-000000000003';
const PRIVATE='private submission URL token must never appear in logs';
const SOURCE='We propose a classifier with a held-out validation set.';
function setup(options={}){return require('./fixtures/evaluator-benchmarks.cjs').presentationSetup(options);}
test('per-attempt body timeout permits at most one further bounded transport attempt', async () => {
  const f = setup({ provider: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })) });
  const execution = { deadlineAt: Date.now() + 5_000, attempts: 0 };
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution, perModelTimeoutMs: 25 }), e => e.code === 'provider_unavailable');
  assert.equal(f.state.calls.length, 2); assert.equal(execution.attempts, 2);
});
test('request cancellation during a stalled provider never cascades', async () => {
  const f = setup({ provider: () => new Promise(() => {}) }), controller = new AbortController();
  const pending = f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt: Date.now() + 5_000, attempts: 0, signal: controller.signal } });
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(pending, e => e.code === 'deadline_exceeded'); assert.equal(f.state.calls.length, 1);
});
test('a stalled attempt reservation is bounded by the same provider deadline before any network call', async () => {
  const f = setup(), deadlineAt = Date.now() + 1_500;
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt, attempts: 0, beforeProviderAttempt: providerDeadline => { assert.equal(providerDeadline, deadlineAt); return new Promise(() => {}); } } }), e => e.code === 'deadline_exceeded');
  assert.equal(f.state.calls.length, 0);
});
test('shared image transport preserves modality and uses the server key in headers, never URLs', async () => {
  const f = setup({ provider: () => Response.json({ candidates: [{ content: { parts: [{ text: '{"safe":true}' }] } }] }) });
  const bytes = Buffer.from('offline-image-bytes');
  const response = await f.loader.load('src/lib/ai/geminiClient.ts').callGeminiVision('Moderate this fixture', bytes, 'image/png');
  assert.equal(response.text, '{"safe":true}'); assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].body.contents[0].parts[1].inlineData.mimeType, 'image/png'); assert.equal(f.state.calls[0].body.contents[0].parts[1].inlineData.data, bytes.toString('base64'));
  assert(!f.state.calls[0].url.includes('key='));
});
test('aborted/stale execution stops before a provider attempt', async () => {
  const f = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt: Date.now() + 5_000, attempts: 0, signal: controller.signal } }), e => e.code === 'deadline_exceeded');
  assert.equal(f.state.calls.length, 0);
});
// Stage B: actual PPT engines and routes; all transports are synthetic.
const { pitchOutput, providerEnvelope, makeBenchmarkPdf, presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');
const presentationMatrix = [];
after(() => {
    fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'scratch/evaluator-benchmark-presentations.json'), JSON.stringify({ kind: 'offline_mock_response_contract', liveAccuracyMeasured: false, complete: presentationMatrix.length === 32, cases: presentationMatrix.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + '\n');
});
for (const fixture of cases.filter(c => c.pipeline === 'ppt'))
    test('benchmark contract ' + fixture.id, async () => {
        const context = { deadlineAt: Date.now() + 30000, attempts: 0, requestId: 'offline-' + fixture.id };
        let output = pitchOutput(fixture.source, fixture.track, fixture.mode, fixture.quality === 'strong' ? undefined : [5, 5, 5, 5]);
        if (fixture.quality === 'adversarial') {
            if (fixture.mode === 'visual_text')
                output.scoreDeductions.novelty.feedback.pageNumber = 99;
            else
                output.scoreDeductions.novelty.feedback.quote = 'Invented test result not in submission';
        }
        let calls = 0;
        const loader = harness({}, { fetch: async () => { calls++; return Response.json(providerEnvelope(output)); } });
        const started = Date.now();
        try {
            const result = await loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Synthetic proposal', 'open', fixture.source, { memberCount: 6 }, fixture.track, fixture.customRubric, fixture.mode === 'visual_text' ? { bytes: makeBenchmarkPdf(fixture.source), pageCount: 1, source: 'linked_pdf' } : undefined, 30000, context);
            assert.notEqual(fixture.quality, 'adversarial');
            assert.equal(result.usedAiFallback, false);
            assert.equal(result.analysis.mode, fixture.mode);
            const sum = result.scoreNovelty + result.scoreTech + result.scoreUiUx + result.scoreTeam;
            assert.equal(result.totalScore, sum);
            assert.equal(calls, 1);
            assert.equal(context.attempts, 1);
            if (fixture.quality !== 'strong')
                assert.equal(sum, 20);
            for (const items of Object.values(result.analysis.evidence))
                for (const item of items)
                    if (item.quote)
                        assert(fixture.source.includes(item.quote));
                    else
                        assert.equal(item.pageNumber, 1);
            presentationMatrix.push({ id: fixture.id, pipeline: fixture.pipeline, mode: result.analysis.mode, status: 'accepted_mock_contract', total: sum, grade: result.grade, attempts: context.attempts, latencyMs: Date.now() - started, evidenceAnchors: 'validated', liveAccuracy: false });
        }
        catch (error) {
            assert.equal(fixture.quality, 'adversarial', error.stack);
            assert.equal(error.code, 'invalid_ai_output');
            assert.equal(calls, 1);
            presentationMatrix.push({ id: fixture.id, pipeline: fixture.pipeline, mode: fixture.mode, status: 'rejected_invalid_mock_evidence', score: null, code: error.code, attempts: context.attempts, latencyMs: Date.now() - started, liveAccuracy: false });
        }
    });
for (const pipeline of ['ppt']) {
    for (const [label, mutate] of [
        ['missing identity', s => { s.user = null; }], ['Auth service error', s => { s.authError = { status: 503, message: PRIVATE }; }], ['Auth throws', s => { s.authThrows = true; }],
        ['limiter error', s => { s.rateError = true; }], ['malformed atomic result', s => { s.rateOverride = { data: [], error: null }; }],
    ])
        test(pipeline + ' ' + label + ' stops before provider or business mutation', async () => {
            const setup = presentationSetup({ pipeline });
            mutate(setup.state);
            const response = await setup[pipeline]();
            assert(response.status >= 400);
            assert.equal(setup.state.calls.length, 0);
            assert.equal(setup.state.writes.length, 0);
            assert(!JSON.stringify(response).includes(PRIVATE));
        });
    test(pipeline + ' zero/uncertain completed persistence never returns success', async () => {
        const setup = presentationSetup({ pipeline, queryOverride(q) { if (q.table === ('team_ppt_evaluations') && ((q.operation === 'update' && q.payload.status === 'completed')))
                return { data: null, error: null }; } });
        const response = await setup[pipeline]();
        assert.equal(response.status, 409, JSON.stringify(response));
        assert.equal(response.body.code, 'persistence_uncertain');
        assert.equal(response.body.result, null);
        assert.equal(setup.state.calls.length, 1);
        assert(!setup.state.tables['team_ppt_evaluations'].some(row => row.status === 'completed'));
    });
    test(pipeline + ' lost successful save is reconciled without a second provider call', async () => {
        const setup = presentationSetup({ pipeline, afterMutation(q) { if ((q.operation === 'update' && q.payload.status === 'completed'))
                throw Error(PRIVATE); } });
        const response = await setup[pipeline]();
        assert.equal(response.status, 200, JSON.stringify(response));
        assert.equal(response.body.success, true);
        assert.equal(setup.state.calls.length, 1);
        assert(!setup.state.writes.some(q => q.payload.status === 'failed'));
    });
    test(pipeline + ' known duplicate does not rerun model or charge another slot', async () => {
        const setup = presentationSetup({ pipeline });
        assert.equal((await setup[pipeline]()).status, 200);
        const count = setup.state.counters.size;
        const duplicate = await setup[pipeline]();
        assert.equal(duplicate.body.code, 'duplicate_request');
        assert.equal(setup.state.calls.length, 1);
        assert.equal(setup.state.counters.size, count);
    });
    test(pipeline + ' concurrent distinct tokens share a fixed active slot', async () => {
        let release, started;
        const reached = new Promise(resolve => { started = resolve; });
        const setup = presentationSetup({ pipeline, provider: async () => { started(); await new Promise(resolve => { release = resolve; }); return Response.json(providerEnvelope(pitchOutput(SOURCE))); } });
        const first = setup[pipeline]();
        await reached;
        const second = await setup[pipeline]({}, { 'idempotency-key': 'offline-distinct-token-0002' });
        assert.equal(second.body.code, 'cooldown');
        release();
        assert.equal((await first).status, 200);
        assert.equal(setup.state.calls.length, 1);
    });
    for (const column of ['version', 'id'])
        test(pipeline + ' failed ' + column + ' read cannot fail open', async () => {
            const setup = presentationSetup({ pipeline, queryOverride(q) { if (q.table === ('team_ppt_evaluations') && q.operation === 'select' && (q.columns === column || (column === 'id' && q.columns === 'id, status')))
                    return { data: null, error: { code: '42501', message: PRIVATE } }; } });
            const response = await setup[pipeline]();
            assert.equal(response.body.code, 'database_unavailable');
            assert.equal(setup.state.calls.length, 0);
            assert(!setup.state.writes.some(q => q.operation === 'insert'));
        });
}
for (const code of ['42703', 'PGRST204'])
    test('PPT optional track-column ' + code + ' retries once with metadata intact', async () => {
        const setup = presentationSetup({ track: 'specific', trackError: code });
        const result = await setup.ppt({ customRubric });
        assert.equal(result.status, 200);
        assert.equal(setup.state.writes.filter(q => q.operation === 'insert').length, 2);
        assert.equal(result.body.evaluation.ai_feedback.analysis.trackId, 'specific');
        assert.equal(result.body.evaluation.ai_feedback.analysis.rubricVersion, 'ppt-v1');
    });
test('PPT unrelated/uncertain initialization never retries insert', async () => {
    let inserts = 0;
    const setup = presentationSetup({ queryOverride(q) { if (q.operation === 'insert') {
            inserts++;
            return { data: null, error: { code: '08006', message: PRIVATE } };
        } } });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'persistence_uncertain');
    assert.equal(inserts, 1);
    assert.equal(setup.state.calls.length, 0);
});
for (const bad of ['nonsense', 3, null])
    test('PPT invalid explicit track ' + JSON.stringify(bad) + ' is rejected', async () => {
        const setup = presentationSetup();
        const result = await setup.ppt({ track_id: bad });
        assert.equal(result.status, bad === null ? 200 : 400);
        if (bad !== null)
            assert.equal(setup.state.calls.length, 0);
    });
test('PPT unsupported custom rubric is rejected before reservation', async () => {
    const setup = presentationSetup({ track: 'specific' });
    assert.equal((await setup.ppt({ customRubric: 'Use arbitrary organizer weights' })).body.code, 'rubric_unsupported');
    assert.equal(setup.state.counters.size, 0);
});
for (const permission of ['owner', 'member', 'admin', 'visitor'])
    test('PPT preserves ' + permission + ' authorization', async () => {
        const setup = presentationSetup();
        if (permission !== 'owner')
            setup.state.tables.teams[0].owner_id = OTHER;
        if (!['owner', 'member'].includes(permission))
            setup.state.tables.team_members = [];
        if (permission === 'admin')
            setup.state.tables.profiles[0].role = 'admin';
        const result = await setup.ppt();
        assert.equal(result.status, permission === 'visitor' ? 403 : 200);
        if (permission === 'visitor')
            assert.equal(setup.state.calls.length, 0);
    });
for (const age of [119000, 121000])
    test('PPT explicit authorized POST distinguishes ' + age + 'ms processing', async () => {
        const setup = presentationSetup();
        const old = { id: '00000000-0000-4000-8000-000000000009', team_id: setup.TEAM, status: 'evaluating', version: 1, created_at: new Date(Date.now() - age).toISOString(), updated_at: new Date(Date.now() - age).toISOString() };
        setup.state.tables.team_ppt_evaluations.push(old);
        const result = await setup.ppt();
        assert.equal(result.status, age < 120000 ? 409 : 200);
        assert.equal(old.status, age < 120000 ? 'evaluating' : 'failed');
        if (age > 120000) {
            const recovery = setup.state.writes.find(q => q.payload.error_message === 'processing_interrupted');
            assert(recovery.filters.some(f => f.key === 'status' && f.value === 'evaluating'));
            assert(recovery.filters.some(f => f.kind === 'lt' && f.key === 'updated_at'));
        }
    });
test('PPT stale recovery is bounded and reports a remaining backlog', async () => {
    const setup = presentationSetup();
    for (let i = 0; i < 4; i++)
        setup.state.tables.team_ppt_evaluations.push({ id: `00000000-0000-4000-8000-00000000001${i}`, team_id: setup.TEAM, status: 'evaluating', version: i + 1, updated_at: new Date(Date.now() - 200000).toISOString(), created_at: new Date(Date.now() - 200000).toISOString() });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'processing_interrupted');
    assert.equal(setup.state.writes.length, 3);
    assert.equal(setup.state.calls.length, 0);
});
test('PPT stale CAS zero-row or read failure stops initialization', async () => {
    const setup = presentationSetup({ queryOverride(q) { if (q.operation === 'update')
            return { data: [], error: null }; } });
    setup.state.tables.team_ppt_evaluations.push({ id: SAVED, team_id: setup.TEAM, status: 'evaluating', updated_at: new Date(Date.now() - 200000).toISOString() });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'processing_interrupted');
    assert.equal(setup.state.calls.length, 0);
});
test('PPT model failure terminalizes the initialized row without scores', async () => {
    const setup = presentationSetup({ provider: async () => new Response('', { status: 403 }) });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'provider_rejected');
    assert.equal(setup.state.tables.team_ppt_evaluations[0].status, 'failed');
    assert.equal(setup.state.tables.team_ppt_evaluations[0].total_score, undefined);
});
test('PPT failed cleanup is observable as persistence uncertainty and sanitized', async () => {
    const setup = presentationSetup({ provider: async () => new Response('', { status: 403 }), queryOverride(q) { if (q.operation === 'update' && q.payload.status === 'failed')
            return { data: null, error: { code: '42501', message: PRIVATE } }; } });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'persistence_uncertain');
    assert.equal(setup.state.tables.team_ppt_evaluations[0].status, 'evaluating');
    assert(setup.state.logs.some(l => JSON.stringify(l).includes('fail_ppt_processing')));
    assert(!JSON.stringify(setup.state.logs).includes(PRIVATE));
});
test('PPT completion racing terminal failure never overwrites completed status', async () => {
    const setup = presentationSetup({ provider: async () => new Response('', { status: 403 }), queryOverride(q, state) { if (q.operation === 'update' && q.payload.status === 'failed') {
            state.tables.team_ppt_evaluations[0].status = 'completed';
            return { data: [], error: null };
        } } });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'persistence_uncertain');
    assert.equal(setup.state.tables.team_ppt_evaluations[0].status, 'completed');
});
test('PDF transport-only degradation shares two attempts and one provider deadline', async () => {
    const setup = presentationSetup({ mode: 'visual_text', provider: async (n) => n === 1 ? new Response('', { status: 503 }) : Response.json(providerEnvelope(pitchOutput(SOURCE))) });
    const result = await setup.ppt();
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.body.evaluation.ai_feedback.analysis.mode, 'text_only');
    assert.equal(result.body.evaluation.ai_feedback.analysis.attempts, 2);
    assert.equal(setup.state.calls.length, 2);
    assert(setup.state.calls[0].body.contents[0].parts[0].inlineData);
    assert(!setup.state.calls[1].body.contents[0].parts[0].inlineData);
});
for (const [pipeline, keys, caps] of [['ppt', ['scoreNovelty', 'scoreTech', 'scoreUiUx', 'scoreTeam'], [25, 25, 25, 25]]]) {
    for (const [i, key] of keys.entries())
        for (const value of [undefined, null, '5', true, 0.5, -1, NaN, Infinity, caps[i] + 1])
            test(pipeline + ' rejects ' + key + '=' + String(value), async () => {
                const output = pitchOutput(SOURCE);
                output[key] = value;
                const setup = presentationSetup({ pipeline, output });
                const result = await setup[pipeline]();
                assert.equal(result.body.code, 'invalid_ai_output');
                assert.equal(result.body.result, null);
                assert(!setup.state.tables['team_ppt_evaluations'].some(row => row.status === 'completed'));
            });
}
test('PPT cancellation makes no provider call when already aborted', async () => {
    const signal = AbortSignal.abort();
    {
        const loader = harness();
        const context = { deadlineAt: Date.now() + 1000, attempts: 0, signal };
        await assert.rejects(loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Title', 'software', SOURCE, undefined, 'generic', undefined, undefined, 1000, context), e => e.code === 'deadline_exceeded');
    }
});
for (const pipeline of ['ppt'])
    test(pipeline + ' requires a Bearer token before any read or write', async () => {
        const setup = presentationSetup({ pipeline });
        const result = await setup[pipeline]({}, { authorization: '' });
        assert.equal(result.status, 401);
        assert.equal(setup.state.queries.length, 0);
        assert.equal(setup.state.calls.length, 0);
    });
for (const pipeline of ['ppt'])
    test(pipeline + ' derives total/grade and rejects non-grounded or malformed feedback', async () => {
        const low = pitchOutput(SOURCE, 'generic', 'text_only', [5, 5, 5, 5]);
        const setup = presentationSetup({ pipeline, output: { ...low, totalScore: 100, grade: 'Mastery' } });
        const response = await setup[pipeline]();
        assert.equal(response.status, 200);
        const row = response.body.evaluation || response.body.submission;
        assert.equal(row.total_score, 20);
        assert.notEqual(row.grade, 'Mastery');
        for (const mutation of [output => { output.strengths = ['unanchored praise']; }, output => { output.scoreDeductions['novelty'].pointsLost = 0; }, output => { output.scoreDeductions['novelty'].feedback.quote = 'Fabricated result'; }, output => { output.formatViolations = [{ text: 'Unsupplied six-member penalty', quote: SOURCE, ruleQuote: 'invented cap' }]; }]) {
            const output = pitchOutput(SOURCE);
            mutation(output);
            const failed = presentationSetup({ pipeline, output });
            assert.equal((await failed[pipeline]()).body.code, 'invalid_ai_output');
            assert(!failed.state.tables['team_ppt_evaluations'].some(row => row.status === 'completed'));
        }
    });
for (const total of [49, 50, 71, 72, 87, 88])
    test('PPT local grade boundary ' + total, () => {
        const grade = harness().load('src/lib/ppt/evaluatorEngine.ts').computeGrade(total, 6, ['Invented eligibility violation'], 'ai_genai');
        assert.equal(grade, total >= 88 ? 'Strong Pitch 🏆' : total >= 72 ? 'Promising ✅' : total >= 50 ? 'Needs Iteration ⚠️' : 'Major Concerns 🚨');
    });
test('PPT request-wide deadline and PDF degradation never grant another provider budget', async () => {
    let now = 0, calls = 0;
    const loader = harness({}, { Date: class extends Date {
            static now() { return now; }
        }, fetch: async () => { calls++; now = 30000; return new Response('', { status: 503 }); } });
    const context = { deadlineAt: 50000, attempts: 0 };
    const { makePitchPdf } = require('./fixtures/pitch-pdf.cjs');
    await assert.rejects(loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Title', 'open', SOURCE, undefined, 'generic', undefined, { bytes: makePitchPdf(), pageCount: 3, source: 'linked_pdf' }, 30000, context), e => e.code === 'deadline_exceeded');
    assert.equal(calls, 1);
    assert.equal(context.providerDeadlineAt, 30000);
});
// Exercise the real engine and gateway, with a deterministic clock and local
// provider responses. Backoff consumes clock time; no provider network is used.
function deadlineFixture({ budget = 30000, executionDeadline = 50000, existingDeadline, firstElapsed = 6000, finishAt, failure = 503, signal } = {}) {
    let now = 0, calls = 0;
    const admissions = [], timers = [];
    const { pitchOutput, providerEnvelope } = require('./fixtures/evaluator-benchmarks.cjs');
    class Clock extends Date {
        static now() { return now; }
    }
    class Signals extends AbortSignal {
        static timeout(ms) { timers.push({ started: now, deadline: now + ms }); return AbortSignal.timeout(ms); }
    }
    const loader = harness({}, { Date: Clock, AbortSignal: Signals, Math: Object.assign(Object.create(Math), { random: () => 0 }),
        setTimeout(fn, ms, ...args) { if (ms === 250) {
            now += 250;
            return setTimeout(fn, 0, ...args);
        } return setTimeout(fn, ms, ...args); },
        fetch: async () => {
            calls++;
            if (calls === 1) {
                now = firstElapsed;
                if (failure === 'transport')
                    throw Error('synthetic transport');
                return failure === 'invalid' ? Response.json({ candidates: [] }) : new Response('', { status: failure });
            }
            if (finishAt !== undefined)
                now = finishAt;
            return Response.json(providerEnvelope(pitchOutput(SOURCE, 'generic', 'text_only')));
        } });
    const context = { deadlineAt: executionDeadline, attempts: 0, signal, providerDeadlineAt: existingDeadline, beforeProviderAttempt: async (d) => { admissions.push(d); } };
    const run = () => loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Synthetic', 'open', SOURCE, undefined, 'generic', undefined, { bytes: Buffer.from('%PDF-synthetic'), pageCount: 1, source: 'linked_pdf' }, budget, context);
    return { run, context, admissions, timers, get calls() { return calls; } };
}
for (const [budget, executionDeadline, existingDeadline, expected] of [[10000, 50000, undefined, 10000], [30000, 50000, undefined, 30000], [36000, 50000, undefined, 36000], [36000, 20000, undefined, 20000], [36000, 50000, 12000, 12000], [10000, 50000, 36000, 10000]]) {
    test(`PPT fallback shares original absolute deadline ${budget}/${executionDeadline}/${existingDeadline}`, async () => {
        const f = deadlineFixture({ budget, executionDeadline, existingDeadline });
        const result = await f.run();
        assert.equal(result.analysis.mode, 'text_only');
        assert.equal(f.context.providerDeadlineAt, expected);
        assert.deepEqual(f.admissions, [expected, expected]);
        assert.equal(f.calls, 2);
        assert.equal(f.context.attempts, 2);
        assert(f.timers.every(t => t.deadline <= expected));
        assert.equal(f.timers[0].deadline, Math.min(16000, expected));
        assert.equal(f.timers[1].deadline, Math.min(21250, expected));
    });
}
test('PPT fallback cannot return a validated score beyond original caller budget', async () => {
    const f = deadlineFixture({ budget: 30000, firstElapsed: 15900, finishAt: 30500 });
    await assert.rejects(f.run(), e => e.code === 'deadline_exceeded');
    assert.equal(f.context.providerDeadlineAt, 30000);
    assert.equal(f.calls, 2);
});
test('PPT explicit 36s allowance permits a valid response after 30s', async () => {
    const f = deadlineFixture({ budget: 36000, firstElapsed: 15900, finishAt: 30500 });
    const result = await f.run();
    assert.equal(result.analysis.mode, 'text_only');
    assert.equal(typeof result.totalScore, 'number');
    assert.equal(f.context.providerDeadlineAt, 36000);
    assert.equal(f.calls, 2);
});
for (const failure of [400, 401, 402, 403, 404, 429, 'invalid'])
    test('PPT ineligible native failure never degrades: ' + failure, async () => {
        const f = deadlineFixture({ budget: 36000, failure });
        await assert.rejects(f.run(), e => e.code === (failure === 'invalid' ? 'invalid_ai_output' : 'provider_rejected'));
        assert.equal(f.calls, 1);
        assert.equal(f.context.attempts, 1);
    });
test('PPT expired shared provider budget prevents even the fallback admission', async () => {
    const f = deadlineFixture({ budget: 10000, firstElapsed: 10000 });
    await assert.rejects(f.run(), e => e.code === 'deadline_exceeded');
    assert.equal(f.calls, 1);
    assert.equal(f.context.attempts, 1);
});
test('PPT cancelled before execution spends no provider attempt', async () => {
    const f = deadlineFixture({ signal: AbortSignal.abort() });
    await assert.rejects(f.run(), e => e.code === 'deadline_exceeded');
    assert.equal(f.calls, 0);
});
test('native attempt timeout permits just one bounded text fallback; parent abort forbids it', async () => {
    for (const parentAbort of [false, true]) {
        let now = 0, calls = 0, timeouts = 0;
        const owner = new AbortController();
        const { pitchOutput, providerEnvelope } = require('./fixtures/evaluator-benchmarks.cjs');
        class Signals extends AbortSignal {
            static timeout(ms) { if (++timeouts === 1) {
                assert.equal(ms, 16000);
                const c = new AbortController();
                queueMicrotask(() => { now = 16000; if (parentAbort)
                    owner.abort(); c.abort(); });
                return c.signal;
            } return AbortSignal.timeout(ms); }
        }
        const loader = harness({}, { Date: class extends Date {
                static now() { return now; }
            }, AbortSignal: Signals, fetch: async (_url, init) => { calls++; if (calls === 1)
                return new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(Error('synthetic timeout')), { once: true }); }); return Response.json(providerEnvelope(pitchOutput(SOURCE, 'generic', 'text_only'))); } });
        const context = { deadlineAt: 50000, attempts: 0, signal: owner.signal };
        const pending = loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Synthetic', 'open', SOURCE, undefined, 'generic', undefined, { bytes: Buffer.from('%PDF-synthetic'), pageCount: 1, source: 'linked_pdf' }, 36000, context);
        if (parentAbort) {
            await assert.rejects(pending, e => e.code === 'deadline_exceeded');
            assert.equal(calls, 1);
        }
        else {
            assert.equal((await pending).analysis.mode, 'text_only');
            assert.equal(calls, 2);
        }
        assert.equal(context.attempts, calls);
    }
});
test('PDF parent cancellation destroys parser state and prevents a scored continuation', async () => {
    const abort = new AbortController();
    let destroyed = 0;
    const document = { numPages: 1, loadingTask: { async destroy() { destroyed++; } }, getPage: () => new Promise(() => { }) };
    const loader = harness({ unpdf: { getDocumentProxy: async () => document } });
    const pending = loader.load('src/lib/ppt/presentationExtractor.ts').extractTextFromPDF(Buffer.from('%PDF-fixture'), 'linked_pdf', 5000, abort.signal);
    abort.abort();
    assert.equal((await pending).success, false);
    assert(destroyed >= 1);
});
for (const pipeline of ['ppt'])
    test(pipeline + ' malformed persisted category data cannot confirm a new score', async () => {
        const column = 'score_tech';
        const malformed = row => ({ ...row, [column]: null });
        const setup = presentationSetup({ pipeline, afterMutation(q, rows) { if ((pipeline === 'ppt' && q.operation === 'update' && q.payload.status === 'completed'))
                return { data: malformed(rows[0]), error: null }; }, queryOverride(q, state) { if (q.operation === 'select' && q.columns?.includes('total_score') && q.filters.some(f => f.key === 'id'))
                return { data: malformed(state.tables[q.table][0]), error: null }; } });
        const result = await setup[pipeline]();
        assert.equal(result.body.code, 'persistence_uncertain');
        assert.equal(result.body.result, null);
        assert.equal(setup.state.calls.length, 1);
        assert.equal(setup.state.tables['team_ppt_evaluations'][0].status, 'completed');
    });
test('PPT failed cleanup response identity must match the intended record', async () => {
    const setup = presentationSetup({ provider: async () => new Response('', { status: 403 }), queryOverride(q) { if (q.operation === 'update' && q.payload.status === 'failed')
            return { data: [{ id: OTHER }], error: null }; } });
    const result = await setup.ppt();
    assert.equal(result.body.code, 'persistence_uncertain');
    assert.equal(setup.state.tables.team_ppt_evaluations[0].status, 'evaluating');
});
for (const profile of [null, [], { id: OTHER, is_banned: false }, { id: USER, is_banned: true }, { id: USER, is_banned: null }, { id: USER }, { id: USER, is_banned: 'false' }, { id: USER, is_banned: 0 }]) {
    for (const pipeline of ['ppt'])
        test(pipeline + ' rejects unknown/suspended profile ' + JSON.stringify(profile), async () => {
            const f = presentationSetup({ pipeline, queryOverride(q) { if (q.table === 'profiles' && q.columns === 'id, is_banned')
                    return { data: profile, error: null }; } });
            const result = await f[pipeline]();
            assert.equal(result.status, 403);
            assert.equal(result.body.result, null);
            assert.equal(f.state.calls.length + f.state.writes.length + f.state.counters.size, 0);
        });
}
for (const pipeline of ['ppt'])
    for (const scenario of ['error', 'throw', 'timeout', 'banned-admin'])
        test(pipeline + ' protected profile ' + scenario, async () => {
            const f = presentationSetup({ pipeline, queryOverride(q) {
                    if (q.table !== 'profiles' || q.columns !== 'id, is_banned')
                        return;
                    if (scenario === 'error')
                        return { data: null, error: { code: '42501', message: PRIVATE } };
                    if (scenario === 'throw')
                        throw Error(PRIVATE);
                    if (scenario === 'timeout')
                        return new Promise(() => { });
                    return { data: { id: USER, role: 'admin', is_banned: true }, error: null };
                } });
            const result = await f[pipeline]();
            assert.equal(result.status, scenario === 'banned-admin' ? 403 : scenario === 'timeout' ? 504 : 503);
            assert.equal(f.state.calls.length + f.state.writes.length + f.state.counters.size, 0);
            assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
        });
for (const pipeline of ['ppt'])
    test(pipeline + ' explicit non-banned member retains evaluation access', async () => {
        const f = presentationSetup({ pipeline }), result = await f[pipeline]();
        assert.equal(result.status, 200);
        assert.equal(f.state.calls.length, 1);
        const gate = f.state.queries.findIndex(q => q.table === 'profiles' && q.columns === 'id, is_banned');
        assert(gate >= 0);
        assert(f.state.queries.slice(0, gate).every(q => q.operation === 'select'));
    });
test('non-banned DB admin keeps PPT exception', async () => {
    const tables = { teams: [{ id: '00000000-0000-4000-8000-000000000004', owner_id: OTHER, team_members: [] }], team_members: [], profiles: [{ id: USER, role: 'admin', is_banned: false }] };
    const ppt = presentationSetup({ tables });
    assert.equal((await ppt.ppt()).status, 200);
});

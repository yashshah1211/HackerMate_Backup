/* eslint-disable @typescript-eslint/no-require-imports -- Pure offline presentation regressions. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { harness } = require('./ppt-vision-harness.cjs');
const fixtures = require('../qa/fixtures/descriptions/cases.cjs');
const p = harness().load('src/lib/hackathons/description.ts');
const parse = p.parseHackathonDescription;
// Ignore formatting punctuation only. Every word/number must survive once and
// in order; expected tokens come from the source, not from the parser model.
const words = value => value.match(/[\p{L}\p{N}]+/gu) || [];
const read = sections => Array.from(sections, section => [section.title || '', ...Array.from(section.blocks, block => {
  if (block.kind === 'paragraph') return block.text;
  return Array.from(block.items, item => 'label' in item ? `${item.label}: ${item.text}` : `${item.value ?? ''} ${item.text}`).join(' ');
})].join(' ')).join(' ');

test('exact NASA source words/numbers survive once in the original sequence', () => {
  const sections = parse(fixtures.nasa.description);
  assert.deepEqual(words(read(sections)), words(p.decodeDescriptionEntities(fixtures.nasa.description)));
  assert.deepEqual(Array.from(sections, s => s.title).filter(Boolean), [
    'Two Registrations Are Mandatory', 'Be Part Of The Global NASA Space Apps Community', 'Event Details', 'Stay Connected', 'Ready To Build The Next Frontier?',
  ]);
  const mandatory = sections.find(s => s.title === 'Two Registrations Are Mandatory');
  assert.equal(mandatory.collapsible, false);
  assert.match(p.sectionText(mandatory), /Unstop registration alone is NOT sufficient/);
  const facts = sections.find(s => s.title === 'Event Details').blocks[0].items;
  assert.deepEqual(Array.from(facts, f => f.label), ['Event', 'Theme', 'Dates', 'Venue', 'Organizer']);
  assert.match(facts.at(-1).text, /× CoSiNe/);
  assert.equal(sections.some(s => s.collapsible), false);
});
for (const name of ['moderate', 'short', 'malformed', 'long', 'hiddenWarning', 'devfolio']) {
  test(`${name}: all source words retain their order and multiplicity`, () => {
    assert.deepEqual(words(read(parse(fixtures[name].description))), words(p.decodeDescriptionEntities(fixtures[name].description)));
  });
}
test('interleaved paragraphs, lists and facts remain interleaved; repeated headings survive', () => {
  const source = 'Rules:\nRead first.\n- Alpha\nDates: 12 November\nRead next.\n3. Third\n7. Seventh\nRules:\nFinal instruction.';
  const result = parse(source);
  assert.equal(result.length, 2);
  assert.deepEqual(Array.from(result[0].blocks, b => b.kind), ['paragraph', 'list', 'facts', 'paragraph', 'list']);
  assert.deepEqual(Array.from(result[0].blocks.at(-1).items, i => i.value), [3, 7]);
  assert.deepEqual(words(read(result)), words(source));
});
test('years, decimals, C++, trailing C# and keyword-prefix prose are not discarded', () => {
  const source = '2026 is the event year.\n3.14 is pi.\nRules apply to everyone.\nEligibility is checked later.\nC++\n## Build with C#';
  const result = parse(source);
  assert.match(read(result), /2026 is the event year/);
  assert.match(read(result), /3.14 is pi/);
  assert.equal(result.at(-1).title, 'Build with C#');
  assert.deepEqual(words(read(result)), words(source));
});
test('metadata recognizes complete labels and does not extract them from uncertain prose', () => {
  const source = 'Event Dates: 14–15 November 2026 Venue: Campus lab';
  const result = parse(source);
  assert.deepEqual(Array.from(result[0].blocks[0].items, item => item.label), ['Event Dates', 'Venue']);
  assert.deepEqual(words(read(result)), words(source));
  assert.equal(parse('Ask about Dates: tomorrow Venue: somewhere.')[0].blocks[0].kind, 'paragraph');
});
test('entities decode consistently without mounting encoded markup', () => {
  const output = p.descriptionText('&times; &rarr; &amp; &eacute; &#8377; &#x1F680; &amp;times; &lt;img onerror=alert(1)&gt;');
  assert.equal(output, '× → & é ₹ 🚀 × <img onerror=alert(1)>');
  assert.equal(p.descriptionText('A &notAnEntity; B &copycat'), 'A &notAnEntity; B &copycat');
});
test('HTML transports heading/list structure and anchor destinations without execution', () => {
  const output = parse('<h2>Schedule</h2><ol start="3"><li>Briefing</li><li value="7">Demo</li></ol><p><a href="https://example.org?a=1&amp;b=2">Apply</a></p>');
  assert.equal(output[0].title, 'Schedule');
  assert.deepEqual(Array.from(output[0].blocks[0].items, i => i.value), [3, 7]);
  assert.match(read(output), /Apply \(https:\/\/example.org\?a=1&b=2\)/);
  assert.equal(p.descriptionText('<p title="a > b">Keep this.</p>'), 'Keep this.');
  assert.equal(p.descriptionText('<a data-href="https://wrong.org" href="https://right.org">Apply</a>'), 'Apply (https://right.org)');
  assert.equal(p.descriptionText('<a href="https://example.org">Unclosed anchor'), '<a href="https://example.org">Unclosed anchor');
});
test('URLs are limited to HTTP(S), reject credentials, controls and backslashes', () => {
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', '//example.org', 'https://user:pass@example.org', 'https:\\example.org', 'https://example.org\n.evil', 'http://', 'mailto:a@b.com']) assert.equal(p.safeDescriptionUrl(unsafe), null, unsafe);
  assert.equal(p.safeDescriptionUrl('https://example.org/a?x=1&y=2'), 'https://example.org/a?x=1&y=2');
  const source = 'See (https://example.org/a_(b)). Then https://example.org/end!';
  const inline = p.descriptionInlines(source);
  assert.equal(Array.from(inline, i => i.text).join(''), source);
  assert.deepEqual(Array.from(inline).filter(i => i.href).map(i => i.text), ['https://example.org/a_(b)', 'https://example.org/end']);
});
test('critical instructions remain visible after long secondary details without moving sections', () => {
  const result = parse(fixtures.long.description);
  assert.equal(result.filter(s => s.collapsible).length, 2);
  for (const title of ['Registration', 'Eligibility', 'Important Notes']) assert.equal(result.find(s => s.title === title).collapsible, false);
  assert.equal(parse(fixtures.hiddenWarning.description).find(s => s.title === 'Judging Criteria').collapsible, false);
  for (const instruction of ['No travel reimbursement.', 'Open to residents only.', 'Bring a laptop.', 'Dates: 12/11/2026', 'https://example.org/form', 'Age 18+', '- Carry identification.', 'जमा करने की अंतिम तिथि 12 नवंबर है।']) {
    const source = fixtures.long.description.replace('Judging Criteria:', 'Judging Criteria:\n' + instruction);
    assert.equal(parse(source).find(s => s.title === 'Judging Criteria').collapsible, false, instruction);
  }
});
test('empty and formatting-only sources have intentional empty states', () => {
  for (const input of [null, undefined, '', '  ', fixtures.empty.description, '\u200B']) assert.equal(parse(input).length, 0);
});
test('large unstructured and malformed text is preserved without pathological processing', () => {
  const source = 'Rules apply to everyone. C++ and C# are welcome; bring ideas. '.repeat(5000) + '<a href="broken';
  const start = performance.now();
  const result = parse(source);
  assert.deepEqual(words(read(result)), words(source));
  assert(performance.now() - start < 3000, '300KB description should parse within a generous 3s bound');
  const malformed = '<a href="https://example.org">Unclosed '.repeat(5000);
  const mark = performance.now();
  assert.equal(p.descriptionText(malformed), malformed.trim());
  assert(performance.now() - mark < 3000, 'repeated unclosed anchors should not cause quadratic scans');
});

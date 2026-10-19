/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-module tests, matching existing portal tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { load } = require('./event-series-harness.cjs');
const { approvedWorkshopUrl: validate, HUSTLE_WORKSHOPS: workshops, WORKSHOP_SCHEDULE: schedule } = load('src/lib/partners/hustleCarnivalWorkshops.ts');
const component = load('src/components/partners/HustleCarnivalWorkshops.tsx').default;
const approved = url => ({ url, organizerApproved: true });
const stream = 'https://www.youtube.com/watch?v=abcdefghijk';
const form = 'https://docs.google.com/forms/d/e/fixture-form/viewform';
function render(data = workshops) {
  return new JSDOM(renderToStaticMarkup(React.createElement(component, { workshops: data }))).window.document;
}

test('configuration contains two public simultaneous workshops and no invented links', () => {
  assert.deepEqual(Array.from(workshops, w => w.title), ['Git & GitHub', 'Introduction to AI Tools']);
  assert.equal(schedule.start, '2026-10-24T14:00:00+05:30');
  assert.equal(schedule.end, '2026-10-24T16:00:00+05:30');
  for (const w of workshops) { assert.equal(w.livestream, null); assert.equal(w.certificateForm, null); }
});

test('links require explicit organizer approval, even on recognised hosts', () => {
  for (const kind of ['livestream', 'certificate']) {
    assert.equal(validate(null, kind), null);
    assert.equal(validate({ url: kind === 'livestream' ? stream : form, organizerApproved: false }, kind), null);
    assert.equal(validate({ url: kind === 'livestream' ? stream : form }, kind), null);
  }
});

test('accepts supported official YouTube stream/channel and Google Form formats', () => {
  for (const url of [stream, 'https://youtu.be/abcdefghijk', 'https://youtube.com/live/abcdefghijk', 'https://youtube.com/@fixture-club/live', 'https://youtube.com/channel/UCabcdefghijklmnopqrstuv/live', 'https://youtube.com/c/fixture-club']) assert.equal(validate(approved(url), 'livestream'), url);
  for (const url of [form, 'https://forms.gle/fixture123', 'https://docs.google.com/forms/d/fixture-form/viewform?usp=sharing']) assert.equal(validate(approved(url), 'certificate'), url);
});

test('rejects unsafe, malformed, lookalike, unrelated and cross-kind destinations', () => {
  for (const url of ['', 'not a URL', 'javascript:alert(1)', '//youtube.com/watch?v=abcdefghijk', 'http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://user:pass@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:8443/watch?v=abcdefghijk', 'https://youtube.com/redirect?q=https://evil.test', 'https://youtube.com/watch', 'https://youtu.be/short', 'https://youtube.com/', form]) assert.equal(validate(approved(url), 'livestream'), null, url);
  for (const url of [stream, 'https://forms.gle/', 'https://forms.gle.evil.test/fixture', 'https://docs.google.com/document/d/fixture', 'https://docs.google.com/forms/d/fixture/edit', 'http://forms.gle/fixture', 'https://forms.gle:8443/fixture']) assert.equal(validate(approved(url), 'certificate'), null, url);
});

test('unconfigured page is accessible without identity, registration or certificate collection', () => {
  const doc = render();
  assert.equal(doc.querySelectorAll('article').length, 2);
  assert.equal(doc.querySelectorAll('button[disabled]').length, 4);
  assert.equal(doc.querySelectorAll('form, input, iframe, a[target="_blank"]').length, 0);
  assert.match(doc.body.textContent, /No sign-in or registration required/);
  assert.match(doc.body.textContent, /Both workshops run simultaneously/);
  assert.match(doc.body.textContent, /HackerMate does not generate certificates or collect certificate responses/);
  assert.match(doc.body.textContent, /IST \(UTC\+05:30\)/);
  for (const button of doc.querySelectorAll('button')) assert.ok(doc.getElementById(button.getAttribute('aria-describedby')));
});

test('each action enables independently and renders a safe, named external link', () => {
  const doc = render(workshops.map((w, i) => ({ ...w, livestream: i === 0 ? approved(stream) : approved('javascript:alert(1)'), certificateForm: i === 1 ? approved(form) : null })));
  assert.equal(doc.querySelectorAll('button[disabled]').length, 2);
  assert.equal(doc.querySelectorAll('a[target="_blank"]').length, 2);
  for (const link of doc.querySelectorAll('a[target="_blank"]')) {
    assert.equal(link.rel, 'noopener noreferrer');
    assert.match(link.textContent, /opens in a new tab/);
    assert.ok(doc.getElementById(link.getAttribute('aria-describedby')));
  }
  assert.equal(doc.querySelector('a[href*="youtube"]').href, stream);
  assert.equal(doc.querySelector('a[href*="docs.google"]').href, form);
});

test('route renders offline with workshop-specific metadata; original participation stays disabled', () => {
  const route = load('src/app/partners/hustle-carnival/workshops/page.tsx');
  assert.match(renderToStaticMarkup(route.default()), /Curiosity in/);
  assert.equal(route.metadata.alternates.canonical, '/partners/hustle-carnival/workshops');
  assert.match(route.metadata.title.absolute, /Public Workshops/);
  assert.equal(load('src/lib/partners/hustleCarnival.ts').hustlePublicParticipationEnabled(), false);
});

/* eslint-disable @typescript-eslint/no-require-imports -- Offline tests of the actual pure TypeScript helper. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { harness } = require('./ppt-vision-harness.cjs');
const { examples } = require('./notification-category-fixtures.cjs');
const { classifyNotification, matchesNotificationFilter } = harness().load('src/lib/notificationClassification.ts');

for (const [message, category, label, tone] of examples) {
  test(`notification category and badge agree: ${message}`, () => {
    const classification = classifyNotification(message);
    assert.equal(classification.category, category);
    assert.equal(classification.label, label);
    assert.equal(classification.tone, tone);
    for (const isRead of [true, false, null]) {
      assert.equal(matchesNotificationFilter('all', isRead, classification), true);
      assert.equal(matchesNotificationFilter('unread', isRead, classification), !isRead);
      assert.equal(matchesNotificationFilter('teams', isRead, classification), category === 'teams');
      assert.equal(matchesNotificationFilter('connections', isRead, classification), category === 'connections');
      assert(!(matchesNotificationFilter('teams', isRead, classification) && matchesNotificationFilter('connections', isRead, classification)));
    }
  });
}
test('empty and unrelated words are not category signals', () => {
  for (const message of ['', '   ', 'team', 'connection', 'connectivity restored', 'An invite code expired', 'Joined the newsletter']) {
    const classification = classifyNotification(message);
    assert.equal(classification.category, 'other');
    assert.equal(matchesNotificationFilter('all', false, classification), true);
  }
});
test('drawer and page share classifier, filter, and the classified badge result', () => {
  for (const name of ['src/components/NotificationDrawer.tsx', 'src/app/notifications/page.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert.match(source, /from "@\/lib\/notificationClassification"/);
    assert.doesNotMatch(source, /function classify\(|if \(filter === "teams"\)/);
  }
});

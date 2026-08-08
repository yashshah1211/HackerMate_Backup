const { moderateMessage } = require('../src/lib/safety');

function runSafetyTests() {
  console.log('===========================================================');
  console.log('EMPIRICAL SAFETY MODERATION TEST SUITE');
  console.log('===========================================================');

  const testCases = [
    {
      name: 'Clean Pitch Note',
      input: 'Hey Aaditya! Loved your React and Next.js skills. We are building an SIH 2026 project and would love to connect!',
      shouldPass: true
    },
    {
      name: 'Approved Developer Link (GitHub & Figma)',
      input: 'Check out my portfolio at https://github.com/myuser and designs at https://figma.com/file/sample',
      shouldPass: true
    },
    {
      name: 'Vulgarity / Hindi Profanity',
      input: 'Hey chutiya join my team bhenchod',
      shouldPass: false
    },
    {
      name: 'Obfuscated Leetspeak Profanity',
      input: 'Hey f*ck off sh!t',
      shouldPass: false
    },
    {
      name: 'Unapproved / Harmful Domain Link',
      input: 'Click here for free prize http://malicious-phishing-site.xyz/login',
      shouldPass: false
    },
    {
      name: 'Executable Malware File Link',
      input: 'Download our pitch deck here https://drive.google.com/file.exe',
      shouldPass: false
    },
    {
      name: 'Obfuscated Link (dot notation)',
      input: 'Check out my site at badsite [dot] com for info',
      shouldPass: false
    },
    {
      name: 'Scam & Telegram Phishing Link',
      input: 'Join our telegram group t.me/scamchannel for free crypto',
      shouldPass: false
    }
  ];

  let passedCount = 0;

  testCases.forEach((tc, idx) => {
    const result = moderateMessage(tc.input);
    const passed = result.isValid === tc.shouldPass;
    if (passed) passedCount++;

    console.log(`\nTest #${idx + 1}: ${tc.name}`);
    console.log(`Input: "${tc.input}"`);
    console.log(`Result: ${result.isValid ? '✅ ALLOWED' : '❌ BLOCKED'}`);
    if (!result.isValid) {
      console.log(`Blocked Reason: ${result.error}`);
    }
  });

  console.log('\n===========================================================');
  console.log(`Passed ${passedCount}/${testCases.length} safety test cases.`);
  console.log('===========================================================');

  if (passedCount !== testCases.length) {
    throw new Error('Safety test cases failed!');
  }
}

runSafetyTests();

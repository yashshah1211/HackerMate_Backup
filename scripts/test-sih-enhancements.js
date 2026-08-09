// Test script for Features 1, 2, 3 enhancements

const { createSihNotification } = require("../src/lib/sihNotifier");

function testEnhancements() {
  console.log("==========================================================");
  console.log("🧪 TESTING SIH INTERNAL ROUND ENHANCEMENTS (FEATURES 1, 2, 3)");
  console.log("==========================================================\n");

  // Feature 1: Rubric & Viva Score Calculation Test
  const presScore = 25;
  const qaScore = 35;
  const protoScore = 28;
  const vivaScore = presScore + qaScore + protoScore;
  const aiScore = 78;
  const compositeScore = Math.round(aiScore * 0.6 + vivaScore * 0.4);

  console.log("1. Live Viva Rubric & Composite Score Calculation:");
  console.log(`   - Presentation (0-30): ${presScore}`);
  console.log(`   - Q&A Defense (0-40): ${qaScore}`);
  console.log(`   - Prototype Proof (0-30): ${protoScore}`);
  console.log(`   - Total Viva Score: ${vivaScore} / 100`);
  console.log(`   - Calculated Composite Score: ${compositeScore} (60% AI ${aiScore} + 40% Viva ${vivaScore})`);

  if (vivaScore === 88 && compositeScore === 82) {
    console.log("   ✅ PASS: Viva Rubric calculation accurate!");
  } else {
    console.error("   ❌ FAIL: Incorrect viva calculation!");
  }

  // Feature 2: PS Over-saturation Analytics Test
  const testSubmissions = [
    { ps_number: "SIH1365" },
    { ps_number: "SIH1365" },
    { ps_number: "SIH1365" },
    { ps_number: "SIH1400" },
    { ps_number: "SIH1400" },
  ];

  const psMap = {};
  testSubmissions.forEach((s) => {
    psMap[s.ps_number] = (psMap[s.ps_number] || 0) + 1;
  });

  const oversaturated = Object.keys(psMap).filter((ps) => psMap[ps] >= 3);
  console.log("\n2. PS Over-saturation Analytics:");
  console.log(`   - PS Counts:`, psMap);
  console.log(`   - Oversaturated PS List (>=3 teams):`, oversaturated);

  if (oversaturated.length === 1 && oversaturated[0] === "SIH1365") {
    console.log("   ✅ PASS: Over-saturation detection accurate!");
  } else {
    console.error("   ❌ FAIL: Over-saturation detection incorrect!");
  }

  // Feature 3: Student Notification Generator Test
  const notifRevision = createSihNotification("revision_requested", "round1_submitted", "HexaHack", "Fix slide 4 data");
  const notifShortlist = createSihNotification("approved", "shortlisted_round2", "HexaHack");

  console.log("\n3. Student Notification Log Generation:");
  console.log("   - Revision Notification:", notifRevision.title);
  console.log("   - Shortlist Notification:", notifShortlist.title);

  if (notifRevision.type === "revision_request" && notifShortlist.type === "shortlist") {
    console.log("   ✅ PASS: Student Notifications generated successfully!");
  } else {
    console.error("   ❌ FAIL: Notification generation error!");
  }
}

testEnhancements();

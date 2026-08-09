// Test script verifying pitch deck URL security sanitization

function testPptDeckSanitization() {
  console.log("==========================================================");
  console.log("🔒 TESTING PITCH DECK URL SECURITY SANITIZATION");
  console.log("==========================================================\n");

  const mockSubmission = {
    id: "sub_123",
    ppt_url: "https://docs.google.com/presentation/d/12345/edit",
    github_url: "https://github.com/test/repo",
    demo_url: "https://demo.example.com",
    teams: {
      owner_id: "user_owner_1",
      team_members: [{ user_id: "user_member_2" }],
    },
  };

  function sanitizeForUser(sub, userId, isSpocAuthorized) {
    const isOwner = sub.teams?.owner_id === userId;
    const isMember = sub.teams?.team_members?.some((m) => m.user_id === userId);
    const isPrivileged = isSpocAuthorized || isOwner || isMember;

    return {
      ...sub,
      ppt_url: isPrivileged ? sub.ppt_url : null,
      github_url: isPrivileged ? sub.github_url : null,
      demo_url: isPrivileged ? sub.demo_url : null,
    };
  }

  // 1. Authorized SPOC / Jury Member
  const spocView = sanitizeForUser(mockSubmission, "user_spoc_99", true);
  console.log("1. SPOC / Jury Member View:");
  console.log("   - PPT URL:", spocView.ppt_url);
  if (spocView.ppt_url === mockSubmission.ppt_url) {
    console.log("   ✅ PASS: SPOC can view PPT deck URL!");
  } else {
    console.error("   ❌ FAIL: SPOC blocked!");
  }

  // 2. Team Member View
  const memberView = sanitizeForUser(mockSubmission, "user_member_2", false);
  console.log("\n2. Team Member View:");
  console.log("   - PPT URL:", memberView.ppt_url);
  if (memberView.ppt_url === mockSubmission.ppt_url) {
    console.log("   ✅ PASS: Team member can view own PPT deck URL!");
  } else {
    console.error("   ❌ FAIL: Team member blocked!");
  }

  // 3. Public Visitor / Non-Teammate / Un-allowlisted View
  const visitorView = sanitizeForUser(mockSubmission, "user_stranger_7", false);
  console.log("\n3. External Visitor / Non-Teammate View:");
  console.log("   - PPT URL:", visitorView.ppt_url);
  if (visitorView.ppt_url === null && visitorView.github_url === null) {
    console.log("   ✅ PASS: External visitor PPT URL is strictly sanitized to NULL!");
  } else {
    console.error("   ❌ FAIL: PPT URL leaked to external visitor!");
  }
}

testPptDeckSanitization();

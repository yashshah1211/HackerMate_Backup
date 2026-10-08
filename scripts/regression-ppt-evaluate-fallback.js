// Regression Test: PPT Evaluate Fallback Logic
// Tests if the error handling correctly catches track_id missing columns (42703 & PGRST204)
// and properly ignores other unrelated errors.

function testFallbackCondition(insertErr) {
  if (insertErr && (insertErr.code === "42703" || insertErr.code === "PGRST204") && insertErr.message?.includes("track_id")) {
    return true; // Fallback triggered
  }
  return false; // Fallback NOT triggered
}

console.log("==========================================");
console.log("🧪 RUNNING REGRESSION TEST: PPT EVALUATE FALLBACK LOGIC");
console.log("==========================================");

let failed = false;

const cases = [
  {
    name: "Success (No error)",
    error: null,
    expected: false
  },
  {
    name: "Postgres 42703 missing track_id",
    error: { code: "42703", message: "column team_ppt_evaluations.track_id does not exist" },
    expected: true
  },
  {
    name: "PostgREST PGRST204 missing track_id",
    error: { code: "PGRST204", message: "Could not find the column 'track_id' in 'team_ppt_evaluations'" },
    expected: true
  },
  {
    name: "Unrelated Postgres 42703 missing some_other_column",
    error: { code: "42703", message: "column team_ppt_evaluations.some_other_column does not exist" },
    expected: false
  },
  {
    name: "Unrelated PostgREST PGRST204 missing some_other_column",
    error: { code: "PGRST204", message: "Could not find the column 'some_other_column' in 'team_ppt_evaluations'" },
    expected: false
  },
  {
    name: "Unrelated RLS error (42501)",
    error: { code: "42501", message: "new row violates row-level security policy for table \"team_ppt_evaluations\"" },
    expected: false
  }
];

cases.forEach(testCase => {
  const result = testFallbackCondition(testCase.error);
  if (result === testCase.expected) {
    console.log(`✅ PASS: ${testCase.name}`);
  } else {
    console.error(`❌ FAIL: ${testCase.name}. Expected ${testCase.expected}, got ${result}`);
    failed = true;
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log("==========================================");
  console.log("🎉 ALL TESTS PASSED: Fallback logic is robust.");
  console.log("==========================================");
}

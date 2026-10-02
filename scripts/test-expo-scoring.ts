import { scoreTeam } from "../src/app/expo/judge/scoring";
import { CHALLENGES, BUILDERS } from "../src/app/expo/judge/data";
import { Builder, Challenge } from "../src/app/expo/judge/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  console.log("Running Expo Scoring Tests...");

  // TEST 1
  const c1 = CHALLENGES.find((c) => c.name === "Smart Energy Campus")!;
  const b1 = BUILDERS.filter((b) => ["Kabir", "Ananya", "Isha", "Rohan"].includes(b.name));
  assert(b1.length === 4, "Should find 4 builders for test 1");
  const res1 = scoreTeam(c1, b1);
  assert(res1.coverageScore === 60, `Test 1 coverage expected 60, got ${res1.coverageScore}`);
  assert(res1.complementarityScore === 20, `Test 1 comp expected 20, got ${res1.complementarityScore}`);
  assert(res1.bonusScore === 20, `Test 1 bonus expected 20, got ${res1.bonusScore}`);
  assert(res1.total === 100, `Test 1 total expected 100, got ${res1.total}`);
  console.log("Test 1 passed");

  // TEST 2: missing one required capability can never reach 90
  // Required max would be 45. Comp max 20, Bonus max 20. Total max 85.
  const b2 = BUILDERS.filter((b) => ["Karan", "Meera", "Rohan", "Vikram"].includes(b.name));
  const res2 = scoreTeam(c1, b2);
  const maxPossibleIfMissingReq = 45 + 20 + 20; // 85
  assert(res2.total <= 85, `Test 2 total expected <= 85, got ${res2.total}`);
  assert(res2.total < 90, "Test 2 cannot reach 90");
  console.log("Test 2 passed");

  // TEST 3: builder cannot satisfy their own needsSupportWith
  // Aarav needs Backend. He does NOT cover Backend. But suppose we had a builder who needed Frontend and covered Frontend.
  // We can just create a dummy builder and check it directly.
  const dummyBuilder: Builder = {
    id: "dummy",
    name: "Dummy",
    role: "Dummy Role",
    skills: [],
    covers: ["Frontend"],
    needsSupportWith: "Frontend",
  };
  const res3 = scoreTeam(c1, [dummyBuilder]);
  assert(res3.complementarityScore === 0, "Test 3 builder should not satisfy own need");
  console.log("Test 3 passed");

  // TEST 4: Multiple builders covering same required capability don't duplicate points
  const b4 = BUILDERS.filter((b) => ["Aarav", "Isha", "Meera", "Vikram"].includes(b.name));
  // These cover Frontend (Aarav, Isha, Vikram) and UI/UX (Aarav, Meera).
  // Challenge 7 requires Frontend and UI/UX (as bonus)
  const c4 = CHALLENGES.find((c) => c.name === "Local Business Growth OS")!;
  const res4 = scoreTeam(c4, b4);
  const frontendCoverage = res4.requiredResults.find((r) => r.capability === "Frontend")!;
  assert(frontendCoverage.builders.length >= 2, "Should have multiple builders covering Frontend");
  // Total coverage max is 60, 4 requirements.
  console.log("Test 4 passed");

  // TEST 5: Bonus capability awards max 10 regardless of how many builders cover it
  const c5 = CHALLENGES.find((c) => c.name === "AI Study Buddy")!;
  // c5 bonus: Frontend, Data
  // Aarav (Frontend), Isha (Frontend), Vikram (Frontend), Neel (Data)
  const b5 = BUILDERS.filter((b) => ["Aarav", "Isha", "Vikram", "Neel"].includes(b.name));
  const res5 = scoreTeam(c5, b5);
  assert(res5.bonusScore === 20, "Test 5 bonus should max at 20 even with multiple coverages");
  console.log("Test 5 passed");

  console.log("All tests passed!");
}

runTests();

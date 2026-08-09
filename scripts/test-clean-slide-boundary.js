// Test clean slide boundary detection algorithm

const fs = require("fs");

function cleanSegmentSlides(rawText) {
  if (!rawText || !rawText.trim()) return [];

  // 1. Normalize vertical tabs \u000b and form feeds \f to explicit slide break marker \f
  let text = rawText.replace(/[\u000b\f]+/g, "\f").replace(/\r\n/g, "\n");

  // 2. Replace SIH template footer transitions with \f
  text = text.replace(/\n+\s*(?:\d{1,2}\s*\n+)?@SIH[^\n]*\n+(?:Your Team Name[^\n]*\n+)?(?:\d{1,2}\s*\n+)?/gi, "\f");

  // 3. Replace "Slide 1:", "Slide 2:", etc. with \f Slide 1:
  text = text.replace(/(?=\n\s*Slide\s*\d+[:.\s])/gi, "\f");

  // 4. Split on \f
  const chunks = text.split(/\f+/).map((s) => s.trim()).filter(Boolean);

  // 5. Filter out empty or non-content chunks
  const validSlides = chunks.filter((chunk) => {
    const cleaned = chunk
      .replace(/^@SIH[^\n]*/gm, "")
      .replace(/^Your Team Name/gm, "")
      .replace(/^\d{1,2}$/gm, "")
      .trim();
    return cleaned.length > 10;
  });

  return validSlides;
}

async function testCleanBoundary() {
  console.log("==========================================================");
  console.log("🧪 TESTING ACCURATE SLIDE BOUNDARY DETECTION");
  console.log("==========================================================\n");

  // Test 1: Real HexaHack Google Slides link (Expected: 8 slides)
  const hexahackUrl = "https://docs.google.com/presentation/d/1-tKMTCeT3xmbGU8GQ8qFf5VesQHMowHo19unnX2Ed2s/export/txt";
  const res = await fetch(hexahackUrl);
  const hexahackRaw = await res.text();
  const hexahackSlides = cleanSegmentSlides(hexahackRaw);

  console.log(`[HexaHack Real Submission] Detected Slide Count: ${hexahackSlides.length} (Target: 8)`);
  hexahackSlides.forEach((slide, idx) => {
    const firstLine = slide.split("\n")[0].slice(0, 70);
    console.log(`  • Slide ${idx + 1}: "${firstLine}" (${slide.length} chars)`);
  });

  // Test 2: Strong 6-slide deck text (Expected: 6 slides)
  const strongText = `
Slide 1: Title Page. • PS ID: SIH1724 | PS Title: Smart Traffic Management System | Category: Software | Theme: Smart Automation | Team ID: UNISQUAD-2026 | Team Name: Unisquad | College: D.J. Sanghvi College of Engineering (DJSCE).
Slide 2: Proposed Solution & Innovation. • Our innovation leverages real-time computer vision at edge traffic intersections to dynamically adjust signal timing based on vehicle density.
Slide 3: Technical Approach. • Stack: Next.js 16, Supabase PostgreSQL, FastAPI, YOLOv8 edge model on NVIDIA Jetson Nano.
Slide 4: Feasibility and Viability. • High feasibility with low hardware cost. Technical Risks: Camera occlusion & network latency.
Slide 5: Impact and Benefits. • Target Audience: Municipal Traffic Departments. Benefits: 42% congestion reduction.
Slide 6: Research and References. • IEEE Paper on Edge Computer Vision (2024), COCO Dataset, Ultralytics YOLOv8 Documentation.
  `;

  const strongSlides = cleanSegmentSlides(strongText);
  console.log(`\n[Strong 6-Slide Deck] Detected Slide Count: ${strongSlides.length} (Target: 6)`);
  strongSlides.forEach((slide, idx) => {
    const firstLine = slide.split("\n")[0].slice(0, 70);
    console.log(`  • Slide ${idx + 1}: "${firstLine}" (${slide.length} chars)`);
  });
}

testCleanBoundary();

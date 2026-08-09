// Test slide segmenter and evaluator on HexaHack's real extracted text

const { extractPresentationText } = require("../src/lib/sihPresentationExtractor");
const { generateHeuristicEvaluation } = require("../src/lib/sihEvaluator");

function parseAndSegmentSlides(rawText) {
  // 1. If text already has [Slide N] markers, return sanitized
  if (/\[Slide\s*\d+\]/i.test(rawText)) {
    return rawText;
  }

  // 2. Form feed split (\f)
  let rawSlides = rawText.split(/\f+/).map((s) => s.trim()).filter(Boolean);

  // 3. Fallback: Split on SIH Template footer markers (e.g. "\n2\n@SIH Idea submission" or "\n3\n")
  if (rawSlides.length <= 1) {
    // Split by slide footer number pattern: e.g. "\n2\n@SIH" or "\n\d+\n@SIH" or double newline with trailing slide number
    const footerRegex = /\n+\s*(\d+)\s*\n+@SIH[^\n]*\n+[^\n]*\n+\1\s*\n+/gi;
    const splitParts = rawText.split(footerRegex);
    
    // Alternative footer split
    if (splitParts.length <= 1) {
      const altRegex = /\n+\s*(\d+)\s*\n+@SIH[^\n]*\n+/gi;
      const altParts = rawText.split(altRegex);
      if (altParts.length > 1) {
        rawSlides = [];
        for (let i = 0; i < altParts.length; i += 2) {
          const content = altParts[i]?.trim();
          if (content) rawSlides.push(content);
        }
      }
    } else {
      rawSlides = [];
      for (let i = 0; i < splitParts.length; i += 2) {
        const content = splitParts[i]?.trim();
        if (content) rawSlides.push(content);
      }
    }
  }

  // 4. Fallback: Split on major uppercase SIH headings (TITLE PAGE, IDEA TITLE, TECHNICAL APPROACH, FEASIBILITY, IMPACT, RESEARCH)
  if (rawSlides.length <= 1) {
    const headingRegex = /(?=\n\s*(?:TITLE PAGE|IDEA TITLE|PROPOSED SOLUTION|TECHNICAL APPROACH|FEASIBILITY AND VIABILITY|IMPACT AND BENEFITS|RESEARCH AND REFERENCES|IMPORTANT INSTRUCTIONS)\b)/i;
    rawSlides = rawText.split(headingRegex).map((s) => s.trim()).filter(Boolean);
  }

  if (rawSlides.length <= 1) {
    return rawText;
  }

  return rawSlides.map((slideContent, idx) => `[Slide ${idx + 1}]\n${slideContent}`).join("\n\n");
}

async function runHexahackAudit() {
  const pptUrl = "https://docs.google.com/presentation/d/1-tKMTCeT3xmbGU8GQ8qFf5VesQHMowHo19unnX2Ed2s/edit?slide=id.p1#slide=id.p1";
  const rawText = await extractPresentationText(pptUrl);

  console.log("==========================================================");
  console.log("🛠️   HEXAHACK REAL SUBMISSION FORMAT AUDIT");
  console.log("==========================================================\n");

  const segmentedText = parseAndSegmentSlides(rawText);
  console.log("--- SEGMENTED SLIDE TEXT ---");
  console.log(segmentedText);

  const mockSub = {
    id: "81233b10-a01e-4ab5-877c-b835d84d0ab9",
    ps_number: "SIH1365",
    ps_title: "Automated Railway Platform Announcement System with Indian Sign Language Video",
    ps_category: "Software",
    theme: "Accessibility",
    ppt_url: pptUrl,
    github_url: null,
    demo_url: null,
  };

  const evalRes = generateHeuristicEvaluation(mockSub, 6, true, segmentedText);

  console.log("\n==================== [EVALUATION RESULT] ====================");
  console.log(`Total Score: ${evalRes.totalScore} | Grade: ${evalRes.grade}`);
  console.log(`Format Violations (${evalRes.formatViolations.length}):`);
  evalRes.formatViolations.forEach((v) => console.log(`  • ${v}`));
  console.log(`\nSPOC Red Flags (${evalRes.spocRedFlags.length}):`);
  evalRes.spocRedFlags.forEach((r) => console.log(`  • ${r}`));
  console.log(`\nSlide Recommendations:`);
  console.log(evalRes.slideRecommendations);
}

runHexahackAudit();

// Test real presentation text extraction on HexaHack's Google Slides link

const { extractPresentationText } = require("../src/lib/sihPresentationExtractor");

async function testExtractor() {
  const pptUrl = "https://docs.google.com/presentation/d/1-tKMTCeT3xmbGU8GQ8qFf5VesQHMowHo19unnX2Ed2s/edit?slide=id.p1#slide=id.p1";
  console.log("==========================================================");
  console.log("📄 TESTING EXTRACTOR ON HEXAHACK REAL PRESENTATION LINK");
  console.log("==========================================================\n");

  const extracted = await extractPresentationText(pptUrl);

  console.log(`[Extracted Text Length]: ${extracted.length} chars`);
  console.log(`\n==================== [RAW EXTRACTED TEXT START] ====================`);
  console.log(extracted);
  console.log(`==================== [RAW EXTRACTED TEXT END] ====================\n`);
}

testExtractor();

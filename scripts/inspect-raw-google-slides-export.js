// Inspect exact raw text returned by Google Slides export for HexaHack presentation

async function inspectRawText() {
  const exportTxtUrl = "https://docs.google.com/presentation/d/1-tKMTCeT3xmbGU8GQ8qFf5VesQHMowHo19unnX2Ed2s/export/txt";
  const res = await fetch(exportTxtUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Extractor/1.0",
    },
  });

  const rawText = await res.text();

  console.log("==========================================================");
  console.log("📄 EXACT RAW TEXT FROM GOOGLE SLIDES EXPORT/TXT");
  console.log("==========================================================\n");

  console.log(`Length: ${rawText.length} chars`);
  console.log(`Contains \\f (form-feed): ${rawText.includes("\f")}`);
  console.log(`Form feed count: ${rawText.split("\f").length - 1}`);

  console.log("\n--- RAW TEXT WITH VISIBLE ESCAPED FORM-FEEDS (\\f) ---");
  console.log(JSON.stringify(rawText));

  console.log("\n--- FORM FEED SPLIT PIECES ---");
  const ffPieces = rawText.split(/\f+/);
  ffPieces.forEach((p, idx) => {
    console.log(`\n=== PIECE ${idx + 1} (${p.length} chars) ===`);
    console.log(p.trim());
  });
}

inspectRawText();

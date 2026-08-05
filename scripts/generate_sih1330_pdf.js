const { jsPDF } = require("jspdf");
const fs = require("fs");
const path = require("path");

function generateSIH1330PDF() {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });

  const pageWidth = 792;
  const pageHeight = 612;

  // Slide 1: Title & Overview
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SMART INDIA HACKATHON 2026 • OFFICIAL PITCH DECK", 40, 50);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("SIH1330: AI Multilingual Audio Tour Guide & Monument Recognition", 40, 90);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Ministry of Tourism & Culture • Archaeological Survey of India (ASI)", 40, 115);

  doc.setFillColor(22, 27, 34);
  doc.roundedRect(40, 150, 712, 380, 8, 8, "FD");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Team: HackerMate Squad | Category: Software Edition", 65, 190);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text("• Team Leader: Yash Shah (Full-Stack & Cloud Systems Architect)", 65, 230);
  doc.text("• AI & Computer Vision Lead: Computer Vision Engineer (YOLOv8 & ResNet-50)", 65, 260);
  doc.text("• Mobile App Developer: React Native / AR Camera Lead", 65, 290);
  doc.text("• Speech & Vernacular Lead: BHASHINI API & Neural TTS Engineer", 65, 320);
  doc.text("• UI/UX & Accessibility Lead: Female Teammate (Mandatory SIH Rule Compliant)", 65, 350);
  doc.text("• QA & Pitch Presenter: Live Demo Video & ASI Documentation Lead", 65, 380);

  // Footer Slide 1
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 1 of 6 • HackerMate Mock SIH 2026", 40, 580);

  // Slide 2: Problem & Solution
  doc.addPage("landscape");
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SLIDE 2: PROBLEM STATEMENT & PROPOSED SOLUTION", 40, 50);

  doc.setTextColor(239, 68, 68);
  doc.setFontSize(16);
  doc.text("The Core Problem", 40, 95);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text("1. Language Barriers: Tourists face communication gaps at heritage sites due to lack of multilingual guides.", 40, 120);
  doc.text("2. Unverified Guide Scams: Visitors are overcharged by unregistered guides providing unverified history.", 40, 140);
  doc.text("3. Artifact Identification Deficit: Museum visitors cannot identify specific temple carvings or museum artifacts.", 40, 160);

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Our Solution: SanskritiAI App", 40, 210);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text("• Point smartphone camera at any monument/carving -> Instant Computer Vision Identification.", 40, 235);
  doc.text("• Streaming Neural Audio Tour in 12+ Indian & International languages powered by BHASHINI AI.", 40, 255);
  doc.text("• Spatial Geo-fencing & Indoor BLE Beacon triggers for seamless room-by-room audio playback.", 40, 275);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 2 of 6 • HackerMate Mock SIH 2026", 40, 580);

  // Slide 3: Technical Architecture
  doc.addPage("landscape");
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SLIDE 3: TECHNICAL ARCHITECTURE & DATA FLOW", 40, 50);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("• Computer Vision Engine: Custom YOLOv8 + ResNet50 trained on 10,000+ ASI monument images.", 40, 95);
  doc.text("• Speech & Translation: BHASHINI AI APIs + Neural Text-to-Speech (TTS) for natural vernacular voices.", 40, 125);
  doc.text("• Spatial Positioning: GPS Geo-fencing + BLE Beacons for zero-latency room audio triggers.", 40, 155);
  doc.text("• Cloud & DB Stack: FastAPI + PostgreSQL (PostGIS) on Supabase + SQLite for offline audio caching.", 40, 185);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 3 of 6 • HackerMate Mock SIH 2026", 40, 580);

  // Slide 4: 36h Roadmap
  doc.addPage("landscape");
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SLIDE 4: FEASIBILITY & 36-HOUR HACKATHON ROADMAP", 40, 50);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("• 00h - 12h: ASI Monument dataset curation, YOLOv8 fine-tuning, Supabase PostGIS schema.", 40, 95);
  doc.text("• 12h - 24h: Mobile UI AR camera overlay, BHASHINI Vernacular Audio API integration.", 40, 125);
  doc.text("• 24h - 32h: Offline SQLite audio caching, BLE beacon simulator, accessibility voice-over.", 40, 155);
  doc.text("• 32h - 36h: End-to-end stress testing under low lighting, documentation & video pitch.", 40, 185);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 4 of 6 • HackerMate Mock SIH 2026", 40, 580);

  // Slide 5: Impact & Business Model
  doc.addPage("landscape");
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SLIDE 5: IMPACT, BENEFICIARIES & COMMERCIAL VIABILITY", 40, 50);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("• Impact Metrics: 90% cost reduction vs human guides, 98% artifact recognition accuracy, 12+ languages.", 40, 95);
  doc.text("• Primary Beneficiaries: Ministry of Tourism, ASI, Domestic & Foreign Tourists, Visually Impaired Visitors.", 40, 125);
  doc.text("• Commercial Model: B2G ASI White-Label Licensing + B2C In-App Day Pass (Rs 49 / $1 per monument).", 40, 155);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 5 of 6 • HackerMate Mock SIH 2026", 40, 580);

  // Slide 6: Team Composition & SIH Compliance
  doc.addPage("landscape");
  doc.setFillColor(10, 13, 18);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 8, "F");

  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SLIDE 6: TEAM COMPOSITION & SIH COMPLIANCE", 40, 50);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("• Total Team Squad: 6 Members (Strict SIH Rule Satisfied)", 40, 95);
  doc.text("• Female Representation: YES (Mandatory SIH Rule Satisfied)", 40, 125);
  doc.text("• Role Diversity: Full-Stack Leader, Computer Vision Lead, Mobile Lead, Speech Lead, UI/UX Lead, QA Lead", 40, 155);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Slide 6 of 6 • HackerMate Mock SIH 2026", 40, 580);

  const publicDir = path.join(__dirname, "..", "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPath = path.join(publicDir, "sih1330_sample_pitch.pdf");
  const pdfArrayBuffer = doc.output("arraybuffer");
  fs.writeFileSync(outputPath, Buffer.from(pdfArrayBuffer));
  console.log(`[Generated SIH PDF] Saved to ${outputPath}`);
}

generateSIH1330PDF();

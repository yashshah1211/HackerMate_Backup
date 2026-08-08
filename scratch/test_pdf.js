const { jsPDF } = require('jspdf');

try {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('HackerMate SIH 2026 Daily Stats Report', 14, 22);
  doc.setFontSize(12);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  const pdfOutput = doc.output('arraybuffer');
  const buffer = Buffer.from(pdfOutput);
  console.log(`✅ PDF generated successfully! Size: ${buffer.length} bytes`);
} catch (err) {
  console.error('Error generating PDF:', err);
  process.exit(1);
}

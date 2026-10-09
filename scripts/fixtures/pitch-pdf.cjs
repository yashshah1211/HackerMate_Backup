/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic local fixtures, no downloads. */
const { jsPDF } = require('jspdf');

/** A vector architecture slide, raster mockup slide, and text slide.
 * Image-only pages have no text layer; they must survive ingestion with their page numbers.
 */
function makePitchPdf(kind = 'mixed', pageCount = 3) {
  const pdf = new jsPDF({ unit: 'pt', format: [720, 405], compress: true });
  const width = 240, height = 140;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dark = y < 16 || x < 40;
    const card = x > 50 && x < 225 && ((y > 30 && y < 65) || (y > 80 && y < 115));
    const offset = (y * width + x) * 4;
    data.set(dark ? [30, 50, 80, 255] : card ? [180, 215, 245, 255] : [245, 245, 245, 255], offset);
  }
  const image = { data, width, height };
  for (let index = 0; index < pageCount; index++) {
    if (index) pdf.addPage();
    if (kind === 'images' || (kind === 'mixed' && index === 1)) {
      // Raster-only illustrative prototype placeholder, not implementation proof.
      pdf.addImage(image, 'RGBA', 40, 40, 640, 300);
    } else if (kind === 'mixed' && index === 0) {
      pdf.setFontSize(22); pdf.text('Architecture: client to API to database', 30, 35);
      for (const [x, text] of [[40, 'Client'], [280, 'API'], [520, 'Postgres']]) {
        pdf.rect(x, 120, 140, 70); pdf.text(text, x + 12, 158);
      }
      pdf.line(180, 155, 280, 155); pdf.line(420, 155, 520, 155);
    } else {
      pdf.setFontSize(22); pdf.text(`Problem and solution - page ${index + 1}`, 30, 35);
      pdf.setFontSize(14); pdf.text('Users wait 10 minutes. Our proposed solution reduces manual work by 30%.', 30, 80);
      pdf.text('Validation: mockup only. Risks: latency and database availability.', 30, 110);
    }
  }
  return Buffer.from(pdf.output('arraybuffer'));
}
module.exports = { makePitchPdf };

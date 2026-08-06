const path = require('path');
const sharp = require('c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/node_modules/sharp');

async function processLogos() {
  const orvixPath = 'c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/orvix-logo.jpg';
  const nimbluxPath = 'c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/nimblux-logo.jpg';

  // 1. Process Orvix Logo (crop black padding)
  const orvixMeta = await sharp(orvixPath).metadata();
  console.log("Original Orvix dimensions:", orvixMeta.width, "x", orvixMeta.height);

  // Trim black background around Orvix logo
  await sharp(orvixPath)
    .trim({ threshold: 25 }) // automatically crops matching background pixels
    .toFile('c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/orvix-logo-cropped.png');

  const croppedMeta = await sharp('c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/orvix-logo-cropped.png').metadata();
  console.log("Cropped Orvix dimensions:", croppedMeta.width, "x", croppedMeta.height);

  // 2. Process Nimblux Logo (crop light grey padding)
  const nimbluxMeta = await sharp(nimbluxPath).metadata();
  console.log("Original Nimblux dimensions:", nimbluxMeta.width, "x", nimbluxMeta.height);

  await sharp(nimbluxPath)
    .trim({ threshold: 25 })
    .toFile('c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/nimblux-logo-cropped.png');

  const croppedNimbluxMeta = await sharp('c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/public/partners/nimblux-logo-cropped.png').metadata();
  console.log("Cropped Nimblux dimensions:", croppedNimbluxMeta.width, "x", croppedNimbluxMeta.height);
}

processLogos().catch(console.error);

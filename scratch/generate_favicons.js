const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const appDir = path.join(__dirname, '..', 'src', 'app');

// High precision SVG mark for HackerMate
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#09090b"/>
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#22d3ee" stroke-width="12" stroke-opacity="0.35"/>
  <g transform="translate(70, 60)" fill="none" stroke="#22d3ee" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="120" cy="120" r="95"/>
    <circle cx="120" cy="120" r="38" fill="#22d3ee" stroke="none"/>
    <line x1="200" y1="200" x2="360" y2="40"/>
    <line x1="300" y1="95" x2="350" y2="45"/>
    <line x1="350" y1="45" x2="390" y2="85"/>
  </g>
  <g transform="translate(235, 235)">
    <polygon points="0,0 0,180 52,138 85,214 128,195 95,123 152,123" fill="#09090b" stroke="#a3e635" stroke-width="24" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>
`;

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#09090b"/>
  <!-- Glowing background gradient -->
  <circle cx="200" cy="200" r="400" fill="#22d3ee" opacity="0.08" filter="blur(60px)"/>
  <circle cx="1000" cy="450" r="400" fill="#a3e635" opacity="0.08" filter="blur(60px)"/>
  <rect x="40" y="40" width="1120" height="550" rx="32" fill="none" stroke="#27272a" stroke-width="2"/>
  
  <!-- Logo Icon -->
  <g transform="translate(100, 195)">
    <g transform="translate(0, 0)" fill="none" stroke="#22d3ee" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="48"/>
      <circle cx="60" cy="60" r="19" fill="#22d3ee" stroke="none"/>
      <line x1="100" y1="100" x2="180" y2="20"/>
      <line x1="150" y1="48" x2="175" y2="23"/>
      <line x1="175" y1="23" x2="195" y2="43"/>
    </g>
    <g transform="translate(118, 118)">
      <polygon points="0,0 0,90 26,69 43,107 64,98 48,62 76,62" fill="#09090b" stroke="#a3e635" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
    </g>
  </g>

  <!-- Typography -->
  <text x="340" y="275" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="76" letter-spacing="-2" fill="#ffffff">HACKER<tspan fill="#a3e635">MATE</tspan></text>
  <text x="340" y="345" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="32" letter-spacing="0" fill="#22d3ee">Team Operating System &amp; Builder Platform</text>
  <text x="340" y="405" font-family="system-ui, -apple-system, sans-serif" font-weight="400" font-size="22" fill="#a1a1aa">Find teammates by skill • Match for live hackathons • Real-time workspaces</text>
  
  <!-- URL Tag -->
  <rect x="340" y="445" width="220" height="44" rx="22" fill="#18181b" stroke="#27272a" stroke-width="1"/>
  <text x="450" y="473" font-family="monospace" font-weight="700" font-size="18" fill="#a3e635" text-anchor="middle">hackermate.in ↗</text>
</svg>
`;

async function generateAssets() {
  console.log('Generating high-res favicons and icons...');

  fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg);
  fs.writeFileSync(path.join(appDir, 'icon.svg'), iconSvg);

  const svgBuffer = Buffer.from(iconSvg);

  // 1. Google Search Favicon (48x48)
  await sharp(svgBuffer).resize(48, 48).png().toFile(path.join(publicDir, 'icon-48.png'));

  // 2. Standard Favicon PNG (32x32)
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.png'));
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(appDir, 'favicon.ico'));

  // 3. Apple Touch Icon (180x180)
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(appDir, 'apple-icon.png'));

  // 4. Android / Chrome PWA Icons (192x192 & 512x512)
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(appDir, 'icon.png'));

  // 5. OpenGraph Share Image (1200x630)
  const ogBuffer = Buffer.from(ogSvg);
  await sharp(ogBuffer).resize(1200, 630).png().toFile(path.join(publicDir, 'og-image.png'));
  await sharp(ogBuffer).resize(1200, 630).png().toFile(path.join(appDir, 'opengraph-image.png'));

  console.log('✅ Successfully generated all favicon PNGs, Apple touch icons, and OpenGraph images!');
}

generateAssets().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

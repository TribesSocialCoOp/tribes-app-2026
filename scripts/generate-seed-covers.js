#!/usr/bin/env node
/**
 * Generates SVG seed images for tribes, events, stories, and posts.
 * These are simple gradient covers with text labels.
 */
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'seed');

function makeSvg({ width = 400, height = 200, text, colors, extra = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${colors[1]};stop-opacity:1"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)" rx="8"/>
  <text x="${width/2}" y="${height/2 + 8}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="white" opacity="0.85">${text}</text>
  ${extra}
</svg>`;
}

const items = [
  // Tribe covers (match mock-data.ts)
  { file: 'tribe-trials.svg', text: 'The Trials', colors: ['#818CF8', '#4F46E5'] },
  { file: 'tribe-ai.svg', text: 'AI Innovators', colors: ['#34D399', '#059669'] },
  { file: 'tribe-hiking.svg', text: 'Weekend Hikers', colors: ['#86EFAC', '#16A34A'] },
  { file: 'tribe-games.svg', text: 'Indie Game Devs', colors: ['#F87171', '#DC2626'] },
  { file: 'tribe-books.svg', text: 'Local Bookworms', colors: ['#FCD34D', '#D97706'] },
  { file: 'tribe-foodies.svg', text: 'Urban Foodies', colors: ['#FB923C', '#EA580C'] },
  { file: 'tribe-music.svg', text: 'Music Collective', colors: ['#C084FC', '#9333EA'] },
  { file: 'tribe-gardeners.svg', text: 'Community Gardens', colors: ['#4ADE80', '#15803D'] },
  { file: 'tribe-filmmakers.svg', text: 'Filmmakers', colors: ['#F472B6', '#DB2777'] },
  { file: 'tribe-cyclists.svg', text: 'Urban Cyclists', colors: ['#38BDF8', '#0284C7'] },
  { file: 'tribe-parents.svg', text: 'New Parents', colors: ['#FB7185', '#E11D48'] },
  { file: 'tribe-makerspace.svg', text: 'The Makerspace', colors: ['#FACC15', '#CA8A04'] },
  
  // Event cover
  { file: 'event-summit.svg', text: 'Tech Summit 2025', colors: ['#6366F1', '#3730A3'] },
  
  // Post images  
  { file: 'post-landscape.svg', text: '🏔️', colors: ['#0EA5E9', '#075985'] },
  { file: 'post-code.svg', text: '{ code }', colors: ['#1E293B', '#334155'] },
  { file: 'post-food.svg', text: '🍕', colors: ['#F97316', '#C2410C'] },
  { file: 'post-music.svg', text: '🎵', colors: ['#A855F7', '#7E22CE'] },
  
  // Avatar placeholders
  { file: 'avatar-default.svg', text: '👤', colors: ['#94A3B8', '#64748B'], width: 80, height: 80 },
  
  // Event stream
  { file: 'event-banner.svg', text: 'Event Update', colors: ['#3B82F6', '#1D4ED8'], width: 600, height: 200 },
];

for (const item of items) {
  const svg = makeSvg({
    width: item.width || 400,
    height: item.height || 200,
    text: item.text,
    colors: item.colors,
  });
  fs.writeFileSync(path.join(outDir, item.file), svg);
  console.log(`✓ ${item.file}`);
}
console.log(`\nGenerated ${items.length} seed SVGs.`);

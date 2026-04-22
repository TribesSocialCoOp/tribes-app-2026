#!/usr/bin/env node
/**
 * Generates SVG placeholder covers for each mood stream.
 * These are gradient-based SVGs with emoji overlays.
 */
const fs = require('fs');
const path = require('path');

const moods = [
  { slug: 'chill', emoji: '😌', label: 'Chill', gradient: ['#93C5FD', '#3B82F6'] },
  { slug: 'focus', emoji: '🎯', label: 'Focus', gradient: ['#86EFAC', '#22C55E'] },
  { slug: 'showcase', emoji: '✨', label: 'Showcase', gradient: ['#C4B5FD', '#8B5CF6'] },
  { slug: 'discover', emoji: '🗺️', label: 'Discover', gradient: ['#FDE68A', '#EAB308'] },
  { slug: 'connect', emoji: '🤝', label: 'Connect', gradient: ['#FDBA74', '#F97316'] },
  { slug: 'shop', emoji: '🛍️', label: 'Shop', gradient: ['#F9A8D4', '#EC4899'] },
  { slug: 'learn', emoji: '📚', label: 'Learn', gradient: ['#99F6E4', '#14B8A6'] },
  { slug: 'game', emoji: '🎮', label: 'Game', gradient: ['#FCA5A5', '#EF4444'] },
  { slug: 'pulse', emoji: '📡', label: 'Pulse', gradient: ['#CBD5E1', '#64748B'] },
  { slug: 'discourse', emoji: '🏛️', label: 'Discourse', gradient: ['#A5B4FC', '#6366F1'] },
  { slug: 'advocate', emoji: '✊', label: 'Advocate', gradient: ['#FCD34D', '#F59E0B'] },
];

const outDir = path.join(__dirname, '..', 'public', 'moods');

for (const mood of moods) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${mood.gradient[0]};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${mood.gradient[1]};stop-opacity:1"/>
    </linearGradient>
  </defs>
  <rect width="300" height="200" fill="url(#g)" rx="8"/>
  <text x="150" y="85" text-anchor="middle" font-size="48">${mood.emoji}</text>
  <text x="150" y="130" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="24" fill="white" opacity="0.9">${mood.label}</text>
</svg>`;
  
  fs.writeFileSync(path.join(outDir, `${mood.slug}.svg`), svg);
  console.log(`✓ ${mood.slug}.svg`);
}
console.log(`\nGenerated ${moods.length} mood cover SVGs.`);

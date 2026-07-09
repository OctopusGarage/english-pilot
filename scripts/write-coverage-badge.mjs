#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const summaryPath = 'coverage/coverage-summary.json';
const badgePath = 'badges/coverage.svg';
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const percent = Number(summary.total?.lines?.pct);

if (!Number.isFinite(percent)) {
  throw new Error(`Unable to read total.lines.pct from ${summaryPath}`);
}

const label = 'coverage';
const value = `${percent.toFixed(2)}%`;
const color = percent >= 80 ? '#2ea043' : percent >= 60 ? '#d29922' : '#cf222e';
const labelWidth = 74;
const valueWidth = 64;
const width = labelWidth + valueWidth;

mkdirSync(dirname(badgePath), { recursive: true });
writeFileSync(
  badgePath,
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="20" role="img" aria-label="' +
      label +
      ': ' +
      value +
      '">',
    '<title>' + label + ': ' + value + '</title>',
    '<linearGradient id="s" x2="0" y2="100%">',
    '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>',
    '<stop offset="1" stop-opacity=".1"/>',
    '</linearGradient>',
    '<clipPath id="r"><rect width="' + width + '" height="20" rx="3" fill="#fff"/></clipPath>',
    '<g clip-path="url(#r)">',
    '<rect width="' + labelWidth + '" height="20" fill="#555"/>',
    '<rect x="' + labelWidth + '" width="' + valueWidth + '" height="20" fill="' + color + '"/>',
    '<rect width="' + width + '" height="20" fill="url(#s)"/>',
    '</g>',
    '<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">',
    '<text x="37" y="15" fill="#010101" fill-opacity=".3">' + label + '</text>',
    '<text x="37" y="14">' + label + '</text>',
    '<text x="' + (labelWidth + valueWidth / 2) + '" y="15" fill="#010101" fill-opacity=".3">' + value + '</text>',
    '<text x="' + (labelWidth + valueWidth / 2) + '" y="14">' + value + '</text>',
    '</g>',
    '</svg>',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Wrote ${badgePath}: ${value}`);

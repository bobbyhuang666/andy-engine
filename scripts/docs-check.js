#!/usr/bin/env node
/**
 * docs:check — Markdown link & anchor validator (RFC W5 / Patch E)
 *
 * Scans all tracked .md files for relative links and validates:
 *   - Relative file links resolve to existing files.
 *   - Anchor links (#section) resolve to a heading in the target file.
 *   - Links inside code blocks (``` ... ```) are ignored (example paths).
 *   - Inline code `...` paths are not treated as links.
 *
 * Exit 0 if all links resolve, 1 if any broken link is found.
 *
 * Usage: node scripts/docs-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Get all .md files in the working tree. Filesystem scan (not git ls-files)
// so that uncommitted/new docs are link-checked BEFORE commit — with
// ls-files, new docs on a dirty tree silently skipped validation.
function getMarkdownFiles() {
  const files = [];
  const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'artifacts', 'dist']);
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        scan(full);
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  }
  scan(ROOT);
  return files;
}

// Extract markdown links, skipping code blocks
function extractLinks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const links = [];
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Match [text](url) — only relative urls (not http/https/mailto)
    // Skip inline code: strip `...` segments before matching.
    const cleanedLine = line.replace(/`[^`]*`/g, ' ');
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(cleanedLine)) !== null) {
      const url = match[2].trim();
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) continue;
      links.push({ line: i + 1, url, text: match[1] });
    }
  }
  return links;
}

// Extract headings from a markdown file for anchor validation
function getHeadings(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf-8');
  const headings = new Set();
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      // GitHub-style anchor: lowercase, keep word chars + CJK + hyphens,
      // replace spaces with -, strip other punctuation.
      const anchor = m[2]
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
        .replace(/\s+/g, '-');
      headings.add(anchor);
    }
  }
  return headings;
}

function checkFile(filePath) {
  const links = extractLinks(filePath);
  const broken = [];
  const fileDir = path.dirname(filePath);

  for (const link of links) {
    // Split into file path + anchor
    let linkPath = link.url;
    let anchor = null;
    const hashIdx = link.url.indexOf('#');
    if (hashIdx >= 0) {
      linkPath = link.url.slice(0, hashIdx);
      anchor = link.url.slice(hashIdx + 1);
    }

    // Pure anchor link (#section) — resolve against current file
    if (!linkPath && anchor) {
      const headings = getHeadings(filePath);
      if (!headings.has(anchor)) {
        broken.push({ line: link.line, url: link.url, reason: `anchor "#${anchor}" not found in ${path.relative(ROOT, filePath)}` });
      }
      continue;
    }

    // Resolve relative path
    const resolved = path.resolve(fileDir, linkPath);
    if (!fs.existsSync(resolved)) {
      broken.push({ line: link.line, url: link.url, reason: `file not found: ${path.relative(ROOT, resolved)}` });
      continue;
    }

    // If anchor present, validate it in the target file
    if (anchor) {
      const headings = getHeadings(resolved);
      if (!headings.has(anchor)) {
        broken.push({ line: link.line, url: link.url, reason: `anchor "#${anchor}" not found in ${path.relative(ROOT, resolved)}` });
      }
    }
  }
  return broken;
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const files = getMarkdownFiles();
  let totalBroken = 0;
  const allBroken = [];

  for (const file of files) {
    const broken = checkFile(file);
    if (broken.length > 0) {
      totalBroken += broken.length;
      for (const b of broken) {
        allBroken.push({ file: path.relative(ROOT, file), ...b });
      }
    }
  }

  console.log('=== docs:check ===');
  console.log(`Scanned ${files.length} markdown files.`);

  if (totalBroken === 0) {
    console.log('✓ All markdown links and anchors resolve.');
    process.exit(0);
  } else {
    console.log(`✗ ${totalBroken} broken link(s) found:`);
    for (const b of allBroken) {
      console.log(`  ${b.file}:${b.line}: [${b.url}] — ${b.reason}`);
    }
    process.exit(1);
  }
}

main();

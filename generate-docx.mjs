#!/usr/bin/env node
/**
 * generate-docx.mjs — Produce an ATS-safe Word (.docx) CV from a markdown CV.
 *
 * Strict ATS parsers (Workday, Taleo, SAP SuccessFactors) often parse a clean
 * single-column .docx more reliably than a styled PDF — which is exactly what
 * ats-detect.mjs recommends for those vendors. This generates that .docx:
 * single column, no tables, standard headings, ASCII-normalized text (emojis
 * and smart punctuation stripped, accents kept), from cv.md (or any md CV).
 *
 * Dependency-free: the .docx (a ZIP of OOXML parts) is built by hand so the
 * pipeline stays deterministic and offline-friendly.
 *
 * Usage:
 *   node generate-docx.mjs                       # cv.md -> output/cv.docx
 *   node generate-docx.mjs cv.md output/cv.docx [--format=letter|a4]
 *   import { buildDocx, buildDocumentXml } from './generate-docx.mjs';
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Text sanitization (ATS-safe) ────────────────────────────────────

/** Normalize text for ATS: drop emojis/zero-width, fold smart punctuation to
 *  ASCII, keep accented letters. */
export function sanitizeAtsText(s) {
  return String(s)
    .replace(/\p{Extended_Pictographic}/gu, '')        // emojis / pictographs
    .replace(/[︀-️]/g, '')                   // variation selectors
    .replace(/[​-‍⁠﻿]/g, '')       // zero-width
    .replace(/[—–]/g, '-')                   // em/en dash -> hyphen
    .replace(/[“”„‟]/g, '"')       // smart double quotes
    .replace(/[‘’‚‛]/g, "'")       // smart single quotes
    .replace(/…/g, '...')                         // ellipsis
    .replace(/ /g, ' ')                           // nbsp
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Strip inline markdown (bold/italic/code/links) to plain text. */
export function stripInline(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(s) {
  return xmlEscape(sanitizeAtsText(stripInline(s)));
}

// ── Markdown → block model ──────────────────────────────────────────

/** Parse a markdown CV into a flat list of typed blocks. */
export function parseCvMarkdown(markdown) {
  const blocks = [];
  let nameSeen = false;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^-{3,}$/.test(line.trim())) continue; // horizontal rule

    let m;
    if ((m = line.match(/^#\s+(.+)/))) {
      blocks.push({ type: nameSeen ? 'h2' : 'name', text: m[1] });
      nameSeen = true;
    } else if ((m = line.match(/^##\s+(.+)/))) {
      blocks.push({ type: 'h2', text: m[1] });
    } else if ((m = line.match(/^###\s+(.+)/))) {
      blocks.push({ type: 'h3', text: m[1] });
    } else if ((m = line.match(/^(\s*)[*-]\s+(.+)/))) {
      const depth = Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      blocks.push({ type: 'bullet', text: m[2], depth });
    } else {
      blocks.push({ type: 'p', text: line.trim() });
    }
  }
  return blocks;
}

// ── OOXML builders ──────────────────────────────────────────────────

function run(text, { bold = false, size = 22 } = {}) {
  const rPr = `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function para(text, { bold = false, size = 22, before = 0, after = 0, indent = 0 } = {}) {
  const spacing = (before || after) ? `<w:spacing${before ? ` w:before="${before}"` : ''}${after ? ` w:after="${after}"` : ''}/>` : '';
  const ind = indent ? `<w:ind w:left="${indent}"/>` : '';
  const pPr = (spacing || ind) ? `<w:pPr>${spacing}${ind}</w:pPr>` : '';
  return `<w:p>${pPr}${run(text, { bold, size })}</w:p>`;
}

function blockToXml(b) {
  const text = cleanText(b.text);
  switch (b.type) {
    case 'name':
      return para(text, { bold: true, size: 36, after: 40 });
    case 'h2':
      return para(text, { bold: true, size: 26, before: 220, after: 60 });
    case 'h3':
      return para(text, { bold: true, size: 24, before: 160, after: 40 });
    case 'bullet':
      return para(`- ${text}`, { size: 22, indent: 360 + 360 * (b.depth || 0) });
    default:
      return para(text, { size: 22 });
  }
}

/** Build the word/document.xml body from a markdown CV. */
export function buildDocumentXml(markdown, { format = 'a4' } = {}) {
  const blocks = parseCvMarkdown(markdown);
  const body = blocks.map(blockToXml).join('');

  const page = format === 'letter'
    ? '<w:pgSz w:w="12240" w:h="15840"/>'
    : '<w:pgSz w:w="11906" w:h="16838"/>';
  const sectPr = `<w:sectPr>${page}<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sectPr}</w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

// ── Minimal ZIP writer (STORED entries) ─────────────────────────────

let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);          // method: stored
    lh.writeUInt16LE(0, 10);         // mod time
    lh.writeUInt16LE(0x21, 12);      // mod date (1980-01-01)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...local, centralBuf, eocd]);
}

/** Build a complete .docx as a Buffer from a markdown CV. */
export function buildDocx(markdown, { format = 'a4' } = {}) {
  const documentXml = buildDocumentXml(markdown, { format });
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: documentXml },
  ]);
}

// ── CLI ─────────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  let format = 'a4';
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--format=')) format = a.split('=')[1].toLowerCase();
    else if (!a.startsWith('--')) positional.push(a);
  }
  if (!['a4', 'letter'].includes(format)) {
    console.error(`Format invalide "${format}". Utiliser: a4, letter`);
    process.exit(1);
  }

  const inputPath = resolve(positional[0] || resolve(__dirname, 'cv.md'));
  const outputPath = resolve(positional[1] || resolve(__dirname, 'output/cv.docx'));

  if (!existsSync(inputPath)) {
    console.error(`❌ CV markdown introuvable : ${inputPath}`);
    process.exit(1);
  }

  const markdown = readFileSync(inputPath, 'utf-8');
  const buffer = buildDocx(markdown, { format });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);

  const blocks = parseCvMarkdown(markdown);
  console.log(`✅ DOCX ATS-safe généré : ${outputPath}`);
  console.log(`   Format : ${format.toUpperCase()} | Blocs : ${blocks.length} | Taille : ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`   Colonne unique, sans tableaux, texte ASCII-normalisé (emojis/typographie retirés, accents conservés).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}

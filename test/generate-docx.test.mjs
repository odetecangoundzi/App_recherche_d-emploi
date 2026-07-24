import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAtsText,
  stripInline,
  parseCvMarkdown,
  buildDocumentXml,
  buildDocx,
} from '../generate-docx.mjs';

test('sanitizeAtsText strips emojis but keeps accented letters', () => {
  assert.equal(sanitizeAtsText('Besançon 📍 France'), 'Besançon France');
  assert.equal(sanitizeAtsText('café résumé'), 'café résumé');
});

test('sanitizeAtsText folds smart punctuation to ASCII', () => {
  assert.equal(sanitizeAtsText('a — b'), 'a - b');
  assert.equal(sanitizeAtsText('“quote”'), '"quote"');
  assert.equal(sanitizeAtsText('d’accord'), "d'accord");
  assert.equal(sanitizeAtsText('etc…'), 'etc...');
});

test('stripInline removes bold and reduces links to their label', () => {
  assert.equal(stripInline('**Bold** text'), 'Bold text');
  assert.equal(stripInline('[Portfolio](https://x.io)'), 'Portfolio');
});

test('parseCvMarkdown classifies headings, bullets and paragraphs', () => {
  const md = [
    '# Jane Doe',
    '## EXPERIENCE',
    '### Engineer',
    '- Built X',
    '  - sub bullet',
    'plain line',
    '---',
  ].join('\n');
  const blocks = parseCvMarkdown(md);
  assert.equal(blocks[0].type, 'name');
  assert.equal(blocks[1].type, 'h2');
  assert.equal(blocks[2].type, 'h3');
  assert.equal(blocks[3].type, 'bullet');
  assert.equal(blocks[3].depth, 0);
  assert.equal(blocks[4].depth, 1);
  assert.equal(blocks[5].type, 'p');
  assert.equal(blocks.length, 6); // '---' skipped
});

test('buildDocumentXml embeds text, XML-escapes it, and uses no tables', () => {
  const xml = buildDocumentXml('# Jane Doe\n- R&D <lead> "role"');
  assert.match(xml, /Jane Doe/);
  assert.match(xml, /R&amp;D &lt;lead&gt;/);
  assert.doesNotMatch(xml, /<w:tbl>/);
  assert.match(xml, /<w:sectPr>/);
});

test('buildDocumentXml honors the page format', () => {
  assert.match(buildDocumentXml('# A', { format: 'letter' }), /w:w="12240"/);
  assert.match(buildDocumentXml('# A', { format: 'a4' }), /w:w="11906"/);
});

test('buildDocx returns a valid ZIP (PK signature)', () => {
  const buf = buildDocx('# Jane Doe\n## EXPERIENCE\n- Shipped feature to 10k users');
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 4).toString('hex'), '504b0304'); // PK\x03\x04
  assert.ok(buf.length > 500);
});

const { inspectZip, readZipEntry, ImportError } = require('./zipGuard');

const ERR_NOT_DOCX = 'ملف Word غير صالح — لا يحتوي المستند المتوقع بداخله';

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractBlocks(xml, tag) {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const blocks = [];
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf(open, i);
    if (start === -1) break;
    const after = xml.charAt(start + open.length);
    if (after !== ' ' && after !== '>' && after !== '/') { i = start + open.length; continue; }
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd === -1) break;
    if (xml.charAt(tagEnd - 1) === '/') {
      blocks.push('');
      i = tagEnd + 1;
      continue;
    }

    let depth = 1;
    let j = tagEnd + 1;
    while (j < xml.length && depth > 0) {
      const nextOpen = xml.indexOf(open, j);
      const nextClose = xml.indexOf(close, j);
      if (nextClose === -1) { j = xml.length; break; }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        const c = xml.charAt(nextOpen + open.length);
        if (c === ' ' || c === '>' || c === '/') {
          const oEnd = xml.indexOf('>', nextOpen);
          depth += (oEnd !== -1 && xml.charAt(oEnd - 1) === '/') ? 0 : 1;
          j = (oEnd === -1 ? nextOpen + open.length : oEnd + 1);
          continue;
        }
        j = nextOpen + open.length;
        continue;
      }
      depth -= 1;
      if (depth === 0) {
        blocks.push(xml.slice(tagEnd + 1, nextClose));
        j = nextClose + close.length;
      } else {
        j = nextClose + close.length;
      }
    }
    i = j;
  }
  return blocks;
}

function textOf(fragment) {
  let s = fragment
    .replace(/<w:(?:tab|br|cr)\s*\/>/g, ' ')
    .replace(/<\/w:p>/g, ' ');
  const parts = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(s)) !== null) parts.push(decodeEntities(m[1]));
  return parts.join(' ');
}

function parseDocx(buffer) {
  const names = inspectZip(buffer);
  if (!names.includes('word/document.xml')) throw new ImportError(ERR_NOT_DOCX);
  const raw = readZipEntry(buffer, 'word/document.xml');
  if (!raw) throw new ImportError(ERR_NOT_DOCX);
  const xml = Buffer.from(raw).toString('utf8');

  const bodyMatch = /<w:body(?:\s[^>]*)?>([\s\S]*)<\/w:body>/.exec(xml);
  const body = bodyMatch ? bodyMatch[1] : xml;

  const tables = extractBlocks(body, 'w:tbl');
  let best = null;
  for (const t of tables) {
    const rows = extractBlocks(t, 'w:tr').map((tr) => extractBlocks(tr, 'w:tc').map(textOf));
    if (rows.length >= 2 && (!best || rows.length > best.length)) best = rows;
  }
  if (best) {
    return { mode: 'table', rows: best, tableCount: tables.length };
  }

  let withoutTables = body;
  for (const t of tables) withoutTables = withoutTables.replace(t, '');
  const paragraphs = extractBlocks(withoutTables, 'w:p').map((p) => [textOf(p)]);
  return { mode: 'paragraphs', rows: paragraphs, tableCount: tables.length };
}

module.exports = { parseDocx, extractBlocks, textOf };

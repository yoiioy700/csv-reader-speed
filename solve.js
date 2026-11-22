// Fast drop-in for csv-reader 1.0.0.
let text = '', n = 0, pos = 0, line = 1, ended = 0, added = 0;
let errors = null, recordLine = 1, recordRow = null;

function readU(prefix) {
  let start = pos, value = prefix, add = 0;
  const t = text;
  while (pos < n) {
    const c = t.charCodeAt(pos);
    if (c === 44) { value += t.slice(start, pos); add += pos - start; pos++; ended = 0; added = add; return value; }
    if (c === 10) { value += t.slice(start, pos); add += pos - start; pos++; line++; ended = 1; added = add; return value; }
    if (c === 13) {
      value += t.slice(start, pos); add += pos - start;
      if (pos + 1 < n && t.charCodeAt(pos + 1) === 10) { pos += 2; line++; ended = 1; added = add; return value; }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos++; start = pos; continue;
    }
    pos++;
  }
  value += t.slice(start, pos); add += pos - start;
  ended = 2; added = add; return value;
}

function findClose(p) {
  for (;;) {
    const q = text.indexOf('"', p);
    if (q < 0) return -1;
    if (q + 1 < n && text.charCodeAt(q + 1) === 34) { p = q + 2; continue; }
    return q;
  }
}

export function run(input) {
  text = String(input.text);
  n = text.length;
  const header = input.header === true;
  errors = [];
  const errs = errors, rows = [];
  let columns = null, width = -1;
  pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  line = 1;
  const t = text;
  for (;;) {
    while (pos < n) {
      const c = t.charCodeAt(pos);
      if (c === 10) { pos++; line++; }
      else if (c === 13 && pos + 1 < n && t.charCodeAt(pos + 1) === 10) { pos += 2; line++; }
      else break;
    }
    if (pos >= n) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = t.charCodeAt(pos) === 34;
      if (!quoted) { fields.push(readU('')); continue; }
      const open = pos;
      const close = findClose(open + 1);
      if (close < 0) {
        errs.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        pos = open + 1;
        fields.push(readU('"'));
        continue;
      }
      let seg = t.slice(open + 1, close);
      if (seg.indexOf('"') >= 0) seg = seg.replaceAll('""', '"');
      const hasCR = seg.indexOf('\r') >= 0;
      if (hasCR || seg.indexOf('\n') >= 0) {
        const L = seg.length;
        for (let i = 0; i < L; i++) {
          const c = seg.charCodeAt(i);
          if (c === 10) line++;
          else if (c === 13) { line++; if (i + 1 < L && seg.charCodeAt(i + 1) === 10) i++; }
        }
        if (hasCR) seg = seg.replace(/\r\n?/g, '\n');
      }
      pos = close + 1;
      if (pos >= n) { ended = 2; fields.push(seg); continue; }
      const c = t.charCodeAt(pos);
      if (c === 44) { pos++; ended = 0; fields.push(seg); continue; }
      if (c === 10) { pos++; line++; ended = 1; fields.push(seg); continue; }
      if (c === 13 && pos + 1 < n && t.charCodeAt(pos + 1) === 10) { pos += 2; line++; ended = 1; fields.push(seg); continue; }
      const v = readU(seg);
      if (added > 0) errs.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      fields.push(v);
    } while (ended === 0);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    const fl = fields.length;
    if (fl < width) {
      errs.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fl });
      while (fields.length < width) fields.push('');
    } else if (fl > width) {
      errs.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  text = ''; errors = null;
  return { columns: header ? (columns ?? []) : null, rows, errors: errs };
}

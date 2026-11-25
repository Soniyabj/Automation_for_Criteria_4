// backend/utils/excel.js
const ExcelJS = require('exceljs');

/**
 * Normalize a header: lowercase, remove spaces, dots, underscores, question marks.
 */
function normHeader(h) {
  if (!h) return '';
  return String(h).toLowerCase().replace(/[\s._?]/g, '');
}

/**
 * Convert cell value to pure string.
 */
function cellStr(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim();
    if (v.richText && Array.isArray(v.richText)) {
      return v.richText.map(x => x.text || '').join('').trim();
    }
  }
  return String(v).trim();
}

/**
 * Interpret a semester cell.
 *
 * PASS: pass, p, pa, 1, yes, y
 * FAIL: fail, f, fa
 * EXCLUDED (False): 0, false, coc, cob, detained, excluded
 */
function parseSemCell(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;

  if (['pass', 'p', 'pa', '1', 'yes', 'y'].includes(s)) {
    return { passed: true, excluded: false };
  }
  if (['fail', 'f', 'fa'].includes(s)) {
    return { passed: false, excluded: false };
  }
  if (['0', 'false', 'detained', 'coc', 'cob', 'excluded'].includes(s)) {
    return { passed: undefined, excluded: true };
  }
  return null;
}

/**
 * Parse Excel file into student rows.
 * - filePath: path to uploaded file
 * Returns array of rows: { sno?, name, usn, remarks?, placed?, offerLetterPath?, sem: [{semNumber, passed, excluded}], backlogCleared? }
 */
async function parseExcelToStudents(filePath) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    // ExcelJS read error (maybe not an xlsx), try CSV read as fallback
    try {
      const csvWB = new ExcelJS.Workbook();
      await csvWB.csv.readFile(filePath);
      // assign to workbook variable usage below
      workbook.worksheets = csvWB.worksheets;
    } catch (err2) {
      const msg = `Failed to read Excel/CSV file: ${err.message || err2.message || String(err2)}`;
      console.error(msg, err);
      throw new Error(msg);
    }
  }

  const ws = workbook.worksheets && workbook.worksheets[0];
  if (!ws) {
    const msg = 'No worksheet found in uploaded file';
    console.error(msg);
    throw new Error(msg);
  }

  // find first row that has any content -> consider it header row
  let headerRow = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = row.values || [];
    const hasAny = values.some(v => v !== null && v !== undefined && v !== '');
    if (!hasAny) continue;
    headerRow = row;
    break;
  }

  if (!headerRow) {
    const msg = 'Empty spreadsheet (no rows)';
    console.error(msg);
    throw new Error(msg);
  }

  // Build headerMap and sem column map
  const headerMap = {};
  const semColIdx = {};

  headerRow.eachCell((cell, col) => {
    const h = normHeader(cellStr(cell));
    if (!h) return;

    if (['sno', 'slno', 'srno', 'serialno'].includes(h)) headerMap.sno = col;
    else if (['name', 'studentname', 'student'].includes(h)) headerMap.name = col;
    else if (h === 'usn' || h === 'usnno' || h === 'usnnumber') headerMap.usn = col;
    else if (h === 'remarks' || h === 'remark') headerMap.remarks = col;
    else if (h === 'placed') headerMap.placed = col;
    else if (h === 'offerletter' || h === 'offerletterpath' || h === 'offer') headerMap.offerLetterPath = col;
    else if (h.startsWith('backlog')) headerMap.backlogCleared = col;
    // sem1, sem2, sem3 ...
    const semMatch = h.match(/^sem(\d)$/);
    if (semMatch) {
      const n = Number(semMatch[1]);
      if (n >= 1 && n <= 8) semColIdx['sem' + n] = col;
    }
  });

  // If we didn't find a 'usn' header, try fallback: assume headerless and use first row as data row
  let headerlessMode = false;
  if (!headerMap.usn) {
    // if first row has typical header names in the first 3 cells, it's headered but different names -> try liberal match
    // else treat file as headerless: columns 1->sno, 2->name, 3->usn
    const firstRowCells = (headerRow.values || []).slice(1, 6).map(x => String(x || '').trim().toLowerCase());
    const likelyHeaderNames = ['usn', 'name', 's.no', 'sno', 'slno', 'serial', 'student', 'usn no'];
    const hasLikelyHeader = firstRowCells.some(c => likelyHeaderNames.some(h => c.includes(h)));
    if (!hasLikelyHeader) {
      // headerless fallback
      headerlessMode = true;
      headerMap.sno = 1;
      headerMap.name = 2;
      headerMap.usn = 3;
      // sem columns will be 4..11 (if present)
      for (let i = 1; i <= 8; i++) semColIdx['sem' + i] = 3 + i;
    } else {
      // We had row but not usn header — try to scan first 3 rows for a 'usn' header
      for (let r = headerRow.number; r < Math.min(headerRow.number + 3, ws.rowCount); r++) {
        const row = ws.getRow(r);
        row.eachCell((cell, col) => {
          const h = normHeader(cellStr(cell));
          if (!h) return;
          if (h === 'usn' && !headerMap.usn) headerMap.usn = col;
        });
        if (headerMap.usn) break;
      }
      if (!headerMap.usn) {
        // Still not found: fallback headerless mode
        headerlessMode = true;
        headerMap.sno = 1;
        headerMap.name = 2;
        headerMap.usn = 3;
        for (let i = 1; i <= 8; i++) semColIdx['sem' + i] = 3 + i;
      }
    }
  }

  // If still no usn, fail
  if (!headerMap.usn) {
    const msg = 'Could not identify USN column in uploaded file';
    console.error(msg, { headerMap, semColIdx, headerlessMode });
    throw new Error(msg);
  }

  // Read rows after headerRow
  const students = [];
  const startRow = headerRow.number + (headerlessMode ? 0 : 1);

  for (let r = startRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = row.values || [];
    const hasAny = values.some(v => v !== null && v !== undefined && v !== '');
    if (!hasAny) continue;

    // read cells safely
    const get = (colIdx) => {
      try {
        return cellStr(row.getCell(colIdx));
      } catch (e) {
        return '';
      }
    };

    const usn = get(headerMap.usn).toUpperCase();
    if (!usn) {
      // skip rows without usn
      continue;
    }

    const name = headerMap.name ? get(headerMap.name) : '';
    const snoRaw = headerMap.sno ? get(headerMap.sno) : '';
    const remarks = headerMap.remarks ? get(headerMap.remarks) : '';
    const placedRaw = headerMap.placed ? get(headerMap.placed) : '';
    const offerLetterPath = headerMap.offerLetterPath ? get(headerMap.offerLetterPath) : '';
    const backlogRaw = headerMap.backlogCleared ? get(headerMap.backlogCleared) : '';

    // sem parsing
    const sem = [];
    for (let i = 1; i <= 8; i++) {
      const colIdx = semColIdx['sem' + i];
      if (!colIdx) continue;
      const raw = get(colIdx);
      const parsed = parseSemCell(raw);
      if (parsed) {
        sem.push({
          semNumber: i,
          passed: parsed.passed,
          excluded: parsed.excluded,
        });
      }
    }

    // placed parse
    const placed = placedRaw
      ? ['yes', 'y', 'true', '1'].includes(placedRaw.toLowerCase())
      : false;

    // backlog parse
    let backlogCleared;
    if (backlogRaw) {
      const b = backlogRaw.toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(b)) backlogCleared = true;
      else if (['no', 'n', 'false', '0'].includes(b)) backlogCleared = false;
      else backlogCleared = undefined;
    }

    students.push({
      sno: snoRaw ? (Number(snoRaw) || undefined) : undefined,
      name: name === '0' ? '' : name,
      usn,
      remarks,
      placed,
      offerLetterPath,
      sem,
      backlogCleared,
    });
  }

  // Logging summary (backend terminal)
  console.info(`[excel.parse] file=${filePath} headerless=${headerlessMode} headerRow=${headerRow.number} parsedRows=${students.length}`);

  return students;
}

module.exports = { parseExcelToStudents };

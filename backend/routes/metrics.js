// backend/routes/metrics.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const Student = require('../models/Student');

/* ---------- Asset resolution (logos) ---------- */
function findAsset(filename) {
  const candidates = [
    path.join(__dirname, '..', 'assets', filename),
    path.join(process.cwd(), 'backend', 'assets', filename),
    path.join(process.cwd(), 'assets', filename),
    path.join(process.cwd(), 'frontend', 'src', 'assets', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const LOGO_LEFT = findAsset('mit.png');
const LOGO_RIGHT = findAsset('ise.jpg') || findAsset('ise.png');

/* ----------------- Helpers ----------------- */

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// Decide which students we admit into X based on "remarks"
function classifyRemarkCategory(student) {
  const r = String(student.remarks || '').toLowerCase();

  if (r.includes('lateral')) return 'lateral';
  if (r.includes('in(coc)') || r.includes('in coc')) return 'in-coc';
  if (r.includes('in(cob)') || r.includes('in cob')) return 'in-cob';
  if (r.includes('regular')) return 'regular';

  // clearly excluded / out
  if (
    r.includes('out(cob)') || r.includes('out cob') ||
    r.includes('out(coc)') || r.includes('out coc') ||
    r.includes('detained')
  ) {
    return 'excluded';
  }

  // fallback – treat as regular unless you want to ignore
  return 'regular';
}

// Final result helpers
function isFinalPass(student) {
  const f = String(student.finalResult || '').toLowerCase().trim();
  return f === 'pass' || f === 'p';
}

function isFinalExcluded(student) {
  const f = String(student.finalResult || '').toLowerCase().trim();
  return f === 'excluded' || f === 'false';
}

// Backlog cleared? column – try a few possible field names
function isBacklogClearedYes(student) {
  const candidate =
    student.backlogCleared ??
    student.backlog_cleared ??
    student.backlogClearedFlag ??
    student.backlogClearedYN;

  if (typeof candidate === 'boolean') return candidate === true;

  const t = String(candidate || '').toLowerCase().trim();
  return t === 'yes' || t === 'y' || t === '1' || t === 'true';
}

/**
 * Fetch all students that belong to a given batch.
 * We try both numeric and string batchName fields.
 */
async function fetchStudentPoolForBatch(batchName, branch) {
  const or = [
    { batchName },
    { batch: batchName },
    { admissionBatch: batchName }
  ];

  const asNum = toInt(batchName);
  if (asNum) {
    or.push(
      { batchName: asNum },
      { batch: asNum },
      { admissionBatch: asNum }
    );
  }

  const query = branch ? { branch, $or: or } : { $or: or };

  try {
    const students = await Student.find(query).lean();
    return students || [];
  } catch (e) {
    console.error('fetchStudentPoolForBatch error', e);
    return [];
  }
}

/**
 * Core metric computation for ONE batch/year, using ONLY Student documents.
 *
 * X = Regular + in(coc) + in(cob) + lateral
 * Y_withoutBacklog = only students who are Pass in finalResult
 * Y_stipulated = only students who are Pass in finalResult
 *                + only students who are Yes in "Backlog cleared?"
 *
 * Excluded (detained, out(cob), out(coc), finalResult="Excluded/False") are NOT counted.
 */
function computeMetricsFromStudents(students) {
  let regularCount = 0;
  let inCOCCount = 0;
  let inCOBCount = 0;
  let lateralCount = 0;

  const includedForX = [];

  for (const s of students || []) {
    const cat = classifyRemarkCategory(s);

    if (cat === 'excluded') {
      continue; // never in X or Y
    }

    if (isFinalExcluded(s)) {
      continue; // extra safety: finalResult explicitly excluded
    }

    if (cat === 'regular') regularCount++;
    else if (cat === 'in-coc') inCOCCount++;
    else if (cat === 'in-cob') inCOBCount++;
    else if (cat === 'lateral') lateralCount++;

    includedForX.push({ student: s, cat });
  }

  // X = sum of all four categories
  const X = regularCount + inCOCCount + inCOBCount + lateralCount;

  // Y_withoutBacklogs: only passed students (from those in X)
  let Y_withoutBacklogs = 0;
  // Y_stipulated: passed students OR backlogCleared == Yes (from those in X)
  let Y_stipulated = 0;

  for (const { student: s } of includedForX) {
    const pass = isFinalPass(s);
    const cleared = isBacklogClearedYes(s);

    if (pass) Y_withoutBacklogs++;
    if (pass || cleared) Y_stipulated++;
  }

  const SI_noBacklog = X > 0 ? Y_withoutBacklogs / X : 0;
  const SI = X > 0 ? Y_stipulated / X : 0;

  return {
    regularCount,
    inCOCCount,
    inCOBCount,
    lateralCount,
    X,
    Y_withoutBacklogs,
    Y_stipulated,
    SI,
    SI_noBacklog,
  };
}

/* ---------------- JSON endpoint ---------------- */
router.get('/success-rate', async (req, res) => {
  try {
    const batchNameParam = req.query.batchName;
    const lyg = toInt(req.query.lyg);
    const branch = req.query.branch || undefined;

    if (!batchNameParam || !lyg) {
      return res.status(400).json({ message: 'Provide batchName and lyg (graduation year)' });
    }

    const years = [lyg, lyg - 1, lyg - 2];
    const results = [];

    for (const year of years) {
      const students = await fetchStudentPoolForBatch(String(year), branch);
      const metrics = computeMetricsFromStudents(students);
      results.push({
        graduationYear: year,
        ...metrics,
      });
    }

    const [r1, r2, r3] = results;
    const avgSI_stipulated = (r1.SI + r2.SI + r3.SI) / 3;
    const avgSI_noBacklog = (r1.SI_noBacklog + r2.SI_noBacklog + r3.SI_noBacklog) / 3;

    res.json({
      requested: { batchName: batchNameParam, lyg, LYGM1: lyg - 1, LYGM2: lyg - 2 },
      stipulated: results,        // same data, different interpretation on frontend
      withoutBacklogs: results,   // (we only change Y & SI usage)
      aggregates: {
        avgSI_stipulated,
        assessment_stipulated: 15 * avgSI_stipulated,
        avgSI_noBacklog,
        assessment_without_backlogs: 25 * avgSI_noBacklog,
      },
    });
  } catch (err) {
    console.error('metrics endpoint error', err);
    res.status(500).json({ message: 'Metrics compute error', error: String(err) });
  }
});

/* ---------------- PDF Export (landscape, one table per page) ---------------- */
router.get('/success-rate/pdf', async (req, res) => {
  try {
    const batchNameParam = req.query.batchName;
    const lyg = toInt(req.query.lyg);
    const branch = req.query.branch || undefined;

    if (!batchNameParam || !lyg) {
      return res.status(400).json({ message: 'Provide batchName and lyg (graduation year)' });
    }

    const years = [lyg, lyg - 1, lyg - 2];
    const results = [];

    for (const year of years) {
      const students = await fetchStudentPoolForBatch(String(year), branch);
      const metrics = computeMetricsFromStudents(students);
      results.push({
        year,
        ...metrics,
      });
    }

    const [r1, r2, r3] = results;
    const avgSI_stipulated = (r1.SI + r2.SI + r3.SI) / 3;
    const avgSI_noBacklog = (r1.SI_noBacklog + r2.SI_noBacklog + r3.SI_noBacklog) / 3;

    /* --- Create landscape A4 document --- */
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 36, left: 36, right: 36, bottom: 36 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${batchNameParam}_success_rate_${lyg}.pdf"`
    );
    doc.pipe(res);

    const leftLogo = LOGO_LEFT || path.join(__dirname, '..', 'assets', 'mit.png');
    const rightLogo = LOGO_RIGHT || path.join(__dirname, '..', 'assets', 'ise.jpg');

    function safeImage(imgPath, x, y, opt) {
      try {
        if (fs.existsSync(imgPath)) doc.image(imgPath, x, y, opt);
      } catch (e) {}
    }

    function renderHeader() {
      const logoW = 60, logoH = 50;
      const topY = doc.page.margins.top - 8;
      safeImage(leftLogo, doc.page.margins.left, topY, { fit: [logoW, logoH] });
      safeImage(
        rightLogo,
        doc.page.width - doc.page.margins.right - logoW,
        topY,
        { fit: [logoW, logoH] }
      );

      const centerLeft = doc.page.margins.left + logoW + 12;
      const centerWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right -
        logoW * 2 -
        24;
      const titleY = topY + logoH / 2 - 10;

      doc.font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#0b60b7')
        .text(
          'MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA',
          centerLeft,
          titleY,
          { width: centerWidth, align: 'center', lineBreak: false }
        );

      const subY = titleY + 18;
      doc.font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#374151')
        .text(
          'An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi',
          centerLeft,
          subY,
          { width: centerWidth, align: 'center' }
        );

      const deptY = subY + 14;
      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#b91c1c')
        .text(
          'DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING',
          centerLeft,
          deptY,
          { width: centerWidth, align: 'center' }
        );

      // line for LYG / LYGM1 / LYGM2
      doc.moveDown(1.3);
      doc.font('Helvetica')
        .fontSize(10)
        .fillColor('#111827')
        .text(
          `LYG = ${lyg}    LYGM1 = ${lyg - 1}    LYGM2 = ${lyg - 2}`,
          doc.page.margins.left,
          doc.y,
          { align: 'left' }
        );

      doc.moveDown(1);
      const dividerY = doc.y;
      doc.strokeColor('#e5e7eb')
        .lineWidth(0.9)
        .moveTo(doc.page.margins.left, dividerY)
        .lineTo(doc.page.width - doc.page.margins.right, dividerY)
        .stroke();
      doc.moveDown(1);
    }

    // slightly wider item column (to reduce congestion)
    function drawOneTable(title, rows, yearsArr) {
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const fullW = right - left;

      doc.font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('black')
        .text(title, left, doc.y, { align: 'left' });
      doc.moveDown(0.3);

      const itemColW = Math.round(fullW * 0.45); // 45% for item column
      const yearColW = Math.floor((fullW - itemColW) / yearsArr.length);

      const headerY = doc.y;
      const headerH = 30;

      doc.lineWidth(0.8);
      doc.rect(left, headerY, itemColW, headerH).stroke();
      doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Item', left + 10, headerY + 8);

      let hx = left + itemColW;
      yearsArr.forEach((y) => {
        doc.rect(hx, headerY, yearColW, headerH).stroke();
        doc.font('Helvetica-Bold')
          .fontSize(10)
          .text(String(y), hx, headerY + 8, { width: yearColW, align: 'center' });
        hx += yearColW;
      });

      let y = headerY + headerH;
      const rowH = 62; // a little taller to prevent crowding
      const textOpts = { width: itemColW - 20, align: 'left', lineGap: 2 };

      rows.forEach((row) => {
        doc.rect(left, y, itemColW, rowH).stroke();
        doc.font('Helvetica')
          .fontSize(9)
          .fillColor('#111827')
          .text(row.label, left + 10, y + 8, textOpts);

        let cx = left + itemColW;
        for (let i = 0; i < yearsArr.length; i++) {
          doc.rect(cx, y, yearColW, rowH).stroke();
          const v =
            row.values && row.values[i] !== undefined && row.values[i] !== null
              ? row.values[i]
              : '—';
          doc.font('Helvetica')
            .fontSize(11)
            .fillColor('#111827')
            .text(String(v), cx, y + 18, { width: yearColW, align: 'center' });
          cx += yearColW;
        }
        y += rowH;
      });

      doc.y = y + 12;
      return doc.y;
    }

    const yearsLabels = years;

    const tableA = [
      {
        label:
          'X\n Number of students admitted in the corresponding First year + admitted in 2nd year via lateral entry and separated division , if applicable :\n Regular + in(COC) + in(COB) + Lateral = X',
        values: results.map(
          (r) =>
            `${r.regularCount} + ${r.inCOCCount} + ${r.inCOBCount} + ${r.lateralCount} = ${r.X}`
        ),
      },
      {
        label:
          'Y\nNumber of students who have graduated without backlogs in the stipulated period (only passed students in Final Result).',
        values: results.map((r) => r.Y_withoutBacklogs),
      },
      {
        label: 'Success Index (SI = Y / X)',
        values: results.map((r) => (r.X ? r.SI_noBacklog.toFixed(3) : '—')),
      },
    ];

    const tableB = [
      {
        label:
          'X\n Number of students admitted in the corresponding First year + admitted in 2nd year via lateral entry and separated division , if applicable : Regular + in(COC) + in(COB) + Lateral = X',
        values: results.map(
          (r) =>
            `${r.regularCount} + ${r.inCOCCount} + ${r.inCOBCount} + ${r.lateralCount} = ${r.X}`
        ),
      },
      {
        label:
          'Y\nNumber of students who graduated in the stipulated period (only passed students in Final Result + only "Yes" in Backlog cleared?).',
        values: results.map((r) => r.Y_stipulated),
      },
      {
        label: 'Success Index (SI = Y / X)',
        values: results.map((r) => (r.X ? r.SI.toFixed(3) : '—')),
      },
    ];

    // ---- Page 1 : WITHOUT BACKLOG ----
    renderHeader();
    drawOneTable('Success rate WITHOUT backlog', tableA, yearsLabels);

    const leftX = doc.page.margins.left;
    const rightX = doc.page.width - doc.page.margins.right;
    const boxW = rightX - leftX;
    const boxH = 80;
    const boxY = doc.y + 8;
    doc.roundedRect(leftX, boxY, boxW, boxH, 6).stroke('#e5e7eb');
    const pad = 18;
    const leftAreaW = Math.round(boxW * 0.62);
    const rightAreaW = boxW - leftAreaW - pad * 2;

    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(
        `Average SI = ${avgSI_noBacklog.toFixed(3)}`,
        leftX + pad,
        boxY + 18,
        { width: leftAreaW - pad, align: 'left' }
      );
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        'Average SI = (SI(LYG) + SI(LYGM1) + SI(LYGM2)) / 3',
        leftX + pad,
        boxY + 40,
        { width: leftAreaW - pad, align: 'left' }
      );
    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(
        `Assessment = ${(25 * avgSI_noBacklog).toFixed(2)}`,
        leftX + pad + leftAreaW,
        boxY + 18,
        { width: rightAreaW, align: 'right' }
      );
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        'Assessment = 25 * Average SI (without backlog)',
        leftX + pad + leftAreaW,
        boxY + 40,
        { width: rightAreaW, align: 'right' }
      );

    // ---- Page 2 : STIPULATED ----
    doc.addPage({ size: 'A4', layout: 'landscape' });
    renderHeader();
    drawOneTable('Success rate in stipulated period', tableB, yearsLabels);

    const boxY2 = doc.y + 8;
    doc.roundedRect(leftX, boxY2, boxW, boxH, 6).stroke('#e5e7eb');
    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(
        `Average SI = ${avgSI_stipulated.toFixed(3)}`,
        leftX + pad,
        boxY2 + 18,
        { width: leftAreaW - pad, align: 'left' }
      );
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        'Average SI = (SI(LYG) + SI(LYGM1) + SI(LYGM2)) / 3',
        leftX + pad,
        boxY2 + 40,
        { width: leftAreaW - pad, align: 'left' }
      );
    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(
        `Assessment = ${(15 * avgSI_stipulated).toFixed(2)}`,
        leftX + pad + leftAreaW,
        boxY2 + 18,
        { width: rightAreaW, align: 'right' }
      );
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        'Assessment = 15 * Average SI (stipulated period)',
        leftX + pad + leftAreaW,
        boxY2 + 40,
        { width: rightAreaW, align: 'right' }
      );

    doc.end();
  } catch (err) {
    console.error('PDF generation error', err);
    res.status(500).json({ message: 'PDF generation failed', error: String(err) });
  }
});

/* ---------------- Excel export (with logos + header like PDF) ---------------- */
router.get('/success-rate/excel', async (req, res) => {
  try {
    const batchNameParam = req.query.batchName;
    const lyg = toInt(req.query.lyg);
    const branch = req.query.branch || undefined;

    if (!batchNameParam || !lyg) {
      return res.status(400).json({ message: 'Provide batchName and lyg (graduation year)' });
    }

    const years = [lyg, lyg - 1, lyg - 2];
    const results = [];

    for (const year of years) {
      const students = await fetchStudentPoolForBatch(String(year), branch);
      const metrics = computeMetricsFromStudents(students);
      results.push({
        graduationYear: year,
        ...metrics,
      });
    }

    const [r1, r2, r3] = results;
    const avgSI_stipulated = (r1.SI + r2.SI + r3.SI) / 3;
    const avgSI_noBacklog = (r1.SI_noBacklog + r2.SI_noBacklog + r3.SI_noBacklog) / 3;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutomationForCriteria4';

    // Common builder for both sheets
    function buildSheet(opts) {
      const {
        sheetName,
        title,
        yRowLabel,
        yValues,
        siValues,
        avgSI,
        assessmentFactor,
        assessmentLabelSuffix,
      } = opts;

      const ws = workbook.addWorksheet(sheetName, {
        pageSetup: { paperSize: 9, orientation: "landscape" },
      });

      // 4 columns: Item, LYG, LYGM1, LYGM2
      ws.columns = [
        { width: 70 }, // Item big text
        { width: 14 },
        { width: 14 },
        { width: 14 },
      ];

      // Row heights for header area
      ws.getRow(1).height = 22;
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 18;
      ws.getRow(4).height = 16;
      ws.getRow(5).height = 18; // title
      ws.getRow(6).height = 20; // table header

      // ---------- HEADER TEXT (rows 1–4) ----------
      // row 1: title
      ws.mergeCells("A1:D1");
      let cell = ws.getCell("A1");
      cell.value = "MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA";
      cell.font = { bold: true, size: 14 };
      cell.alignment = { horizontal: "center", vertical: "middle" };

      // row 2: affiliation
      ws.mergeCells("A2:D2");
      cell = ws.getCell("A2");
      cell.value =
        "An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi";
      cell.font = { size: 9, italic: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };

      // row 3: department
      ws.mergeCells("A3:D3");
      cell = ws.getCell("A3");
      cell.value = "DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING";
      cell.font = { bold: true, size: 10, color: { argb: "FFB91C1C" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };

      // row 4: LYG line
      ws.mergeCells("A4:D4");
      cell = ws.getCell("A4");
      cell.value = `LYG = ${lyg}    LYGM1 = ${lyg - 1}    LYGM2 = ${lyg - 2}`;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };

      // ---------- LOGOS (rows 1–4, A/B and C/D) ----------
      if (LOGO_LEFT) {
        const ext = path.extname(LOGO_LEFT).toLowerCase().replace(".", "");
        const imgId = workbook.addImage({
          filename: LOGO_LEFT,
          extension: ext === "jpg" ? "jpeg" : ext,
        });
        ws.addImage(imgId, "A1:A4"); // left side (column A tall)
      }

      if (LOGO_RIGHT) {
        const ext = path.extname(LOGO_RIGHT).toLowerCase().replace(".", "");
        const imgId = workbook.addImage({
          filename: LOGO_RIGHT,
          extension: ext === "jpg" ? "jpeg" : ext,
        });
        ws.addImage(imgId, "D2:D4"); // right side
      }

      // ---------- TITLE ROW (row 5) ----------
      ws.mergeCells("A5:D5");
      cell = ws.getCell("A5");
      cell.value = title;
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: "left", vertical: "middle" };

      // ---------- TABLE HEADER (row 6) ----------
      const headerRow = ws.getRow(6);
      headerRow.getCell(1).value = "Item";
      headerRow.getCell(2).value = String(lyg);
      headerRow.getCell(3).value = String(lyg - 1);
      headerRow.getCell(4).value = String(lyg - 2);
      headerRow.font = { bold: true, size: 10 };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };

      // ---------- TABLE ROWS (rows 7–9) ----------
      let rowIdx = 7;

      // X row
      let row = ws.getRow(rowIdx++);
      row.getCell(1).value =
        " Number of students admitted in the corresponding First year + admitted in 2nd year via lateral entry and separated division , if applicableX  (Regular + in(COC) + in(COB) + Lateral)";
      row.getCell(2).value =
        `${r1.regularCount} + ${r1.inCOCCount} + ${r1.inCOBCount} + ${r1.lateralCount} = ${r1.X}`;
      row.getCell(3).value =
        `${r2.regularCount} + ${r2.inCOCCount} + ${r2.inCOBCount} + ${r2.lateralCount} = ${r2.X}`;
      row.getCell(4).value =
        `${r3.regularCount} + ${r3.inCOCCount} + ${r3.inCOBCount} + ${r3.lateralCount} = ${r3.X}`;
      row.alignment = { vertical: "top", wrapText: true };

      // Y row
      row = ws.getRow(rowIdx++);
      row.getCell(1).value = yRowLabel;
      row.getCell(2).value = yValues[0];
      row.getCell(3).value = yValues[1];
      row.getCell(4).value = yValues[2];
      row.alignment = { vertical: "top", wrapText: true };

      // SI row
      row = ws.getRow(rowIdx++);
      row.getCell(1).value = "Success Index (SI = Y / X)";
      row.getCell(2).value = siValues[0];
      row.getCell(3).value = siValues[1];
      row.getCell(4).value = siValues[2];
      row.alignment = { vertical: "middle", wrapText: true };

      // ---------- BORDERS (table area: rows 6..rowIdx-1, cols A..D) ----------
      const lastTableRow = rowIdx - 1;
      for (let r = 6; r <= lastTableRow; r++) {
        for (let cIdx = 1; cIdx <= 4; cIdx++) {
          const tableCell = ws.getRow(r).getCell(cIdx);
          tableCell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }
      }

      // ---------- SUMMARY BOX (Average SI & Assessment) ----------
      const summaryStart = lastTableRow + 2;

      ws.mergeCells(`A${summaryStart}:D${summaryStart}`);
      const avgCell = ws.getCell(`A${summaryStart}`);
      avgCell.value = `Average SI = ${avgSI.toFixed(3)}  ( = (SI(LYG) + SI(LYGM1) + SI(LYGM2))/3 )`;
      avgCell.font = { bold: true, size: 11 };
      avgCell.alignment = { horizontal: "left", vertical: "middle" };

      ws.mergeCells(`A${summaryStart + 1}:D${summaryStart + 1}`);
      const assessCell = ws.getCell(`A${summaryStart + 1}`);
      const assessValue = assessmentFactor * avgSI;
      assessCell.value = `Assessment = ${assessmentFactor} * Average SI ${assessmentLabelSuffix} = ${assessValue.toFixed(2)}`;
      assessCell.font = { bold: true, size: 11 };
      assessCell.alignment = { horizontal: "left", vertical: "middle" };

      return ws;
    }

    // Sheet 1: WITHOUT BACKLOG
    buildSheet({
      sheetName: "WithoutBacklogs",
      title: "Success rate WITHOUT backlog",
      yRowLabel:
        "Y  (Number of students who have graduated WITHOUT backlogs in stipulated period – only passed students in Final Result)",
      yValues: [r1.Y_withoutBacklogs, r2.Y_withoutBacklogs, r3.Y_withoutBacklogs],
      siValues: [
        r1.X ? r1.SI_noBacklog.toFixed(3) : "—",
        r2.X ? r2.SI_noBacklog.toFixed(3) : "—",
        r3.X ? r3.SI_noBacklog.toFixed(3) : "—",
      ],
      avgSI: avgSI_noBacklog,
      assessmentFactor: 25,
      assessmentLabelSuffix: "(without backlog)",
    });

    // Sheet 2: STIPULATED PERIOD
    buildSheet({
      sheetName: "StipulatedPeriod",
      title: "Success rate in stipulated period",
      yRowLabel:
        'Y  (Number of students who graduated in the stipulated period – passed in Final Result + "Yes" in Backlog cleared?)',
      yValues: [r1.Y_stipulated, r2.Y_stipulated, r3.Y_stipulated],
      siValues: [
        r1.X ? r1.SI.toFixed(3) : "—",
        r2.X ? r2.SI.toFixed(3) : "—",
        r3.X ? r3.SI.toFixed(3) : "—",
      ],
      avgSI: avgSI_stipulated,
      assessmentFactor: 15,
      assessmentLabelSuffix: "(stipulated period)",
    });

    // ---------- SEND FILE ----------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${batchNameParam}_success_rate_${lyg}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error', err);
    res.status(500).json({ message: 'Excel export failed', error: String(err) });
  }
});

module.exports = router;

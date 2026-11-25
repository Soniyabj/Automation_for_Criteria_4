const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const Student = require("../models/Student");
const Batch = require("../models/Batch");

// ---------- Asset resolution (logos) ----------
function findAsset(filename) {
  const candidates = [
    path.join(__dirname, "..", "assets", filename),
    path.join(process.cwd(), "backend", "assets", filename),
    path.join(process.cwd(), "assets", filename),
    path.join(process.cwd(), "frontend", "src", "assets", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const LOGO_LEFT = findAsset("mit.png");
const LOGO_RIGHT = findAsset("ise.jpg") || findAsset("ise.png");

// ---------- Helpers ----------
function drawCell(doc, text, x, y, w, h, options = {}) {
  const { align = "center", fontSize = 8, font = "Helvetica" } = options;
  doc.rect(x, y, w, h).stroke(); // border
  doc.font(font).fontSize(fontSize);
  doc.fillColor("black");
  const textX = x + 3;
  const textW = Math.max(10, w - 6);
  doc.text(String(text || ""), textX, y + 2, { width: textW, align });
}

// excluded: finalResult === 'False' OR any sem.excluded === true
function isExcludedStudent(s) {
  if (String(s.finalResult || "").toLowerCase() === "false") return true;
  if (Array.isArray(s.sem)) {
    for (const sem of s.sem) {
      if (sem && sem.excluded === true) return true;
    }
  }
  return false;
}

// has failed sem (passed === false and not excluded)
function hasFailedSem(semArr) {
  if (!Array.isArray(semArr)) return false;
  return semArr.some((s) => s && s.passed === false && !s.excluded);
}

// common PDF header (logos + text)
function drawPdfHeader(doc, batch) {
  const pageWidth = doc.page.width;
  const headerTop = 24;
  const logoW = 52;

  if (LOGO_LEFT) {
    try {
      doc.image(LOGO_LEFT, 40, headerTop, { width: logoW });
    } catch (e) {}
  }
  if (LOGO_RIGHT) {
    try {
      doc.image(LOGO_RIGHT, pageWidth - 40 - logoW, headerTop, { width: logoW });
    } catch (e) {}
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("black")
    .text("MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA", 0, headerTop + 4, {
      align: "center",
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("black")
    .text(
      "(An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi)",
      0,
      headerTop + 22,
      { align: "center" }
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("black")
    .text(
      "DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING",
      0,
      headerTop + 38,
      { align: "center" }
    );

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("black")
    .text(`Batch: ${batch.batchName}`, 0, headerTop + 56, {
      align: "center",
    });

  return headerTop;
}

// ===================================================
//                    PDF EXPORT
// ===================================================
router.get("/pdf/:branch/:batchName", async (req, res) => {
  try {
    const { branch, batchName } = req.params;

    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const students = await Student.find({ branch, batchName }).sort({ sno: 1 });

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 30, left: 30, right: 30, bottom: 30 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${branch}_${batchName}_results.pdf"`
    );
    doc.pipe(res);

    const pageHeight = doc.page.height;
    const headerTop = drawPdfHeader(doc, batch);

    // ---------- Table layout ----------
    let cursorY = headerTop + 78;
    const pageWidth = doc.page.width;
    const startX = 30;
    const usableWidth = pageWidth - 60;

    // Column widths
    const columns = [
      { key: "sno", label: "S.No", width: 22 },
      { key: "name", label: "Name", width: 120 },
      { key: "usn", label: "USN", width: 80 },
      ...Array.from({ length: 8 }).map((_, i) => ({
        key: `sem${i + 1}`,
        label: `Sem ${i + 1}`,
        width: 32,
      })),
      { key: "year1", label: "1st Yr", width: 30 },
      { key: "year2", label: "2nd Yr", width: 30 },
      { key: "year3", label: "3rd Yr", width: 30 },
      { key: "year4", label: "4th Yr", width: 30 },
      { key: "backlog", label: "Backlog\ncleared?", width: 38 },
      { key: "final", label: "Final\nResult", width: 42 },
      { key: "remarks", label: "Remarks", width: 52 },
      { key: "placed", label: "Placed", width: 34 },
    ];

    const totalWidth = columns.reduce((s, c) => s + c.width, 0);
    if (totalWidth > usableWidth) {
      const overflow = totalWidth - usableWidth;
      const nameCol = columns.find((c) => c.key === "name");
      if (nameCol) nameCol.width = Math.max(80, nameCol.width - overflow);
    }

    const headerHeight = 26;
    const baseRowPadding = 5;
    const totalRowWidth = columns.reduce((a, b) => a + b.width, 0);

    doc.lineWidth(0.7).strokeColor("black");

    // ---------- Header row ----------
    let x = startX;
    for (const col of columns) {
      drawCell(doc, col.label, x, cursorY, col.width, headerHeight, {
        fontSize: 8,
        align: "center",
      });
      x += col.width;
    }
    cursorY += headerHeight;

    // ---------- Data rows ----------
    for (let i = 0; i < students.length; i++) {
      const s = students[i];

      const rowVals = [];
      rowVals.push(String(i + 1));
      rowVals.push(s.name || "");
      rowVals.push(s.usn || "");

      // sem 1..8
      for (let k = 0; k < 8; k++) {
        const semObj =
          (s.sem && s.sem.find((x) => x && x.semNumber === k + 1)) ||
          (s.sem && s.sem[k]) ||
          null;
        if (semObj) {
          if (semObj.excluded === true) rowVals.push("False");
          else if (semObj.passed === true) rowVals.push("Pass");
          else if (semObj.passed === false) rowVals.push("Fail");
          else rowVals.push("");
        } else rowVals.push("");
      }

      // years 1..4
      for (let k = 0; k < 4; k++) {
        const yearObj =
          (s.year && s.year.find((x) => x && x.yearNumber === k + 1)) ||
          (s.year && s.year[k]) ||
          null;
        if (yearObj) {
          if (yearObj.passed === true) rowVals.push("Pass");
          else if (yearObj.passed === false) rowVals.push("Fail");
          else rowVals.push("");
        } else rowVals.push("");
      }

      const hasFail = hasFailedSem(s.sem);
      let backlogVal = "";
      if (hasFail && !isExcludedStudent(s)) {
        if (s.backlogCleared === true) backlogVal = "Yes";
        else if (s.backlogCleared === false) backlogVal = "No";
        else backlogVal = "--";
      } else {
        backlogVal = "";
      }
      rowVals.push(backlogVal);

      // Final result
      let finalVal = s.finalResult || "";
      if (String(finalVal).toLowerCase() === "pending") finalVal = "Pass";
      rowVals.push(finalVal);

      // Remarks
      rowVals.push(s.remarks || "");

      // Placed
      rowVals.push(s.placed ? "Yes" : "No");

      // --- dynamic height calculation ---
      let maxCellHeight = 0;
      const textFont = "Helvetica";
      const textSize = 8;

      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const text = rowVals[c] || "";
        doc.font(textFont).fontSize(textSize);
        const textW = Math.max(10, col.width - 6);
        const h = doc.heightOfString(String(text), {
          width: textW,
          align: col.key === "name" || col.key === "usn" ? "left" : "center",
        });
        const cellHeightNeeded = h + baseRowPadding + 4;
        if (cellHeightNeeded > maxCellHeight) maxCellHeight = cellHeightNeeded;
      }
      const rowHeight = Math.max(18, Math.ceil(maxCellHeight));

      // --- page break for table rows ---
      if (cursorY + rowHeight > pageHeight - 150) {
        doc.addPage({
          size: "A4",
          layout: "landscape",
          margins: { top: 30, left: 30, right: 30, bottom: 30 },
        });

        drawPdfHeader(doc, batch);

        cursorY = headerTop + 80;
        x = startX;
        for (const col of columns) {
          drawCell(doc, col.label, x, cursorY, col.width, headerHeight, {
            fontSize: 8,
            align: "center",
          });
          x += col.width;
        }
        cursorY += headerHeight;
      }

      // highlight excluded student row
      const excluded = isExcludedStudent(s);
      if (excluded) {
        doc.save();
        doc.fillColor("#FEF3C7").rect(startX, cursorY, totalRowWidth, rowHeight).fill();
        doc.restore();
      }

      // draw row cells
      x = startX;
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const align =
          col.key === "name" || col.key === "usn" || col.key === "remarks"
            ? "left"
            : "center";
        drawCell(doc, rowVals[c], x, cursorY, col.width, rowHeight, {
          fontSize: 8,
          align,
        });
        x += col.width;
      }

      cursorY += rowHeight;
    }

    // ========== Sem-wise aggregation (for table) ==========
    const semAgg = {};
    for (let i = 1; i <= 8; i++)
      semAgg["sem" + i] = { pass: 0, fail: 0, considered: 0 };

    for (const s of students) {
      for (let i = 1; i <= 8; i++) {
        const semObj = Array.isArray(s.sem)
          ? s.sem.find((x) => x && x.semNumber === i)
          : null;
        if (semObj) {
          if (semObj.excluded === true) {
            // skip
          } else if (semObj.passed === true) {
            semAgg["sem" + i].pass++;
            semAgg["sem" + i].considered++;
          } else if (semObj.passed === false) {
            semAgg["sem" + i].fail++;
            semAgg["sem" + i].considered++;
          }
        }
      }
    }

    cursorY += 10;

    // BEFORE drawing sem-wise + final box, ensure there is enough space
    const approxSemTableHeight =
      16 + // "Semister-wise Result Table" title
      20 + // header
      3 * 18 + // 3 metric rows
      10 + // gap
      16 + // "Final Result" title
      4 * 20; // 4 rows of final result
    if (cursorY + approxSemTableHeight > pageHeight - 40) {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margins: { top: 30, left: 30, right: 30, bottom: 30 },
      });
      drawPdfHeader(doc, batch);
      cursorY = headerTop + 80;
    }

    // ---------- Sem-wise table ----------
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("blue")
      .text("Semister-wise Result Table", startX, cursorY);
    doc.fillColor("black");
    cursorY += 16;

    const semCols = [
      { key: "metric", label: "Metric", width: 170 },
      ...Array.from({ length: 8 }).map((_, i) => ({
        key: `sem${i + 1}`,
        label: `Sem ${i + 1}`,
        width: Math.floor((usableWidth - 170) / 8),
      })),
    ];

    const semHeaderH = 20;
    let sx = startX;
    for (const col of semCols) {
      drawCell(doc, col.label, sx, cursorY, col.width, semHeaderH, {
        fontSize: 8,
        align: "center",
      });
      sx += col.width;
    }
    cursorY += semHeaderH;

    const semRowH = 18;
    const metrics = [
      { label: "Total Passed students", key: "pass" },
      { label: "Total Failed students", key: "fail" },
      { label: "Total students (Pass+Fail)", key: "total" },
    ];

    for (const m of metrics) {
      sx = startX;
      drawCell(doc, m.label, sx, cursorY, semCols[0].width, semRowH, {
        fontSize: 8,
        align: "left",
      });
      sx += semCols[0].width;
      for (let i = 1; i <= 8; i++) {
        const bucket = semAgg["sem" + i];
        let val = "";
        if (m.key === "pass") val = String(bucket.pass || 0);
        else if (m.key === "fail") val = String(bucket.fail || 0);
        else if (m.key === "total") val = String(bucket.considered || 0);
        drawCell(doc, val, sx, cursorY, semCols[i].width, semRowH, {
          fontSize: 8,
          align: "center",
        });
        sx += semCols[i].width;
      }
      cursorY += semRowH;
    }

    cursorY += 10;

    // ========== Final result success box ==========
    // IMPORTANT: keep this whole box on ONE PAGE
    const metricH = 20;
    const finalBoxTotalHeight = 16 + metricH * 4; // heading + 4 rows
    if (cursorY + finalBoxTotalHeight > pageHeight - 40) {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margins: { top: 30, left: 30, right: 30, bottom: 30 },
      });
      drawPdfHeader(doc, batch);
      cursorY = headerTop + 80;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("blue")
      .text("Final Result", startX, cursorY);
    doc.fillColor("black");
    cursorY += 16;

    const included = students.filter((s) => !isExcludedStudent(s));
    const passed = included.filter((s) => {
      const fr = String(s.finalResult || "").toLowerCase();
      return fr === "pass" || fr === "pending";
    }).length;
    const failed = included.filter(
      (s) => String(s.finalResult || "").toLowerCase() === "fail"
    ).length;
    const placed = included.filter((s) => !!s.placed).length;
    const total = passed + failed;

    const metricX = startX;
    const metricW_L = 260;
    const metricW_R = 90;

    // row 1: Passed
    drawCell(
      doc,
      "Passed students",
      metricX,
      cursorY,
      metricW_L,
      metricH,
      { align: "left", fontSize: 8 }
    );
    drawCell(
      doc,
      String(passed),
      metricX + metricW_L,
      cursorY,
      metricW_R,
      metricH,
      { align: "center", fontSize: 8 }
    );
    cursorY += metricH;

    // row 2: Failed
    drawCell(
      doc,
      "Failed students",
      metricX,
      cursorY,
      metricW_L,
      metricH,
      { align: "left", fontSize: 8 }
    );
    drawCell(
      doc,
      String(failed),
      metricX + metricW_L,
      cursorY,
      metricW_R,
      metricH,
      { align: "center", fontSize: 8 }
    );
    cursorY += metricH;

    // row 3: Total (Passed + Failed)  --> will now ALWAYS be fully inside the table
    drawCell(
      doc,
      "Total students (Passed + Failed)",
      metricX,
      cursorY,
      metricW_L,
      metricH,
      { align: "left", fontSize: 8 }
    );
    drawCell(
      doc,
      String(total),
      metricX + metricW_L,
      cursorY,
      metricW_R,
      metricH,
      { align: "center", fontSize: 8 }
    );
    cursorY += metricH;

    // row 4: Placed
    drawCell(
      doc,
      "Placed students",
      metricX,
      cursorY,
      metricW_L,
      metricH,
      { align: "left", fontSize: 8 }
    );
    drawCell(
      doc,
      String(placed),
      metricX + metricW_L,
      cursorY,
      metricW_R,
      metricH,
      { align: "center", fontSize: 8 }
    );

    doc.end();
  } catch (err) {
    console.error("PDF export error:", err);
    res.status(500).json({ message: "Error exporting PDF" });
  }
});

// ===================================================
//                    EXCEL EXPORT
// ===================================================
router.get("/excel/:branch/:batchName", async (req, res) => {
  try {
    const { branch, batchName } = req.params;
    const batch = await Batch.findOne({ branch, batchName });
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const students = await Student.find({ branch, batchName }).sort({ sno: 1 });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Results", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    const headers = [
      "S.No",
      "Name",
      "USN",
      "Sem1",
      "Sem2",
      "Sem3",
      "Sem4",
      "Sem5",
      "Sem6",
      "Sem7",
      "Sem8",
      "1st Year",
      "2nd Year",
      "3rd Year",
      "4th Year",
      "Backlog cleared?",
      "Final Result",
      "Remarks",
      "Placed",
    ];
    const totalCols = headers.length;

    // helper: 1 -> A, 2 -> B, ...
    function colLetter(n) {
      let s = "";
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = (n - 1 - m) / 26;
      }
      return s;
    }

    // ---------------- HEADER TEXT ROWS----------------

    // Row 1: blank (logos may overlap a bit)
    ws.addRow([""]);

    // Row 2: Institute name
    const r2 = ws.addRow([
      "MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA",
    ]);
    ws.mergeCells(r2.number, 1, r2.number, totalCols);
    r2.alignment = { horizontal: "center", vertical: "middle" };
    r2.font = { bold: true, size: 16 };

    // Row 3: Affiliation
    const r3 = ws.addRow([
      "(An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi)",
    ]);
    ws.mergeCells(r3.number, 1, r3.number, totalCols);
    r3.alignment = { horizontal: "center", vertical: "middle" };
    r3.font = { size: 11 };

    // Row 4: Department
    const r4 = ws.addRow([
      "DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING",
    ]);
    ws.mergeCells(r4.number, 1, r4.number, totalCols);
    r4.alignment = { horizontal: "center", vertical: "middle" };
    r4.font = { bold: true, size: 13 };

    // Row 5: Batch
    const r5 = ws.addRow([`Batch: ${batch.batchName}`]);
    ws.mergeCells(r5.number, 1, r5.number, totalCols);
    r5.alignment = { horizontal: "center", vertical: "middle" };
    r5.font = { size: 11 };

    // Row heights like your sheet
    ws.getRow(1).height = 8;
    ws.getRow(2).height = 26;
    ws.getRow(3).height = 20;
    ws.getRow(4).height = 20;
    ws.getRow(5).height = 18;

    // ---------------- LOGOS USING CELL RANGES (A2:B5 and R2:S5) ----------------

    if (LOGO_LEFT) {
      const ext = path.extname(LOGO_LEFT).toLowerCase().replace(".", "");
      const imgId = workbook.addImage({
        filename: LOGO_LEFT,
        extension: ext === "jpg" ? "jpeg" : ext,
      });
      // exactly like screenshot: left logo in A2:B5
      ws.addImage(imgId, "A2:B5");
    }

    if (LOGO_RIGHT) {
      const ext = path.extname(LOGO_RIGHT).toLowerCase().replace(".", "");
      const imgId = workbook.addImage({
        filename: LOGO_RIGHT,
        extension: ext === "jpg" ? "jpeg" : ext,
      });
      const lastColLetter = colLetter(totalCols);       // e.g. S
      const prevColLetter = colLetter(totalCols - 1);   // e.g. R
      const range = `${prevColLetter}2:${lastColLetter}5`; // R2:S5
      ws.addImage(imgId, range);
    }

    // ---------------- TABLE HEADER ----------------
    ws.addRow([]); // row 6 blank
    const headerRow = ws.addRow(headers); // row 7 like screenshot
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    const tableHeaderRowNumber = headerRow.number;

    // ---------------- DATA ROWS ----------------
    for (let i = 0; i < students.length; i++) {
      const s = students[i];

      const semVals = [];
      for (let k = 0; k < 8; k++) {
        const semObj =
          (s.sem && s.sem.find((x) => x && x.semNumber === k + 1)) ||
          (s.sem && s.sem[k]) ||
          null;
        if (semObj) {
          if (semObj.excluded === true) semVals.push("False");
          else if (semObj.passed === true) semVals.push("Pass");
          else if (semObj.passed === false) semVals.push("Fail");
          else semVals.push("");
        } else semVals.push("");
      }

      const yearVals = [];
      for (let k = 0; k < 4; k++) {
        const yobj =
          (s.year && s.year.find((x) => x && x.yearNumber === k + 1)) ||
          (s.year && s.year[k]) ||
          null;
        if (yobj) {
          yearVals.push(
            yobj.passed === true ? "Pass" : yobj.passed === false ? "Fail" : ""
          );
        } else yearVals.push("");
      }

      const hasFail = hasFailedSem(s.sem);
      let backlogVal = "";
      if (hasFail && !isExcludedStudent(s)) {
        if (s.backlogCleared === true) backlogVal = "Yes";
        else if (s.backlogCleared === false) backlogVal = "No";
        else backlogVal = "--";
      } else backlogVal = "";

      let finalVal = s.finalResult || "";
      if (String(finalVal).toLowerCase() === "pending") finalVal = "Pass";

      const rowValues = [
        i + 1,
        s.name || "",
        s.usn || "",
        ...semVals,
        ...yearVals,
        backlogVal,
        finalVal,
        s.remarks || "",
        s.placed ? "Yes" : "No",
      ];

      const row = ws.addRow(rowValues);

      if (isExcludedStudent(s)) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF3C7" },
        };
      }
    }

    // ---------------- SEM-WISE TABLE ----------------
    const semAgg = {};
    for (let i = 1; i <= 8; i++)
      semAgg["sem" + i] = { pass: 0, fail: 0, considered: 0 };

    for (const s of students) {
      for (let i = 1; i <= 8; i++) {
        const semObj = Array.isArray(s.sem)
          ? s.sem.find((x) => x && x.semNumber === i)
          : null;
        if (semObj) {
          if (semObj.excluded === true) {
            // skip
          } else if (semObj.passed === true) {
            semAgg["sem" + i].pass++;
            semAgg["sem" + i].considered++;
          } else if (semObj.passed === false) {
            semAgg["sem" + i].fail++;
            semAgg["sem" + i].considered++;
          }
        }
      }
    }

    ws.addRow([]);
    const semHeadingRow = ws.addRow(["Semister-wise Result Table"]);
    ws.mergeCells(semHeadingRow.number, 1, semHeadingRow.number, totalCols);
    semHeadingRow.getCell(1).font = {
      color: { argb: "FF0000FF" },
      bold: true,
    };
    semHeadingRow.alignment = { horizontal: "left" };
    ws.addRow([]);

    const semHeader = ["Metric"].concat(
      Array.from({ length: 8 }).map((_, i) => `Sem ${i + 1}`)
    );
    ws.addRow(semHeader);

    const passedRow = ["Total Passed students"].concat(
      Array.from({ length: 8 }).map(
        (_, i) => semAgg["sem" + (i + 1)].pass
      )
    );
    const failedRow = ["Total Failed students"].concat(
      Array.from({ length: 8 }).map(
        (_, i) => semAgg["sem" + (i + 1)].fail
      )
    );
    const totalRow = ["Total students (Pass+Fail)"].concat(
      Array.from({ length: 8 }).map(
        (_, i) => semAgg["sem" + (i + 1)].considered
      )
    );

    ws.addRow(passedRow);
    ws.addRow(failedRow);
    ws.addRow(totalRow);

    // ---------------- FINAL RESULT BOX ----------------
    ws.addRow([]);
    const finalHeading = ws.addRow(["Final Result"]);
    ws.mergeCells(finalHeading.number, 1, finalHeading.number, totalCols);
    finalHeading.getCell(1).font = {
      color: { argb: "FF0000FF" },
      bold: true,
    };
    finalHeading.alignment = { horizontal: "left" };
    ws.addRow([]);

    const included = students.filter((s) => !isExcludedStudent(s));
    const passedFinal = included.filter((s) => {
      const fr = String(s.finalResult || "").toLowerCase();
      return fr === "pass" || fr === "pending";
    }).length;
    const failedFinal = included.filter(
      (s) => String(s.finalResult || "").toLowerCase() === "fail"
    ).length;
    const placedFinal = included.filter((s) => !!s.placed).length;
    const totalFinal = passedFinal + failedFinal;

    ws.addRow(["Passed students", passedFinal]);
    ws.addRow(["Failed students", failedFinal]);
    ws.addRow(["Total students (Passed + Failed)", totalFinal]);
    ws.addRow(["Placed students", placedFinal]);

    // ---------------- COLUMN WIDTHS & BORDERS ----------------
    ws.columns = headers.map((h) => {
      if (h === "Name") return { width: 25 };
      if (h === "USN") return { width: 15 };
      if (h.startsWith("Sem")) return { width: 10 };
      if (h.includes("Year")) return { width: 10 };
      if (h === "Remarks") return { width: 20 };
      return { width: 14 };
    });

    const lastRow = ws.rowCount;
    const lastCol = headers.length;

    for (let r = tableHeaderRowNumber; r <= lastRow; r++) {
      const row = ws.getRow(r);
      if (!row.alignment) {
        row.alignment = {
          vertical: "middle",
          horizontal: r === tableHeaderRowNumber ? "center" : "left",
          wrapText: true,
        };
      }
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        if (!cell.font || !cell.font.color) {
          cell.font = { color: { argb: "FF000000" } };
        }
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${branch}_${batchName}_results.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ message: "Failed to export Excel" });
  }
});

// ==================== ADMISSION EXCEL EXPORT (HEADER + LOGOS LIKE RESULT SHEET) ====================
router.get("/admission/excel/:batchName", async (req, res) => {
  try {
    const { batchName } = req.params;

    const batch = await Batch.findOne({ batchName: Number(batchName) });
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const students = await Student.find({
      branch: batch.branch,
      batchName: batch.batchName,
    }).sort({ sno: 1 });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Admission Details", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    // ---------- TABLE HEADERS ----------
    const headers = [
      "S.No",
      "Name",
      "USN",
      "K-CET Rank",
      "COMED-K Rank",
      "Type of Admission",
      "Actual Category",
      "Admitted Category",
    ];
    const totalCols = headers.length;

    // helper: 1->A, 2->B, ...
    function colLetter(n) {
      let s = "";
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = (n - 1 - m) / 26;
      }
      return s;
    }

    // ---------- COLUMN WIDTHS (slightly compact like your result sheet) ----------
    ws.columns = [
      { width: 1},   // S.No
      { width: 15 },  // Name
      { width: 18 },  // USN
      { width: 25 },  // K-CET Rank
      { width: 25 },  // COMED-K Rank
      { width: 12 },  // Type of Admission
      { width: 10},  // Actual Category
      { width: 10},  // Admitted Category
    ];

    // ---------- HEADER ROW HEIGHTS ----------
    ws.getRow(1).height = 24; // title + logos
    ws.getRow(2).height = 18;
    ws.getRow(3).height = 18;
    ws.getRow(4).height = 18;
    ws.getRow(5).height = 6;  // small spacer row before table

    // ---------- HEADER TEXT DIRECTLY IN ROWS 1–4 ----------
    // Row 1: Institute name
    ws.mergeCells(1, 1, 1, totalCols);
    const c1 = ws.getCell(1, 1);
    c1.value = "MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA";
    c1.font = { bold: true, size: 14 };
    c1.alignment = { horizontal: "center", vertical: "middle" };

    // Row 2: affiliation line
    ws.mergeCells(2, 1, 2, totalCols);
    const c2 = ws.getCell(2, 1);
    c2.value =
      "(An Autonomous Institute affiliated to Visvesvaraya Technological University, Belagavi)";
    c2.font = { size: 10 };
    c2.alignment = { horizontal: "center", vertical: "middle" };

    // Row 3: department
    ws.mergeCells(3, 1, 3, totalCols);
    const c3 = ws.getCell(3, 1);
    c3.value = "DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING";
    c3.font = { bold: true, size: 11 };
    c3.alignment = { horizontal: "center", vertical: "middle" };

    // Row 4: Batch line
    ws.mergeCells(4, 1, 4, totalCols);
    const c4 = ws.getCell(4, 1);
    c4.value = `Batch: ${batch.batchName}`;
    c4.font = { size: 10 };
    c4.alignment = { horizontal: "center", vertical: "middle" };

    // ---------- LOGOS ALIGNED TO HEADER ZONE (ROWS 1–4) ----------
    if (LOGO_LEFT) {
      const ext = path.extname(LOGO_LEFT).toLowerCase().replace(".", "");
      const imgId = workbook.addImage({
        filename: LOGO_LEFT,
        extension: ext === "jpg" ? "jpeg" : ext,
      });
      // same 4-row block as in result sheet, but starting from row 1
      ws.addImage(imgId, "A1:B4");
    }

    if (LOGO_RIGHT) {
      const ext = path.extname(LOGO_RIGHT).toLowerCase().replace(".", "");
      const imgId = workbook.addImage({
        filename: LOGO_RIGHT,
        extension: ext === "jpg" ? "jpeg" : ext,
      });
      const lastCol = colLetter(totalCols);       // e.g. H
      const prevCol = colLetter(totalCols - 1);   // e.g. G
      ws.addImage(imgId, `${prevCol}1:${lastCol}4`);
    }

    // ---------- TABLE HEADER (ROW 6, after one spacer row) ----------
    // row 5 is the spacer (already "created" via height change)
    const headerRow = ws.getRow(6);
    headerRow.values = [null, ...headers]; // values[0] unused
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // ---------- TABLE DATA (from row 7 onwards) ----------
    let currentRow = 7;
    for (const s of students) {
      const row = ws.getRow(currentRow++);
      row.values = [
        null,
        s.sno,
        s.name,
        s.usn,
        s.kCetRank || "",
        s.comedkRank || "",
        s.admissionType || "",
        s.actualCategory || "",
        s.admittedCategory || "",
      ];
    }

    // ---------- APPLY BORDERS AROUND TABLE ----------
    const lastRow = ws.rowCount;
    for (let r = 6; r <= lastRow; r++) {
      const row = ws.getRow(r);
      if (!row.alignment) {
        row.alignment = {
          vertical: "middle",
          horizontal: r === 6 ? "center" : "left",
          wrapText: true,
        };
      }
      for (let c = 2; c <= totalCols + 1; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }

    // ---------- SEND FILE ----------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="admission_${batch.batchName}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Admission Excel export error:", err);
    res.status(500).json({ message: "Failed to export admission Excel" });
  }
});

// ==================== ADMISSION PDF EXPORT ====================
router.get('/admission/pdf/:batchName', async (req, res) => {
  try {
    const { batchName } = req.params;
    const batch = await Batch.findOne({ batchName: Number(batchName) });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const students = await Student.find({
      branch: batch.branch,
      batchName: batch.batchName
    }).sort({ sno: 1 });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 30, left: 30, right: 30, bottom: 30 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="admission_${batch.batchName}.pdf"`
    );
    doc.pipe(res);

    // header with logos like before
    const pageWidth = doc.page.width;
    const headerTop = 24;
    const logoW = 52;

    if (LOGO_LEFT) {
      try { doc.image(LOGO_LEFT, 40, headerTop, { width: logoW }); } catch (e) {}
    }
    if (LOGO_RIGHT) {
      try { doc.image(LOGO_RIGHT, pageWidth - 40 - logoW, headerTop, { width: logoW }); } catch (e) {}
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE, MANDYA', 0, headerTop + 4, { align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('DEPARTMENT OF INFORMATION SCIENCE AND ENGINEERING', 0, headerTop + 24, { align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Admission Details - Batch: ${batch.batchName}`, 0, headerTop + 40, { align: 'center' });

    let cursorY = headerTop + 70;
    const startX = 30;
    const columns = [
      { key: 'sno', label: 'S.No', width: 40 },
      { key: 'name', label: 'Name', width: 160 },
      { key: 'usn', label: 'USN', width: 90 },
      { key: 'kCetRank', label: 'K-CET Rank', width: 70 },
      { key: 'comedkRank', label: 'COMED-K Rank', width: 80 },
      { key: 'admissionType', label: 'Type of Admission', width: 90 },
      { key: 'actualCategory', label: 'Actual Category', width: 90 },
      { key: 'admittedCategory', label: 'Admitted Category', width: 100 },
    ];

    const headerH = 20;
    let x = startX;
    columns.forEach((col) => {
      doc.rect(x, cursorY, col.width, headerH).stroke();
      doc.fontSize(8).text(col.label, x + 3, cursorY + 4, {
        width: col.width - 6,
        align: 'center',
      });
      x += col.width;
    });
    cursorY += headerH;

    const rowH = 18;
    students.forEach((s) => {
      x = startX;
      const row = {
        sno: s.sno,
        name: s.name,
        usn: s.usn,
        kCetRank: s.kCetRank || '',
        comedkRank: s.comedkRank || '',
        admissionType: s.admissionType || '',
        actualCategory: s.actualCategory || '',
        admittedCategory: s.admittedCategory || '',
      };

      if (cursorY + rowH > doc.page.height - 40) {
        doc.addPage();
        cursorY = 50;
      }

      columns.forEach((col) => {
        doc.rect(x, cursorY, col.width, rowH).stroke();
        doc.fontSize(8).text(String(row[col.key] ?? ''), x + 3, cursorY + 4, {
          width: col.width - 6,
          align: col.key === 'name' ? 'left' : 'center',
        });
        x += col.width;
      });

      cursorY += rowH;
    });

    doc.end();
  } catch (err) {
    console.error('Admission PDF export error:', err);
    res.status(500).json({ message: 'Failed to export admission PDF' });
  }
});

module.exports = router;

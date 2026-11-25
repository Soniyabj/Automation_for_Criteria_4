// backend/utils/compute.js

function toLower(s) {
  try { return String(s || '').toLowerCase(); } catch(e) { return ''; }
}

/**
 * computeStudentResults(student)
 * - student.sem: array of { semNumber, passed: true/false/undefined, excluded: boolean }
 * - computes year results (1->2 = year1, 3->4 = year2, 5->6 = year3, 7->8 = year4)
 * - sets student.year = [{ yearNumber, passed: boolean, excluded?: boolean }, ...]
 * - sets student.finalResult
 *   - For Regular / detained / out(coc) / out(cob) => based on Year1–4
 *   - For in(coc) / in(cob) / lateral => based on Year2–4 only (Sem 3–8)
 */
function computeStudentResults(student) {
  // index sems by semNumber for quick lookup
  const bySem = {};
  for (const sem of student.sem || []) {
    if (sem && sem.semNumber) bySem[sem.semNumber] = sem;
  }

  // compute a year's result from two sem numbers a and b
  const computeYear = (a, b) => {
    const sa = bySem[a];
    const sb = bySem[b];

    // if any sem is explicitly excluded => year excluded
    if ((sa && sa.excluded === true) || (sb && sb.excluded === true)) return 'False';

    const pa = sa && typeof sa.passed === 'boolean' ? sa.passed : null;
    const pb = sb && typeof sb.passed === 'boolean' ? sb.passed : null;

    // if either sem explicitly failed => year Fail
    if (pa === false || pb === false) return 'Fail';

    // if both sems explicitly passed => Pass
    if (pa === true && pb === true) return 'Pass';

    // otherwise sems missing or incomplete => leave year empty (not decided yet)
    return '';
  };

  const y1 = computeYear(1, 2);
  const y2 = computeYear(3, 4);
  const y3 = computeYear(5, 6);
  const y4 = computeYear(7, 8);

  // Decide if this is a in(coc)/in(cob)/lateral student based on remarks
  const remark = toLower(student.remarks);
  const isSpecial =
    remark === 'in(coc)' ||
    remark === 'in(cob)' ||
    remark === 'lateral';

  // For special students → use only Year2–4; others → Year1–4
  const yearsForFinal = isSpecial ? [y2, y3, y4] : [y1, y2, y3, y4];

  // Determine finalResult:
  // - If any year in considered set is 'False' => Excluded
  // - Else if any is '' (empty) => final ""
  // - Else if any is 'Fail' => Fail
  // - Else if all are 'Pass' => Pass
  let final = '';

  if (yearsForFinal.includes('False')) {
    final = 'Excluded';
  } else if (yearsForFinal.includes('')) {
    final = '';
  } else if (yearsForFinal.includes('Fail')) {
    final = 'Fail';
  } else if (yearsForFinal.length > 0 && yearsForFinal.every(y => y === 'Pass')) {
    final = 'Pass';
  } else {
    final = '';
  }

  // Build student.year array
  student.year = [];
  if (y1 !== '') student.year.push({ yearNumber: 1, passed: y1 === 'Pass', excluded: y1 === 'False' });
  if (y2 !== '') student.year.push({ yearNumber: 2, passed: y2 === 'Pass', excluded: y2 === 'False' });
  if (y3 !== '') student.year.push({ yearNumber: 3, passed: y3 === 'Pass', excluded: y3 === 'False' });
  if (y4 !== '') student.year.push({ yearNumber: 4, passed: y4 === 'Pass', excluded: y4 === 'False' });

  student.finalResult = final;
  return student;
}

module.exports = { computeStudentResults };

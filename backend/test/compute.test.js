const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStudentResults } = require('../utils/compute');

test('regular student passes after all eight semesters pass', () => {
  const student = {
    remarks: 'Regular',
    sem: Array.from({ length: 8 }, (_, index) => ({
      semNumber: index + 1,
      passed: true,
      excluded: false,
    })),
  };

  computeStudentResults(student);

  assert.equal(student.finalResult, 'Pass');
  assert.equal(student.year.length, 4);
});

test('an excluded semester excludes the corresponding final result', () => {
  const student = {
    remarks: 'Regular',
    sem: [
      { semNumber: 1, passed: true, excluded: false },
      { semNumber: 2, excluded: true },
    ],
  };

  computeStudentResults(student);

  assert.equal(student.finalResult, 'Excluded');
});

test('lateral-entry student is assessed from the second year onward', () => {
  const student = {
    remarks: 'Lateral',
    sem: [3, 4, 5, 6, 7, 8].map((semNumber) => ({
      semNumber,
      passed: true,
      excluded: false,
    })),
  };

  computeStudentResults(student);

  assert.equal(student.finalResult, 'Pass');
});

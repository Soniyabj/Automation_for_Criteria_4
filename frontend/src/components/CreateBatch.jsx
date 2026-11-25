import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentTable from './StudentTable';
import { batches } from '../services/api';
import Header from './Header';

const FIXED_BRANCH = 'INFORMATION SCIENCE AND ENGINEERING';

const emptyStudent = () => ({
  name: '',
  usn: '',
  sem1: '', sem2: '', sem3: '', sem4: '',
  sem5: '', sem6: '', sem7: '', sem8: '',
  year1: '', year2: '', year3: '', year4: '',
  finalResult: '',
  remarks: '',
  placed: false,
  offerLetterPath: '',
  backlogCleared: undefined,
});

function computeStudentDerived(s) {
  const sem = {};
  for (let i = 1; i <= 8; i++) {
    sem[i] = (s[`sem${i}`] || '').toString().toLowerCase();
  }

  const computeYear = (a, b) => {
    if (sem[a] === 'false' || sem[b] === 'false') return 'False';
    if (sem[a] === 'fail' || sem[b] === 'fail') return 'Fail';
    if (sem[a] === 'pass' && sem[b] === 'pass') return 'Pass';
    return '';
  };

  const y1 = computeYear(1, 2);
  const y2 = computeYear(3, 4);
  const y3 = computeYear(5, 6);
  const y4 = computeYear(7, 8);

  let final = '';
  if ([y1, y2, y3, y4].includes('False')) final = 'Excluded';
  else if ([y1, y2, y3, y4].includes('Fail')) final = 'Fail';
  else if ([y1, y2, y3, y4].every((y) => y === 'Pass')) final = 'Pass';

  return { ...s, year1: y1, year2: y2, year3: y3, year4: y4, finalResult: final };
}

const rowNeedsBacklogCleared = (row) => {
  let fail = false;
  let excluded = false;

  for (let i = 1; i <= 8; i++) {
    const v = (row[`sem${i}`] || '').toString().trim().toLowerCase();
    if (v === 'fail') fail = true;
    if (v === 'false') excluded = true;
  }
  return fail && !excluded;
};

export default function CreateBatch() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [batchName, setBatchName] = useState('');
  const [students, setStudents] = useState([emptyStudent()]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [fileInputKey, setFileInputKey] = useState(Date.now()); // to reset input

  const addRow = () => setStudents(prev => [...prev, emptyStudent()]);
  const handleStudentsChange = (updated) =>
    setStudents(updated.map((s) => computeStudentDerived(s)));

  const checkDuplicateUSN = (arr) => {
    const seen = new Set();
    for (const s of arr) {
      const u = (s.usn || '').toString().trim().toLowerCase();
      if (!u) continue;
      if (seen.has(u)) return u;
      seen.add(u);
    }
    return null;
  };

  /* local validation only */
  const handleNext = () => {
    setMessage('');
    if (!batchName) {
      setMessage('Batch name required');
      return;
    }
    if (!/^[0-9]{4}$/.test(batchName)) {
      setMessage('Batch must be 4-digit year');
      return;
    }
    setStep(2);
  };

  const handleSave = async () => {
    setMessage('');

    if (!batchName) {
      setMessage('Batch name required');
      return;
    }

    // placed -> must have offerLetterPath
    for (const s of students) {
      if (s.placed && !s.offerLetterPath) {
        setMessage(`Student ${s.usn || '(unknown)'} marked placed but no offer letter.`);
        return;
      }
    }

    // backlog rule
    for (const s of students) {
      if (rowNeedsBacklogCleared(s) && typeof s.backlogCleared !== 'boolean') {
        setMessage(`Backlog cleared? required for ${s.usn || '(unknown)'}`);
        return;
      }
    }

    const dup = checkDuplicateUSN(students);
    if (dup) {
      setMessage(`Duplicate USN: ${dup.toUpperCase()}`);
      return;
    }

    // ignore fully empty rows
    const nonEmptyStudents = students.filter((s) => {
      const name = (s.name || '').toString().trim();
      const usn = (s.usn || '').toString().trim();
      return name || usn;
    });

    if (nonEmptyStudents.length === 0) {
      setMessage('Nothing to save – all rows are empty');
      return;
    }

    const payload = nonEmptyStudents.map((s, idx) => {
      const semArr = Array.from({ length: 8 }, (_, i) => {
        const raw = (s[`sem${i + 1}`] || '').toString().trim().toLowerCase();
        if (raw === 'pass') return { semNumber: i + 1, passed: true, excluded: false };
        if (raw === 'fail') return { semNumber: i + 1, passed: false, excluded: false };
        if (raw === 'false') return { semNumber: i + 1, passed: undefined, excluded: true };
        return { semNumber: i + 1, passed: undefined, excluded: false };
      });

      const name = (s.name || '').toString().trim();
      const usn = (s.usn || '').toString().trim();

      return {
        _id: undefined,
        sno: idx + 1,
        name,
        usn,
        branch: FIXED_BRANCH,
        batchName,
        remarks: s.remarks || '',
        placed: !!s.placed,
        offerLetterPath: s.offerLetterPath || '',
        sem: semArr,
        backlogCleared:
          typeof s.backlogCleared === 'boolean' ? s.backlogCleared : undefined,
        finalResult: s.finalResult || '',
      };
    });

    setLoading(true);
    try {
      // try bulk save; if backend returns 404 we create then retry
      await batches.bulkAddStudents(FIXED_BRANCH, batchName, { students: payload });
      setMessage('Students saved successfully.');
      setStep(1);
      setStudents([emptyStudent()]);
    } catch (err) {
      console.error('Save students error:', err);
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || String(err);

      if (status === 404 && String(msg).toLowerCase().includes('batch not found')) {
        // create then retry
        try {
          await batches.create({ batchName });
          await batches.bulkAddStudents(FIXED_BRANCH, batchName, { students: payload });
          setMessage('Batch created and students saved.');
          setStep(1);
          setStudents([emptyStudent()]);
        } catch (err2) {
          console.error('Retry after create failed:', err2);
          setMessage(err2?.response?.data?.message || String(err2));
        } finally {
          setLoading(false);
        }
        return;
      }

      setMessage(msg);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!batchName) {
      setMessage('Batch name required.');
      // reset file input
      setFileInputKey(Date.now());
      return;
    }

    setMessage('');
    setLoading(true);
    try {
      const resp = await batches.import(FIXED_BRANCH, batchName, file);
      const imported = resp?.data?.imported ?? resp?.data?.importedRows ?? 0;
      const created = resp?.data?.created ?? 0;
      const updated = resp?.data?.updated ?? 0;
      setMessage(`Imported ${imported} rows. Created: ${created}, Updated: ${updated}`);
      // reset file input so user can re-select the same file later if needed
      setFileInputKey(Date.now());
    } catch (err) {
      console.error('Import error:', err);
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || String(err);

      if (status === 404 && String(msg).toLowerCase().includes('batch not found')) {
        // create then retry
        try {
          await batches.create({ batchName });
          const resp2 = await batches.import(FIXED_BRANCH, batchName, file);
          const imported = resp2?.data?.imported ?? resp2?.data?.importedRows ?? 0;
          const created = resp2?.data?.created ?? 0;
          const updated = resp2?.data?.updated ?? 0;
          setMessage(`Batch created and imported ${imported} rows. Created:${created}, Updated:${updated}`);
        } catch (err2) {
          console.error('Import retry failed:', err2);
          setMessage(err2?.response?.data?.message || String(err2));
        } finally {
          setFileInputKey(Date.now());
          setLoading(false);
        }
        return;
      }

      setMessage(msg);
      setFileInputKey(Date.now());
      setLoading(false);
    }
  };

  return (
    <>
      <Header title={`Create Batch (Branch: ${FIXED_BRANCH})`} />

      <div className="min-h-[calc(100vh-140px)] bg-slate-50">
        <div className="px-4 py-6">

          {step === 1 && (
            <div className="max-w-5xl mx-auto bg-white p-6 rounded-lg border shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Batch Details</h2>

              <label className="block text-sm font-medium">Batch Name (Year)</label>
              <input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="border p-2 rounded w-full bg-slate-50"
                placeholder="2023"
              />

              {message && (
                <div className="mt-3 text-sm text-red-600">{message}</div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleNext}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded"
                >
                  Next
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="bg-slate-200 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-4">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={addRow}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Add Row
                </button>

                <label className="bg-indigo-600 text-white px-3 py-1 rounded cursor-pointer">
                  Import Excel
                  <input
                    key={fileInputKey}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImport}
                  />
                </label>

                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                >
                  {loading ? 'Saving…' : 'Save'}
                </button>
              </div>

              {message && (
                <div className="mb-3 text-sm text-red-600">{message}</div>
              )}

              <StudentTable
                students={students}
                onChange={handleStudentsChange}
                editable={true}
              />

              <button
                onClick={() => setStep(1)}
                className="mt-4 bg-slate-200 px-3 py-1 rounded"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

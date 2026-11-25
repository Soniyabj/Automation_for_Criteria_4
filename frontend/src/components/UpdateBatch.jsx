import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentTable from './StudentTable';
import { batches } from '../services/api';
import Header from './Header';

const FIXED_BRANCH = 'INFORMATION SCIENCE AND ENGINEERING';

function computeDerived(s) {
  const sem = {};
  for (let i = 1; i <= 8; i++) sem[i] = (s[`sem${i}`] || '').toString().toLowerCase();

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

  const remark = (s.remarks || '').toString().toLowerCase();
  const isSpecial = remark === 'in(coc)' || remark === 'in(cob)' || remark === 'lateral';
  const yearsForFinal = isSpecial ? [y2, y3, y4] : [y1, y2, y3, y4];

  let final = '';
  if (yearsForFinal.includes('False')) final = 'Excluded';
  else if (yearsForFinal.includes('')) final = '';
  else if (yearsForFinal.includes('Fail')) final = 'Fail';
  else if (yearsForFinal.every((y) => y === 'Pass')) final = 'Pass';
  else final = '';

  return { ...s, year1: y1, year2: y2, year3: y3, year4: y4, finalResult: final };
}

function startedAtSemGE3FromRow(row) {
  let minSem = Infinity;
  for (let i = 1; i <= 8; i++) {
    const raw = (row[`sem${i}`] || '').toString().trim().toLowerCase();
    if (raw === 'pass' || raw === 'fail' || raw === 'false') {
      minSem = Math.min(minSem, i);
    }
  }
  return minSem >= 3 && minSem !== Infinity;
}

// BacklogCleared rule: any Fail AND no False
const rowNeedsBacklogCleared = (row) => {
  let hasFail = false;
  let hasFalse = false;
  for (let i = 1; i <= 8; i++) {
    const v = (row[`sem${i}`] || '').toString().trim().toLowerCase();
    if (v === 'fail') hasFail = true;
    if (v === 'false') hasFalse = true;
  }
  return hasFail && !hasFalse;
};

export default function UpdateBatch() {
  const navigate = useNavigate();
  const [batchInput, setBatchInput] = useState('');
  const [batchesList, setBatchesList] = useState([]);
  const [students, setStudents] = useState([]);
  const [editingBatch, setEditingBatch] = useState('');
  const [message, setMessage] = useState('');
  const [fileInputKey, setFileInputKey] = useState(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await batches.list();
        // backend returns an array of Batch objects; map to batchName
        setBatchesList(res.data.map((b) => b.batchName));
      } catch (e) {
        console.error('Failed to list batches', e);
      }
    })();
  }, []);

  const fetchStudents = async () => {
    setMessage('');
    try {
      if (!batchInput) {
        setMessage('Select a batch first');
        return;
      }
      const res = await batches.get(FIXED_BRANCH, batchInput);
      const st = (res.data.students || []).map((s) => {
        const obj = {
          _id: s._id,
          name: s.name,
          usn: s.usn,
          remarks: s.remarks || '',
          placed: !!s.placed,
          offerLetterPath: s.offerLetterPath || '',
          branch: s.branch,
          batchName: s.batchName,
          finalResult: s.finalResult || '',
          backlogCleared:
            typeof s.backlogCleared === 'boolean' ? s.backlogCleared : undefined,
        };
        for (const sem of s.sem || []) {
          if (sem.passed === true) obj[`sem${sem.semNumber}`] = 'Pass';
          else if (sem.passed === false) obj[`sem${sem.semNumber}`] = 'Fail';
          else if (sem.excluded === true) obj[`sem${sem.semNumber}`] = 'False';
          else obj[`sem${sem.semNumber}`] = '';
        }
        return computeDerived(obj);
      });
      setStudents(st);
      setEditingBatch(batchInput);
    } catch (err) {
      console.error('Failed to fetch students:', err);
      setMessage(err?.response?.data?.message || String(err));
    }
  };

  const handleStudentsChange = (updated) => {
    const computed = updated.map((s) => computeDerived(s));
    setStudents(computed);
  };

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

  const handleSaveAll = async () => {
    setMessage('');

    // placed -> offer path present
    for (const s of students) {
      if (s.placed && !s.offerLetterPath) {
        setMessage(`Student ${s.usn} marked placed but no offer letter uploaded`);
        return;
      }
    }

    // backlogCleared required only when rule satisfied
    for (const s of students) {
      if (rowNeedsBacklogCleared(s) && typeof s.backlogCleared !== 'boolean') {
        setMessage(
          `Backlog cleared? is required for student ${s.usn || '(unknown)'} having failed semester`
        );
        return;
      }
    }

    const dup = checkDuplicateUSN(students);
    if (dup) {
      setMessage(`Duplicate USN in form: ${dup.toUpperCase()}`);
      return;
    }

    // remarks for new COC/COB/Lateral students
    for (const s of students) {
      if (!s._id) {
        if (startedAtSemGE3FromRow(s) && !(s.remarks || '').toString().trim()) {
          setMessage(`Remarks required for newly added COC/COB/Lateral student ${s.usn || '(unknown)'}`);
          return;
        }
      }
    }

    // filter out completely empty rows (no name and no USN)
    const nonEmptyStudents = students.filter((s) => {
      const name = (s.name || '').toString().trim();
      const usn = (s.usn || '').toString().trim();
      return name || usn;
    });

    if (nonEmptyStudents.length === 0) {
      setMessage('Nothing to save – all rows are empty');
      return;
    }

    // build payload INCLUDING _id, branch, batchName
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
        _id: s._id || undefined,         // keep _id for updates
        sno: idx + 1,
        name,
        usn,
        branch: s.branch || FIXED_BRANCH,
        batchName: s.batchName || editingBatch || batchInput,
        remarks: s.remarks || '',
        placed: !!s.placed,
        offerLetterPath: s.offerLetterPath || '',
        sem: semArr,
        backlogCleared:
          typeof s.backlogCleared === 'boolean' ? s.backlogCleared : undefined,
        finalResult: s.finalResult || '',
      };
    });

    try {
      const resp = await batches.bulkAddStudents(FIXED_BRANCH, batchInput, { students: payload });
      const created = resp?.data?.created ?? 0;
      const updated = resp?.data?.updated ?? 0;
      setMessage(`${created} created, ${updated} updated`);
      await fetchStudents();
    } catch (err) {
      console.error('Save all error:', err);
      setMessage(err?.response?.data?.message || String(err));
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMessage('');
    try {
      const resp = await batches.import(FIXED_BRANCH, batchInput, file);
      const imported = resp?.data?.imported ?? resp?.data?.importedRows ?? 0;
      const created = resp?.data?.created ?? 0;
      const updated = resp?.data?.updated ?? 0;
      setMessage(`Imported ${imported} rows. Created:${created} Updated:${updated}`);
      // reset file input so same file can be chosen again
      setFileInputKey(Date.now());
      await fetchStudents();
    } catch (err) {
      console.error('Import error:', err);
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || String(err);

      // if batch not found, suggest creating it
      if (status === 404 && String(msg).toLowerCase().includes('batch not found')) {
        setMessage('Batch not found. Create the batch first (or use Create Batch).');
      } else {
        setMessage(msg);
      }
      // reset file input
      setFileInputKey(Date.now());
    }
  };

  return (
    <>
      <Header title={`Update Batch (Branch: ${FIXED_BRANCH})`} />

      {/* STEP 1: Select batch */}
      {!editingBatch && (
        <div className="min-h-[calc(100vh-140px)] bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 md:p-8">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-3 mb-4">
                Load Existing Batch
              </h2>

              <div className="max-w-md space-y-3">
                <label className="block text-sm font-medium text-slate-700">Select Batch</label>
                <select
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50"
                >
                  <option value="">-- choose batch --</option>
                  {batchesList.map((b, i) => (
                    <option key={i} value={b}>{b}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Choose an existing batch to view and update student records.
                </p>

                {message && (
                  <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {message}
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={fetchStudents}
                    disabled={!batchInput}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Load
                  </button>
                  <button onClick={() => navigate('/')} className="px-4 py-2 bg-slate-100 rounded">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Table view */}
      {editingBatch && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded">
              ← Back to Home
            </button>
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Branch:</span> {FIXED_BRANCH}
              <span className="mx-2">·</span>
              <span className="font-semibold">Batch:</span> {editingBatch}
            </div>
          </div>

          <div className="flex gap-2 mt-4 items-start">
            <label className="bg-indigo-600 text-white px-3 py-1 cursor-pointer rounded">
              Import Excel
              <input
                key={fileInputKey}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImport}
                className="hidden"
              />
            </label>

            <button
              onClick={() => setStudents((prev) => [...prev, {}])}
              className="bg-green-600 text-white px-3 py-1 rounded"
            >
              Add Row
            </button>

            <button
              onClick={handleSaveAll}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Save All
            </button>
          </div>

          <div className="mt-4">
            <StudentTable
              students={students}
              onChange={handleStudentsChange}
              editable={true}
            />
          </div>

          {message && <div className="mt-3 text-sm text-red-600">{message}</div>}
        </div>
      )}
    </>
  );
}

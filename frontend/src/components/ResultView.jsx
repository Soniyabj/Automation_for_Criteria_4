// src/components/ResultView.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentTable from './StudentTable';
import { batches, exportApi } from '../services/api';
import Header from './Header';

const FIXED_BRANCH = 'INFORMATION SCIENCE AND ENGINEERING';

export default function ResultView() {
  const navigate = useNavigate();
  const [batchesList, setBatchesList] = useState([]);
  const [batch, setBatch] = useState('');
  const [students, setStudents] = useState([]);
  const [semAgg, setSemAgg] = useState({});
  const [yearAgg, setYearAgg] = useState({});
  const [finalAgg, setFinalAgg] = useState({});
  const [success, setSuccess] = useState({
    passed: 0,
    failed: 0,
    total: 0,
    placed: 0,
  });
  const [message, setMessage] = useState('');

  // Load list of batches
  useEffect(() => {
    (async () => {
      try {
        const res = await batches.list();
        setBatchesList(res.data.map((b) => b.batchName));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const fetch = async () => {
    setMessage('');
    try {
      const res = await batches.get(FIXED_BRANCH, batch);
      const st = res.data.students.map((s) => {
        const obj = {
          _id: s._id,
          name: s.name,
          usn: s.usn,
          remarks: s.remarks || '',
          placed: !!s.placed,
          finalResult: s.finalResult || '',
          offerLetterPath: s.offerLetterPath || '',
          branch: s.branch,
          batchName: s.batchName,
          backlogCleared:
            typeof s.backlogCleared === 'boolean' ? s.backlogCleared : undefined,
        };
        for (const sem of s.sem || []) {
          if (sem.passed === true) obj[`sem${sem.semNumber}`] = 'Pass';
          else if (sem.passed === false) obj[`sem${sem.semNumber}`] = 'Fail';
          else if (sem.excluded === true) obj[`sem${sem.semNumber}`] = 'False';
          else obj[`sem${sem.semNumber}`] = '';
        }
        for (const y of s.year || []) {
          obj[`year${y.yearNumber}`] =
            y.passed === true ? 'Pass' : y.passed === false ? 'Fail' : '';
        }
        return obj;
      });
      setStudents(st);

      // Aggregates
      try {
        const aggRes = await batches.aggregates(FIXED_BRANCH, batch);
        setSemAgg(aggRes.data.semAgg || {});
        setYearAgg(aggRes.data.yearAgg || {});
        setFinalAgg(aggRes.data.finalAgg || {});
        setSuccess({
          passed: aggRes.data.finalAgg.pass || 0,
          failed: aggRes.data.finalAgg.fail || 0,
          total:
            (aggRes.data.finalAgg.pass || 0) +
            (aggRes.data.finalAgg.fail || 0),
          placed:
            aggRes.data.finalAgg.placed ||
            aggRes.data.totalPlaced ||
            st.filter((s) => s.placed).length,
        });
      } catch (e) {
        console.error('aggregates fetch failed', e);
        // Fallback if aggregate endpoint fails
        const included = st.filter(
          (s) =>
            s.finalResult !== 'Excluded' &&
            ![1, 2, 3, 4, 5, 6, 7, 8].some(
              (i) =>
                (s[`sem${i}`] || '')
                  .toString()
                  .toLowerCase() === 'false'
            )
        );
        const passed = included.filter((s) => s.finalResult === 'Pass').length;
        const failed = included.filter((s) => s.finalResult === 'Fail').length;
        const placed = included.filter((s) => s.placed).length;
        const total = passed + failed;
        setSuccess({ passed, failed, total, placed });
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to load batch data.');
    }
  };

  const downloadExcel = async () => {
    try {
      const res = await exportApi.excel(FIXED_BRANCH, batch);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${FIXED_BRANCH}_${batch}_results.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      setMessage('Excel download failed');
    }
  };

  const downloadPDF = async () => {
    try {
      const res = await exportApi.pdf(FIXED_BRANCH, batch);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${FIXED_BRANCH}_${batch}_results.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      setMessage('PDF download failed');
    }
  };

  return (
    <>
      <Header title={`View Results (Branch: ${FIXED_BRANCH})`} />

      <div className="min-h-[calc(100vh-140px)] bg-slate-50">
        {/* Centered container for top bar + front card */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Top bar – same style as UpdateBatch */}
          <div className="flex items-center justify-between mb-4">
            <button
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              onClick={() => navigate('/')}
            >
              ← Back to Home
            </button>
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Branch:</span> {FIXED_BRANCH}
              {batch && (
                <>
                  <span className="mx-2">·</span>
                  <span className="font-semibold">Batch:</span> {batch}
                </>
              )}
            </div>
          </div>

          {/* FRONT CARD – only when no results loaded */}
          {students.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 md:p-8 mb-2">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-3 mb-4">
                View Batch Results
              </h2>

              <div className="max-w-md space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Select Batch
                </label>
                <select
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                >
                  <option value="">-- choose batch --</option>
                  {batchesList.map((b, i) => (
                    <option key={i} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Choose a batch to view the detailed semester-wise and final
                  result statistics.
                </p>
              </div>

              {message && (
                <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 max-w-md">
                  {message}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={fetch}
                  disabled={!batch}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  Load Results
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                  onClick={() => navigate('/')}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Optional message after results are loaded */}
          {message && students.length > 0 && (
            <div className="mt-3 text-sm text-red-600">{message}</div>
          )}
        </div>

        {/* RESULTS SECTION – full-width area */}
        {students.length > 0 && (
          <div className="w-full mt-2 px-4 pb-6">
            {/* Student Table full width */}
            <div className="border border-slate-200 rounded-md bg-white mb-6">
              <StudentTable
                students={students}
                onChange={() => {}}
                editable={false}
              />
            </div>

            {/* Summary + Export */}
            <div className="grid grid-cols-1 gap-4">
              {/* Per-semester success rate */}
              <div className="p-4 border rounded bg-white overflow-x-auto">
                <h3 className="font-semibold mb-2">
                  Per-semester Success Rate
                </h3>
                <table className="w-full text-sm table-auto border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 border">Semester</th>
                      <th className="p-2 border">Passed</th>
                      <th className="p-2 border">Failed</th>
                      <th className="p-2 border">Total (Pass+Fail)</th>
                      <th className="p-2 border">Pass %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => {
                      const key = 'sem' + (i + 1);
                      const obj =
                        semAgg[key] || {
                          pass: 0,
                          fail: 0,
                          total_students: 0,
                          passPercent: 0,
                        };
                      return (
                        <tr key={i}>
                          <td className="p-2 border">Sem {i + 1}</td>
                          <td className="p-2 border text-center">
                            {obj.pass || 0}
                          </td>
                          <td className="p-2 border text-center">
                            {obj.fail || 0}
                          </td>
                          <td className="p-2 border text-center">
                            {obj.total_students || 0}
                          </td>
                          <td className="p-2 border text-center">
                            {(obj.passPercent || 0) + '%'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Final result success table */}
              <div className="p-4 border rounded bg-white">
                <h3 className="font-semibold mb-2">
                  Final Result success rate table
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="p-2 border">Passed</td>
                      <td className="p-2 border">
                        {finalAgg.pass || success.passed || 0}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Failed</td>
                      <td className="p-2 border">
                        {finalAgg.fail || success.failed || 0}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Total (Pass + Fail)</td>
                      <td className="p-2 border">
                        {(finalAgg.pass || 0) + (finalAgg.fail || 0)}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Placed</td>
                      <td className="p-2 border">
                        {finalAgg.placed || success.placed || 0}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Pass % (Final)</td>
                      <td className="p-2 border">
                        {(finalAgg.passPercent || 0) + '%'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Export buttons */}
              <div className="p-4 border rounded bg-white">
                <h3 className="font-semibold mb-2">Export</h3>
                <button
                  className="bg-green-600 text-white px-3 py-1 mr-2"
                  onClick={downloadExcel}
                >
                  Excel
                </button>
                <button
                  className="bg-purple-600 text-white px-3 py-1"
                  onClick={downloadPDF}
                >
                  PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// src/components/StudentTable.jsx 
import React, { useState, useRef, useEffect } from 'react';
import { batches } from '../services/api';

export default function StudentTable({ students, onChange, editable }) {
  const [editingUsnRow, setEditingUsnRow] = useState(null); // index being edited
  const [usnDraft, setUsnDraft] = useState('');
  const inputRef = useRef(null);
  const origUsnRef = useRef('');

  useEffect(() => {
    if (editingUsnRow !== null && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editingUsnRow]);

  // helper: first semester index (1..8) that is marked "False"
  const firstFalseSemIndex = (row) => {
    if (!row) return null;
    for (let i = 1; i <= 8; i++) {
      const v = (row[`sem${i}`] || '').toString().trim().toLowerCase();
      if (v === 'false') return i;
    }
    return null;
  };

  const handleChange = (index, field, value) => {
    // USN is allowed even when editable=false (for UpdateBatch behavior)
    if (!editable && field !== 'usn') return;

    const updated = [...students];
    const row = { ...updated[index] };

    // Special logic for sem fields:
    // if any semX is set to "False", then sem(X+1..8) are cleared.
    if (field.startsWith('sem')) {
      row[field] = value;

      const semNumber = parseInt(field.replace('sem', ''), 10);
      const isFalse = (value || '').toString().trim().toLowerCase() === 'false';

      if (Number.isInteger(semNumber) && semNumber >= 1 && semNumber <= 8) {
        if (isFalse) {
          for (let j = semNumber + 1; j <= 8; j++) {
            row[`sem${j}`] = '';
          }
        }
      }

      updated[index] = row;
      onChange(updated);
      return;
    }

    row[field] = value;
    updated[index] = row;
    onChange(updated);
  };

  const isExcluded = (student) => {
    if (!student) return false;
    const fin = (student.finalResult || '').toString().toLowerCase();
    if (fin === 'excluded' || fin === 'false') return true;
    for (let i = 1; i <= 8; i++) {
      if (((student[`sem${i}`] || '').toString().toLowerCase()) === 'false') return true;
    }
    if (Array.isArray(student.sem)) {
      if ((student.sem || []).some(s => !!s.excluded)) return true;
    }
    return false;
  };

  const uploadOffer = async (file, student, idx) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('File too large. Max 2 MB');
      return;
    }
    try {
      const sid = student._id;
      if (!sid) { alert('Upload requires saved student record (please save batch first)'); return; }
      if (!student.placed) { alert('Cannot upload offer letter unless student is marked placed'); return; }

      const res = await batches.uploadOffer(student.branch, student.batchName, sid, file);
      handleChange(idx, 'offerLetterPath', res.data.fileUrl || res.data.fileUrl);
    } catch (err) {
      console.error(err);
      alert('Offer upload failed');
    }
  };

  // last 7 uppercase characters for collapsed USN view
  const last7 = (raw) => {
    if (raw === undefined || raw === null) return '';
    const s = String(raw).trim().toUpperCase();
    if (s.length <= 7) return s;
    return s.slice(-7);
  };

  // helper: does this row need backlogCleared?
  // Rule: at least one Fail AND no False in any sem.
  const needsBacklogCleared = (row) => {
    if (!row) return false;
    let hasFail = false;
    let hasFalse = false;
    for (let i = 1; i <= 8; i++) {
      const v = (row[`sem${i}`] || '').toString().trim().toLowerCase();
      if (v === 'fail') hasFail = true;
      if (v === 'false') hasFalse = true;
    }
    return hasFail && !hasFalse;
  };

  const openUsnEditor = (idx, fullUsn = '') => {
    origUsnRef.current = fullUsn || '';
    setEditingUsnRow(idx);
    setUsnDraft(fullUsn || '');
  };

  const commitUsnEdit = (idx) => {
    if (editable) {
      handleChange(idx, 'usn', usnDraft);
    }
    setEditingUsnRow(null);
    setUsnDraft('');
    origUsnRef.current = '';
  };

  const cancelUsnEdit = (idx) => {
    if (editable && typeof idx === 'number') {
      handleChange(idx, 'usn', origUsnRef.current || '');
    }
    setEditingUsnRow(null);
    setUsnDraft('');
    origUsnRef.current = '';
  };

  return (
    <div className="overflow-x-auto mt-6">
      {/* vertical scroll area so header can be sticky */}
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="table-auto border-collapse border border-gray-300 w-full text-sm">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="border px-2 w-12 text-center">S.No</th>
              <th className="border px-2 min-w-[160px] text-left">Name</th>
              <th className="border px-2 min-w-[120px] text-left">USN</th>
              {[...Array(8)].map((_, i) => (
                <th
                  key={i}
                  className="border px-2 min-w-[80px] text-center"
                >
                  Sem {i + 1}
                </th>
              ))}
              {[...Array(4)].map((_, i) => (
                <th
                  key={i}
                  className="border px-2 min-w-[70px] text-center"
                >
                  {i + 1}st Year
                </th>
              ))}
              <th className="border px-2 min-w-[110px] text-center">
                Backlog cleared?
              </th>
              <th className="border px-2 min-w-[90px] text-center">
                Final Result
              </th>
              <th className="border px-2 min-w-[120px] text-center">
                Remarks
              </th>
              <th className="border px-2 min-w-[80px] text-center">
                Placed
              </th>
              <th className="border px-2 min-w-[140px] text-center">
                Offer Letter
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, idx) => {
              const excluded = isExcluded(s);
              const usnValue = s.usn || '';
              const isNewRow = !s._id;
              const showInput = (editingUsnRow === idx) || (editable && isNewRow);
              const needBacklog = needsBacklogCleared(s);
              const firstFalse = firstFalseSemIndex(s); // first sem = "False"

              return (
                <tr
                  key={idx}
                  style={excluded ? { backgroundColor: '#FEF3C7' } : undefined}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="border px-2 text-center">{idx + 1}</td>

                  <td className="border px-2">
                    <input
                      type="text"
                      value={s.name || ''}
                      disabled={!editable}
                      onChange={(e) => handleChange(idx, 'name', e.target.value)}
                      className="w-full border-none outline-none bg-transparent"
                    />
                  </td>

                  <td className="border px-2">
                    {showInput ? (
                      <input
                        ref={editingUsnRow === idx ? inputRef : null}
                        type="text"
                        value={editingUsnRow === idx ? usnDraft : (s.usn || '')}
                        onChange={(e) => {
                          const v = e.target.value;
                          setUsnDraft(v);
                          if (editable) handleChange(idx, 'usn', v);
                        }}
                        onBlur={() => {
                          if (editingUsnRow === idx) commitUsnEdit(idx);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitUsnEdit(idx);
                          else if (e.key === 'Escape') cancelUsnEdit(idx);
                        }}
                        className="w-full border-none outline-none bg-transparent"
                        placeholder="Enter full USN"
                      />
                    ) : (
                      <div
                        onClick={() => openUsnEditor(idx, usnValue)}
                        title={usnValue}
                        style={{
                          cursor: 'text',
                          userSelect: 'text',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textAlign: 'left',
                        }}
                        className="w-full"
                      >
                        {last7(usnValue)}
                      </div>
                    )}
                  </td>

                  {Array.from({ length: 8 }, (_, i) => {
                    const semNumber = i + 1;
                    // if any sem is False at index k, sem(k+1..8) disabled:
                    const shouldDisable =
                      !editable ||
                      (firstFalse !== null && semNumber > firstFalse);

                    return (
                      <td key={i} className="border px-2 text-center min-w-[80px]">
                        {editable ? (
                          <select
                            value={s[`sem${semNumber}`] || ''}
                            onChange={(e) =>
                              handleChange(idx, `sem${semNumber}`, e.target.value)
                            }
                            disabled={shouldDisable}
                            className={`w-full border-none outline-none bg-transparent text-center ${
                              shouldDisable ? 'text-gray-400' : ''
                            }`}
                          >
                            <option value="">--</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                            <option value="False">False</option>
                          </select>
                        ) : (
                          s[`sem${semNumber}`] || ''
                        )}
                      </td>
                    );
                  })}

                  {Array.from({ length: 4 }, (_, i) => (
                    <td
                      key={i}
                      className="border px-2 text-center min-w-[70px]"
                    >
                      {s[`year${i + 1}`] || ''}
                    </td>
                  ))}

                  {/* Backlog cleared? column */}
                  <td className="border px-2 text-center min-w-[110px]">
                    {editable ? (
                      needBacklog ? (
                        <select
                          value={
                            s.backlogCleared === true
                              ? 'Yes'
                              : s.backlogCleared === false
                              ? 'No'
                              : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            let val;
                            if (v === 'Yes') val = true;
                            else if (v === 'No') val = false;
                            else val = undefined;
                            handleChange(idx, 'backlogCleared', val);
                          }}
                          className="w-full border-none outline-none bg-transparent text-center"
                        >
                          <option value="">--</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      ) : (
                        <span>-</span>
                      )
                    ) : needBacklog ? (
                      s.backlogCleared === true
                        ? 'Yes'
                        : s.backlogCleared === false
                        ? 'No'
                        : ''
                    ) : (
                      ''
                    )}
                  </td>

                  <td className="border px-2 text-center min-w-[90px]">
                    {s.finalResult || ''}
                  </td>

                  <td className="border px-2 min-w-[120px]">
                    {editable ? (
                      <select
                        value={s.remarks || ''}
                        onChange={(e) => handleChange(idx, 'remarks', e.target.value)}
                        className="w-full border-none outline-none bg-transparent"
                      >
                        <option value="">-- Select --</option>
                        <option value="Regular">Regular</option>
                        <option value="in(coc)">in(coc)</option>
                        <option value="in(cob)">in(cob)</option>
                        <option value="lateral">lateral</option>
                        <option value="detained">detained</option>
                        <option value="out(coc)">out(coc)</option>
                        <option value="out(cob)">out(cob)</option>
                      </select>
                    ) : (
                      s.remarks || ''
                    )}
                  </td>

                  <td className="border px-2 text-center min-w-[80px]">
                    {editable ? (
                      <select
                        value={s.placed ? 'Yes' : 'No'}
                        onChange={(e) =>
                          handleChange(idx, 'placed', e.target.value === 'Yes')
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      >
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    ) : (
                      s.placed ? 'Yes' : 'No'
                    )}
                  </td>

                  <td className="border px-2 min-w-[140px]">
                    {editable ? (
                      <>
                        <input
                          type="file"
                          onChange={(e) => uploadOffer(e.target.files[0], s, idx)}
                          disabled={!s.placed}
                          className="w-full text-xs"
                        />
                        {!s.placed && (
                          <div className="text-xs text-gray-500">
                            Mark placed to upload
                          </div>
                        )}
                      </>
                    ) : s.offerLetterPath ? (
                      <a
                        href={`http://127.0.0.1:5000${s.offerLetterPath}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline text-xs"
                      >
                        View
                      </a>
                    ) : (
                      'No File'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// src/components/AdmissionDetails.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { batches, admission } from "../services/api";

export default function AdmissionDetails() {
  const navigate = useNavigate();
  const [allBatches, setAllBatches] = useState([]);
  const [batchNameInput, setBatchNameInput] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("select"); // 'select' | 'table'
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await batches.list();
        setAllBatches(res.data || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const availableBatchNames = Array.from(
    new Set((allBatches || []).map((b) => String(b.batchName)))
  );

  const handleNextFromSelect = async () => {
    setError("");
    setInfo("");
    const bn = batchNameInput.trim();
    if (!bn) {
      setError("Please enter/select a batch name.");
      return;
    }

    if (!availableBatchNames.includes(bn)) {
      setError(
        "This batch is not created. Please create the batch first from 'Create Batch'."
      );
      return;
    }

    try {
      setLoading(true);
      const res = await admission.getBatch(bn);
      setSelectedBatch(res.data.batch);
      setRows(res.data.rows || []);
      setPhase("table");
    } catch (err) {
      console.error(err);
      setError("Failed to load admission data.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async () => {
    if (!selectedBatch) return;
    setError("");
    setInfo("");
    try {
      setLoading(true);
      const res = await admission.getBatch(selectedBatch.batchName);
      setRows(res.data.rows || []);
      setInfo("Latest data loaded.");
    } catch (err) {
      console.error(err);
      setError("Failed to reload data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBatch) return;
    setError("");
    setInfo("");
    try {
      setLoading(true);
      await admission.saveBatch(selectedBatch.batchName, rows);
      setInfo("Admission details saved successfully.");
    } catch (err) {
      console.error(err);
      setError("Failed to save admission data.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        sno: prev.length + 1,
        name: "",
        usn: "",
        kCetRank: "",
        comedkRank: "",
        admissionType: "",
        actualCategory: "",
        admittedCategory: "",
      },
    ]);
  };

  const handleChangeRow = (index, field, value) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBatch) return;
    setError("");
    setInfo("");

    try {
      setLoading(true);
      await admission.importExcel(selectedBatch.batchName, file);
      const res = await admission.getBatch(selectedBatch.batchName);
      setRows(res.data.rows || []);
      setInfo("Excel imported successfully.");
      e.target.value = null;
    } catch (err) {
      console.error(err);
      setError(
        "Failed to import Excel. Make sure it has S.No, Name and USN columns."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!selectedBatch) return;
    window.open(admission.excelUrl(selectedBatch.batchName), "_blank");
  };

  const handleDownloadPdf = () => {
    if (!selectedBatch) return;
    window.open(admission.pdfUrl(selectedBatch.batchName), "_blank");
  };

  /* ===================== RENDER ===================== */

  if (phase === "select") {
    return (
      <>
        <Header />

        {/* Soft grey background, center the card nicely */}
        <div className="min-h-[70vh] bg-gray-100 flex items-center justify-center py-10">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-gray-200">
            {/* Colored top strip for more professional feel */}
            <div className="h-2 w-full rounded-t-2xl bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500" />

            <div className="p-6">
              {/* Title + Back to home */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Admission Details
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter batch to manage admission information.
                  </p>
                </div>

                <button
                  onClick={() => navigate("/")}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-gray-700"
                >
                  Back to Home
                </button>
              </div>

              {/* Batch input */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter / Select Batch Name
                </label>
                <input
                  list="batchNames"
                  value={batchNameInput}
                  onChange={(e) => setBatchNameInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                  placeholder="e.g. 2023"
                />
                <datalist id="batchNames">
                  {availableBatchNames.map((bn) => (
                    <option key={bn} value={bn} />
                  ))}
                </datalist>
              </div>

              {/* Messages */}
              {error && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              {info && (
                <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                  {info}
                </div>
              )}

              {/* Buttons */}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => navigate("/")}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleNextFromSelect}
                  disabled={loading}
                  className="px-5 py-2 text-sm rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {loading ? "Loading..." : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // phase === 'table'
  return (
    <>
      <Header />

      <div className="min-h-[70vh] bg-gray-100 flex items-start justify-center py-8">
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Admission Details
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Batch:{" "}
                <span className="font-semibold">
                  {selectedBatch?.batchName}
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPhase("select");
                  setError("");
                  setInfo("");
                }}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-gray-700"
              >
                Change Batch
              </button>
              <button
                onClick={() => navigate("/")}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-gray-700"
              >
                Back to Home
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={handleLoad}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-50"
            >
              Load
            </button>

            <button
              onClick={handleSave}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300"
            >
              Save
            </button>

            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Add Row
            </button>

            <label className="px-3 py-1.5 text-sm rounded-md bg-yellow-500 text-white hover:bg-yellow-600 cursor-pointer">
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </label>

            <button
              onClick={handleDownloadExcel}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Download Excel
            </button>

            <button
              onClick={handleDownloadPdf}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Download PDF
            </button>
          </div>

          {error && (
            <div className="mb-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              {info}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
            <table className="table-auto border-collapse w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="border px-2 w-16 text-center">S.No</th>
                  <th className="border px-2 min-w-[160px] text-left">Name</th>
                  <th className="border px-2 min-w-[130px] text-left">USN</th>
                  <th className="border px-2 min-w-[120px] text-center">
                    K-CET Rank
                  </th>
                  <th className="border px-2 min-w-[120px] text-center">
                    COMED-K Rank
                  </th>
                  <th className="border px-2 min-w-[150px] text-center">
                    Type of Admission
                  </th>
                  <th className="border px-2 min-w-[140px] text-center">
                    Actual Category
                  </th>
                  <th className="border px-2 min-w-[140px] text-center">
                    Admitted Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="border px-2 text-center">
                      <input
                        type="number"
                        value={r.sno ?? ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "sno",
                            e.target.value ? Number(e.target.value) : ""
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      />
                    </td>

                    <td className="border px-2">
                      <input
                        type="text"
                        value={r.name || ""}
                        onChange={(e) =>
                          handleChangeRow(idx, "name", e.target.value)
                        }
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>

                    <td className="border px-2">
                      <input
                        type="text"
                        value={r.usn || ""}
                        onChange={(e) =>
                          handleChangeRow(idx, "usn", e.target.value)
                        }
                        className="w-full border-none outline-none bg-transparent"
                      />
                    </td>

                    <td className="border px-2 text-center">
                      <input
                        type="number"
                        value={r.kCetRank ?? ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "kCetRank",
                            e.target.value ? Number(e.target.value) : ""
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      />
                    </td>

                    <td className="border px-2 text-center">
                      <input
                        type="number"
                        value={r.comedkRank ?? ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "comedkRank",
                            e.target.value ? Number(e.target.value) : ""
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      />
                    </td>

                    <td className="border px-2 text-center">
                      <select
                        value={r.admissionType || ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "admissionType",
                            e.target.value
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      >
                        <option value="">-- Select --</option>
                        <option value="K-CET">K-CET</option>
                        <option value="COMED-K">COMED-K</option>
                        <option value="Management">Management</option>
                      </select>
                    </td>

                    <td className="border px-2 text-center">
                      <input
                        type="text"
                        value={r.actualCategory || ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "actualCategory",
                            e.target.value
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      />
                    </td>

                    <td className="border px-2 text-center">
                      <input
                        type="text"
                        value={r.admittedCategory || ""}
                        onChange={(e) =>
                          handleChangeRow(
                            idx,
                            "admittedCategory",
                            e.target.value
                          )
                        }
                        className="w-full border-none outline-none bg-transparent text-center"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

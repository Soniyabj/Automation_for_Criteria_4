// frontend/src/components/SuccessRateResult.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import API from "../services/api";

export default function SuccessRateResult() {
  const [searchParams] = useSearchParams();
  const lygParam = searchParams.get("lyg") || "";
  const batchName = searchParams.get("batchName") || lygParam;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErrorMsg("");
        const q = `?batchName=${encodeURIComponent(
          batchName
        )}&lyg=${encodeURIComponent(lygParam)}`;
        const resp = await API.get(`/metrics/success-rate${q}`);
        setData(resp.data);
      } catch (err) {
        console.error(err);
        setErrorMsg(
          err.response?.data?.message ||
            err.message ||
            "Failed to load metrics. Check backend."
        );
      } finally {
        setLoading(false);
      }
    }

    if (lygParam && batchName) load();
    else setLoading(false);
  }, [lygParam, batchName]);

  function downloadPDF() {
    const url = `/api/metrics/success-rate/pdf?batchName=${encodeURIComponent(
      batchName
    )}&lyg=${encodeURIComponent(lygParam)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Download failed");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${batchName}_success_rate_${lygParam}.pdf`;
        a.click();
      })
      .catch((e) => alert(e.message));
  }

  function downloadExcel() {
    const url = `/api/metrics/success-rate/excel?batchName=${encodeURIComponent(
      batchName
    )}&lyg=${encodeURIComponent(lygParam)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Download failed");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${batchName}_success_rate_${lygParam}.xlsx`;
        a.click();
      })
      .catch((e) => alert(e.message));
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!data)
    return (
      <div className="p-6 text-red-600">
        {errorMsg || "No data available"}
      </div>
    );

  const { stipulated, withoutBacklogs, aggregates, requested } = data;
  const rowLabels = [requested.lyg, requested.LYGM1, requested.LYGM2];

  const dash = () => <span className="text-gray-400">—</span>;
  const fmtCount = (v) =>
    v === undefined || v === null ? dash() : String(v);
  const fmtSI = (v) =>
    v === undefined || v === null ? dash() : Number(v).toFixed(3);
  const fmtDec = (v) =>
    v === undefined || v === null ? dash() : Number(v).toFixed(3);
  const fmtNum2 = (v) =>
    v === undefined || v === null ? dash() : Number(v).toFixed(2);

  // X: Regular + in(COC) + in(COB) + Lateral = X
  function renderXCell(row) {
    if (!row) return dash();
    const r = row.regularCount ?? 0;
    const coc = row.inCOCCount ?? 0;
    const cob = row.inCOBCount ?? 0;
    const lat = row.lateralCount ?? 0;
    const X = row.X ?? r + coc + cob + lat;

    return (
      <div className="text-center text-sm text-gray-700">
        {r} + {coc} + {cob} + {lat} = <strong>{X}</strong>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Success Rate</h2>
          <p className="text-sm text-gray-600">
            LYG: {requested.lyg} &nbsp;•&nbsp; LYGM1: {requested.LYGM1}{" "}
            &nbsp;•&nbsp; LYGM2: {requested.LYGM2}
          </p>
        </div>

        <div className="space-x-2">
          <button
            onClick={downloadPDF}
            className="px-3 py-2 bg-blue-600 text-white rounded"
          >
            Download PDF
          </button>
          <button
            onClick={downloadExcel}
            className="px-3 py-2 bg-green-600 text-white rounded"
          >
            Download Excel
          </button>
        </div>
      </div>

      {/* WITHOUT BACKLOG table */}
      <div className="bg-white rounded-md shadow-sm p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">
            Success rate WITHOUT backlog
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border px-3 py-2 text-left w-1/3">Item</th>
                {rowLabels.map((lab, i) => (
                  <th
                    key={i}
                    className="border px-3 py-2 text-center"
                  >
                    {lab}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* X row */}
              <tr className="bg-gray-50">
                <td className="border px-3 py-3 align-top">
                  <div className="font-medium">X</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Number of students admitted in the correspondong 
                    First year+admitted in 2nd year via lateral
                    entry and separated division , if applicable :
                    X = Regular + in(COC) + in(COB) + Lateral
                  </div>
                </td>
                {withoutBacklogs.map((r, i) => (
                  <td key={i} className="border px-3 py-3">
                    {renderXCell(r)}
                  </td>
                ))}
              </tr>

              {/* Y row – without backlog */}
              <tr>
                <td className="border px-3 py-3">
                  <div className="font-medium">Y</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Number of students who have graduated without
                    backlogs in the stipulated period (only students
                    who are Pass in Final Result).
                  </div>
                </td>
                {withoutBacklogs.map((r, i) => (
                  <td
                    key={i}
                    className="border px-3 py-3 text-center"
                  >
                    {fmtCount(r.Y_withoutBacklogs)}
                  </td>
                ))}
              </tr>

              {/* SI row */}
              <tr className="bg-gray-50">
                <td className="border px-3 py-3">
                  <div className="font-medium">
                    Success Index (SI = Y / X)
                  </div>
                </td>
                {withoutBacklogs.map((r, i) => (
                  <td
                    key={i}
                    className="border px-3 py-3 text-center"
                  >
                    {fmtSI(r.SI_noBacklog)}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2" colSpan={4}></td>
              </tr>

              {/* Aggregate row */}
              <tr>
                <td className="border px-3 py-4" colSpan={3}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      <div className="text-sm font-semibold">
                        Average SI = {fmtDec(aggregates.avgSI_noBacklog)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Average SI = (SI(LYG) + SI(LYGM1) + SI(LYGM2)) /
                        3
                      </div>
                    </div>

                    <div className="w-64 flex flex-col items-end">
                      <div className="text-sm font-semibold">
                        Assessment ={" "}
                        {fmtNum2(aggregates.assessment_without_backlogs)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 text-right">
                        Assessment = 25 * Average SI (without backlog)
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* STIPULATED PERIOD table */}
      <div className="bg-white rounded-md shadow-sm p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">
            Success rate in stipulated period
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border px-3 py-2 text-left w-1/3">Item</th>
                {rowLabels.map((lab, i) => (
                  <th
                    key={i}
                    className="border px-3 py-2 text-center"
                  >
                    {lab}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* X row */}
              <tr className="bg-gray-50">
                <td className="border px-3 py-3 align-top">
                  <div className="font-medium">X</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Number of students admitted in the correspondong 
                    First year+admitted in 2nd year via lateral
                    entry and separated division , if applicable :
                    X = Regular + in(COC) + in(COB) + Lateral
                  </div>
                </td>
                {stipulated.map((r, i) => (
                  <td key={i} className="border px-3 py-3">
                    {renderXCell(r)}
                  </td>
                ))}
              </tr>

              {/* Y row – stipulated */}
              <tr>
                <td className="border px-3 py-3">
                  <div className="font-medium">Y</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Number of students who graduated in the stipulated
                    period (only Pass in Final Result + only "Yes" in
                    Backlog cleared?).
                  </div>
                </td>
                {stipulated.map((r, i) => (
                  <td
                    key={i}
                    className="border px-3 py-3 text-center"
                  >
                    {fmtCount(r.Y_stipulated)}
                  </td>
                ))}
              </tr>

              {/* SI row */}
              <tr className="bg-gray-50">
                <td className="border px-3 py-3">
                  <div className="font-medium">
                    Success Index (SI = Y / X)
                  </div>
                </td>
                {stipulated.map((r, i) => (
                  <td
                    key={i}
                    className="border px-3 py-3 text-center"
                  >
                    {fmtSI(r.SI)}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2" colSpan={4}></td>
              </tr>

              {/* Aggregate row */}
              <tr>
                <td className="border px-3 py-4" colSpan={3}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      <div className="text-sm font-semibold">
                        Average SI = {fmtDec(aggregates.avgSI_stipulated)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Average SI = (SI(LYG) + SI(LYGM1) + SI(LYGM2)) /
                        3
                      </div>
                    </div>

                    <div className="w-64 flex flex-col items-end">
                      <div className="text-sm font-semibold">
                        Assessment ={" "}
                        {fmtNum2(aggregates.assessment_stipulated)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 text-right">
                        Assessment = 15 * Average SI (stipulated period)
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Link to="/success-rate" className="text-indigo-600">
          ← Back
        </Link>
      </div>
    </div>
  );
}

// frontend/src/components/SuccessRateForm.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SuccessRateForm() {
  const [lyg, setLyg] = useState("");
  const navigate = useNavigate();

  function handleNext(e) {
    e.preventDefault();
    const year = String(lyg).trim();
    if (!year) return alert("Please enter LYG (batch year), e.g. 2022");
    // use the entered LYG also as the batchName automatically
    navigate(`/success-rate/result?lyg=${encodeURIComponent(year)}&batchName=${encodeURIComponent(year)}`);
  }

  function handleBackToHome(e) {
    e.preventDefault();
    navigate("/"); // go to dashboard/home
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow mt-6">
      <h2 className="text-xl font-semibold mb-4">Success Rate (NAAC)</h2>

      <form onSubmit={handleNext} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Enter Latest Year of Graduation (LYG)</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={lyg}
            onChange={(e) => setLyg(e.target.value.replace(/\D/g, ""))} // only allow digits
            className="mt-1 w-full border px-3 py-2 rounded"
            placeholder="e.g. 2022"
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter batch year (LYG). LYGM1 and LYGM2 will be computed automatically.
          </p>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={handleBackToHome}
            type="button"
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          >
            ← Back to Home
          </button>

          <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">
            Next
          </button>
        </div>
      </form>
    </div>
  );
}

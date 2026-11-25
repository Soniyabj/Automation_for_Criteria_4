// frontend/src/components/Home.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import mitLogo from "../assets/mit.png";

export default function Home() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    navigate("/login");
  };

  return (
    <>
      <Header />

      {/* Main area */}
      <div className="min-h-[66vh] bg-gray-100 flex items-start justify-center py-6 -mt-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
          {/* Logo + Title */}
          <div className="flex flex-col items-center -mt-4">
            <img src={mitLogo} alt="MIT Mysore Logo" className="h-24 mb-2" />
            <h1 className="text-2xl font-bold text-gray-800">
              Automation for Criteria 4
            </h1>
          </div>

          {/* Buttons */}
          <div className="mt-5 w-full space-y-3">
            <button
              onClick={() => navigate("/create-batch")}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Create Batch
            </button>

            <button
              onClick={() => navigate("/update-batch")}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Update Batch
            </button>

            <button
              onClick={() => navigate("/result")}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition"
            >
              View Results
            </button>

            <button
              onClick={() => navigate("/success-rate")}
              className="w-full bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 transition"
            >
              Success Rate
            </button>

            {/* 🔵 Admission Details – full-width blue bar like others */}
            <button
              onClick={() => navigate("/admission-details")}
              className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition"
            >
              Admission Details
            </button>

            <button
              onClick={handleLogout}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

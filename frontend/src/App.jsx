// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login";
import Register from "./components/Register";
import Home from "./components/Home";
import CreateBatch from "./components/CreateBatch";
import UpdateBatch from "./components/UpdateBatch";
import ResultView from "./components/ResultView";
import ProtectedRoute from "./components/ProtectedRoute";

import SuccessRateForm from "./components/SuccessRateForm";
import SuccessRateResult from "./components/SuccessRateResult";

// NEW
import AdmissionDetails from "./components/AdmissionDetails";

export default function App() {
  const token = localStorage.getItem("token");

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={token ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={token ? <Navigate to="/" replace /> : <Register />}
        />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Home />} />
          <Route path="/create-batch" element={<CreateBatch />} />
          <Route path="/update-batch" element={<UpdateBatch />} />
          <Route path="/result" element={<ResultView />} />

          {/* Success Rate */}
          <Route path="/success-rate" element={<SuccessRateForm />} />
          <Route path="/success-rate/result" element={<SuccessRateResult />} />

          {/* 🔥 NEW: Admission Details */}
          <Route path="/admission-details" element={<AdmissionDetails />} />
        </Route>

        {/* Fallback */}
        <Route
          path="*"
          element={
            token ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

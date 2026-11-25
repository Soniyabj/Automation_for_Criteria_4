// src/components/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API, { setAuthToken } from "../services/api";
import mitLogo from "../assets/mit.png";
import Header from "./Header";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await API.post("/auth/login", form);
      if (res.data && res.data.token) {
        localStorage.setItem("token", res.data.token);
        localStorage.setItem("email", form.email);
        setAuthToken(res.data.token);
        navigate("/");
      } else {
        setError("Login failed.");
      }
    } catch (err) {
      setError("Login failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header />

      {/* Main background area under header */}
      <div className="bg-slate-50 min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-md">
          {/* subtle glow behind card */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-indigo-400/40 via-sky-400/40 to-emerald-400/40 blur opacity-70" />

          {/* card */}
          <div className="relative bg-white rounded-3xl shadow-xl border border-slate-100 px-8 py-8 md:px-10 md:py-10">
            {/* top logo + title */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center shadow-sm mb-3">
                <img src={mitLogo} alt="MIT Logo" className="h-12 w-12" />
              </div>
              <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
                Automation For Criteria 4
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-medium tracking-wide">
                Admin Login
              </p>
            </div>

            {/* error message */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-600 uppercase tracking-wide"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="admin@example.com"
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-600 uppercase tracking-wide"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-400"
              >
                {submitting ? "Signing in..." : "Login"}
              </button>
            </form>

            <p className="mt-4 text-[11px] text-center text-slate-400">
              Use your department admin credentials. Contact the system
              administrator if you face any issues.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

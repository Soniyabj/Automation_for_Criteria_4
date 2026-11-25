// src/components/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/api";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("mit@admin.com"); 
  const [password, setPassword] = useState("admin@123");   
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) setLoggedIn(true);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await auth.login({ email, password });
      if (res.data?.token) {
        onLogin(res.data.token); // save in App.jsx
        navigate("/dashboard");
      } else {
        setError("No token returned");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setLoggedIn(false);
    navigate("/");
  }

  if (loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-6 rounded shadow text-center">
          <img src="/src/assets/mit.png" alt="MIT Mysore" className="h-16 mx-auto" />
          <h1 className="text-xl font-bold mt-2">MIT Mysore</h1>
          <p className="text-gray-600 mb-4">Already logged in</p>
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 text-white py-2 rounded"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-6 rounded shadow">
        <div className="text-center mb-6">
          <img src="/src/assets/mit.png" alt="MIT Mysore" className="h-16 mx-auto" />
          <h1 className="text-xl font-bold mt-2">MIT Mysore</h1>
          <p className="text-gray-600">Automation For Criteria 4 - Admin</p>
        </div>

        {error && <div className="text-red-600 mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              className="w-full border p-2 rounded"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              className="w-full border p-2 rounded"
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

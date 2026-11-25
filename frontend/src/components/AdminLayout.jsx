// frontend/src/components/AdminLayout.jsx
import React from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import useAuth from "../services/useAuth";
import mitLogo from "../assets/mit.png";

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white shadow-sm p-4 flex flex-col">
        <div className="flex items-center space-x-3 mb-6">
          <img src={mitLogo} alt="MIT Mysore" className="h-10 w-10" />
          <h1 className="text-base font-semibold">MIT Mysore</h1>
        </div>

        <nav className="flex-1 space-y-2 text-sm">
          <Link className="block px-3 py-2 rounded hover:bg-blue-50" to="/">
            Dashboard
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-blue-50" to="/create-batch">
            Create Batch
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-blue-50" to="/update-batch">
            Update Batch
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-blue-50" to="/result">
            Result
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-blue-50" to="/success-rate">
            Success Rate
          </Link>
        </nav>

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="bg-red-500 text-white px-3 py-2 rounded mt-4 hover:bg-red-600"
        >
          Logout
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4">
        {/* Constrain width and center */}
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

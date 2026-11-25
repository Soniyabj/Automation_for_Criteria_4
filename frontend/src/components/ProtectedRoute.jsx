// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

/**
 * ProtectedRoute
 * - Checks for a token (stored in localStorage as "token").
 * - If token exists, renders the nested route(s) (via <Outlet />).
 * - If not, redirects to /login.
 *
 * You can extend this to check token validity (call backend /auth/verify)
 * or check roles stored inside the token.
 */
export default function ProtectedRoute({ redirectTo = '/login' }) {
  const token = localStorage.getItem('token');

  // simple presence check. For stronger protection, verify token with backend.
  if (!token) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}

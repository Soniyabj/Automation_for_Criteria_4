import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Simple auth hook:
 * - reads token from localStorage
 * - exposes token, setToken, logout
 * - when logout is called it clears token and navigates to /login
 */
export default function useAuth() {
  const [token, setTokenState] = useState(() => {
    try { return localStorage.getItem("token"); } catch(e){ return null; }
  });
  const navigate = useNavigate();

  // keep local hook state in sync if some other code changes localStorage
  useEffect(() => {
    function onStorage() {
      setTokenState(localStorage.getItem("token"));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setToken = useCallback((newToken) => {
    try {
      if (newToken) localStorage.setItem("token", newToken);
      else localStorage.removeItem("token");
    } catch (e) { /* ignore */ }
    setTokenState(newToken || null);
  }, []);

  const logout = useCallback((goTo = "/login") => {
    try { localStorage.removeItem("token"); } catch(e){}
    setTokenState(null);
    // optional: also clear auth header if you have setAuthToken utility
    // import and call setAuthToken(null) inside AdminLayout if needed.
    navigate(goTo);
  }, [navigate]);

  return { token, setToken, logout };
}

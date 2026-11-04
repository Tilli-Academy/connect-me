// Holds auth state (token + current user) and exposes login/register/logout.
// The token is persisted in localStorage via the api client; on load we restore
// the session by fetching the current user if a token exists.
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { getToken, setToken } from '../api/client.js';
import * as authApi from '../api/auth.api.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on first load.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    authApi
      .getMe()
      .then((data) => setUser(data.user))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const { token, user: loggedIn } = await authApi.login(credentials);
    setToken(token);
    setUser(loggedIn);
    return loggedIn;
  };

  const register = async (details) => {
    const { token, user: created } = await authApi.register(details);
    setToken(token);
    setUser(created);
    return created;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  // Sync context after a profile update elsewhere (e.g. the Profile page).
  const updateUser = useCallback((updated) => setUser(updated), []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, register, logout, updateUser }),
    [user, loading, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

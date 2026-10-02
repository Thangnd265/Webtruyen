import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_color: string;
}

export interface UserPreferences {
  themeId?: string;
  mode?: "light" | "dark";
  accentColor?: string;
  fontScale?: string;
  contentWidth?: string;
  readerLineHeight?: string;
  playbackSpeed?: string;
  autoNext?: boolean;
  voice?: string;
  [key: string]: any;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  preferences: UserPreferences;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "webtruyen_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [loading, setLoading] = useState(true);

  // Validate token and fetch user details & preferences on mount or token change
  useEffect(() => {
    const activeToken = token;
    if (!activeToken) {
      setUser(null);
      setPreferences({});
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${activeToken}` },
        });

        if (res.ok) {
          const userData = await res.json();
          if (isMounted) setUser(userData);

          // Fetch preferences
          try {
            const prefRes = await fetch("/api/auth/preferences", {
              headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (prefRes.ok) {
              const prefData = await prefRes.json();
              if (isMounted) setPreferences(prefData || {});
            }
          } catch {
            // Preferences fallback to empty
          }
        } else {
          // Token expired or invalid
          localStorage.removeItem(TOKEN_KEY);
          if (isMounted) {
            setToken(null);
            setUser(null);
            setPreferences({});
          }
        }
      } catch (err) {
        console.warn("Could not verify session:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUser();
    return () => {
      isMounted = false;
    };
  }, [token]);

  async function login(username: string, password: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.detail || "Đăng nhập thất bại" };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);

      // Fetch preferences
      try {
        const prefRes = await fetch("/api/auth/preferences", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          setPreferences(prefData || {});
        }
      } catch {
        // Ignored
      }

      return { success: true };
    } catch {
      return { success: false, error: "Không thể kết nối đến máy chủ" };
    }
  }

  async function register(username: string, password: string, displayName: string) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          display_name: displayName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.detail || "Đăng ký thất bại" };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      setPreferences({});
      return { success: true };
    } catch {
      return { success: false, error: "Không thể kết nối đến máy chủ" };
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setPreferences({});
  }

  async function updatePreferences(partial: Partial<UserPreferences>) {
    const updated = { ...preferences, ...partial };
    setPreferences(updated);

    if (token) {
      try {
        await fetch("/api/auth/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ preferences: updated }),
        });
      } catch (err) {
        console.warn("Could not save preferences to server:", err);
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        preferences,
        login,
        register,
        logout,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthValue: AuthContextType = {
  user: null,
  token: null,
  loading: false,
  preferences: {},
  login: async () => {},
  register: async () => {},
  logout: () => {},
  updatePreferences: () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? defaultAuthValue;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  setApiToken,
  setUnauthorizedHandler,
  type Book,
  type User,
} from "@/src/api";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "menabng_token";

type AuthCtxType = {
  user: User | null;
  book: Book | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (u: User | null) => void;
  refreshBook: () => Promise<void>;
};

const AuthCtx = createContext<AuthCtxType>({
  user: null,
  book: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  setUser: () => {},
  refreshBook: async () => {},
});

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const hardReset = useCallback(() => {
    setApiToken(null);
    setToken(null);
    setUser(null);
    setBook(null);
  }, []);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet(TOKEN_KEY, "");
      if (t) {
        setApiToken(t);
        try {
          const me = await api<{ user: User; book: Book }>("/auth/me");
          setUser(me.user);
          setBook(me.book);
          setToken(t);
        } catch {
          hardReset();
          storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, [hardReset]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      hardReset();
      storage.secureRemove(TOKEN_KEY);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [hardReset, queryClient]);

  const applyAuth = useCallback(
    (data: { token: string; user: User; book: Book }) => {
      setApiToken(data.token);
      setToken(data.token);
      setUser(data.user);
      setBook(data.book);
      storage.secureSet(TOKEN_KEY, data.token);
    },
    [],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const d = await api<{ token: string; user: User; book: Book }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      applyAuth(d);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (username: string, displayName: string, password: string) => {
      const d = await api<{ token: string; user: User; book: Book }>("/auth/register", {
        method: "POST",
        body: { username, display_name: displayName, password },
      });
      applyAuth(d);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    hardReset();
    storage.secureRemove(TOKEN_KEY);
    queryClient.clear();
  }, [hardReset, queryClient]);

  const refreshBook = useCallback(async () => {
    const me = await api<{ user: User; book: Book }>("/auth/me");
    setBook(me.book);
    setUser(me.user);
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, book, token, loading, login, register, logout, setUser, refreshBook }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

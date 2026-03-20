import { createContext, type ReactNode, useContext, useEffect, useReducer } from "react";
import { authMe, type CharacterInfo } from "../api/client";

// ── Types ───────────────────────────────────────────────

interface AuthState {
  token: string | null;
  username: string | null;
  characters: CharacterInfo[];
  loading: boolean;
}

type AuthAction =
  | { type: "LOGIN"; token: string; username: string }
  | { type: "SET_CHARACTERS"; characters: CharacterInfo[] }
  | { type: "ADD_CHARACTER"; character: CharacterInfo }
  | { type: "LOGOUT" }
  | { type: "LOADED" };

interface AuthContextValue extends AuthState {
  login: (token: string, username: string) => void;
  logout: () => void;
  setCharacters: (characters: CharacterInfo[]) => void;
  addCharacter: (character: CharacterInfo) => void;
}

// ── Reducer ─────────────────────────────────────────────

const TOKEN_KEY = "jindan_auth_token";

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN":
      localStorage.setItem(TOKEN_KEY, action.token);
      return { ...state, token: action.token, username: action.username, loading: false };
    case "SET_CHARACTERS":
      return { ...state, characters: action.characters };
    case "ADD_CHARACTER":
      return { ...state, characters: [...state.characters, action.character] };
    case "LOGOUT":
      localStorage.removeItem(TOKEN_KEY);
      return { token: null, username: null, characters: [], loading: false };
    case "LOADED":
      return { ...state, loading: false };
  }
}

// ── Context ─────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    token: localStorage.getItem(TOKEN_KEY),
    username: null,
    characters: [],
    loading: true,
  });

  // Auto-restore session on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only on mount
  useEffect(() => {
    if (!state.token) {
      dispatch({ type: "LOADED" });
      return;
    }
    authMe(state.token)
      .then((data) => {
        dispatch({ type: "LOGIN", token: state.token!, username: data.username });
        dispatch({ type: "SET_CHARACTERS", characters: data.characters });
      })
      .catch(() => {
        dispatch({ type: "LOGOUT" });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AuthContextValue = {
    ...state,
    login: (token, username) => dispatch({ type: "LOGIN", token, username }),
    logout: () => dispatch({ type: "LOGOUT" }),
    setCharacters: (characters) => dispatch({ type: "SET_CHARACTERS", characters }),
    addCharacter: (character) => dispatch({ type: "ADD_CHARACTER", character }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

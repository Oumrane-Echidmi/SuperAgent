import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createApi } from "../lib/api";

const Context = createContext(null);
export function WorkspaceProvider({ children }) {
  const [session, setSession] = useState(null),
    [notice, setNotice] = useState(""),
    [writes, setWrites] = useState(0);
  const token = session?.token;
  const currentToken = useRef(token);
  currentToken.current = token;
  const api = useMemo(() => {
    const request = createApi(token, () => {
      if (currentToken.current === token) {
        setSession(null);
        setNotice("Your session expired. Please sign in again.");
      }
    });
    return async (path, options) => {
      const write = options?.method && options.method !== "GET";
      if (write) setWrites((value) => value + 1);
      try {
        return await request(path, options);
      } finally {
        if (write) setWrites((value) => value - 1);
      }
    };
  }, [token]);
  async function authenticate(mode, input) {
    const result = await createApi(null)(
      mode === "register" ? "/auth/registrations" : "/auth/sessions",
      { method: "POST", body: input },
    );
    const identity = await createApi(result.token)("/me");
    setSession({
      token: result.token,
      user: identity.user,
      tenants: identity.tenants,
      tenantId: identity.tenants[0]?.id ?? null,
    });
    setNotice("");
  }
  async function signOut() {
    if (writes)
      throw new Error("Please wait for the current action to finish.");
    try {
      await api("/auth/session", { method: "DELETE" });
      setSession(null);
    } catch (error) {
      setNotice(error.message);
      throw error;
    }
  }
  const tenant = session?.tenants.find((item) => item.id === session.tenantId);
  return (
    <Context.Provider
      value={{
        session,
        api,
        tenant,
        notice,
        writes,
        authenticate,
        signOut,
        selectTenant: (id) => {
          if (!writes)
            setSession((current) =>
              current && current.tenants.some((item) => item.id === id)
                ? { ...current, tenantId: id }
                : current,
            );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
export function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
export function useResource(path) {
  const { api } = useWorkspace(),
    [version, setVersion] = useState(0),
    [state, setState] = useState({
      path: null,
      data: null,
      error: null,
      loading: true,
    });
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    let active = true;
    setState((current) => ({
      path,
      data: current.path === path ? current.data : null,
      error: null,
      loading: true,
    }));
    api(path, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ path, data, error: null, loading: false });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError")
          setState({ path, data: null, error, loading: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, path, version]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return {
    ...(state.path === path
      ? state
      : { data: null, error: null, loading: Boolean(path) }),
    reload,
  };
}

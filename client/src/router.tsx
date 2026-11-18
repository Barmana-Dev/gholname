import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

type RouteContextValue = {
  pathname: string;
  params: Record<string, string>;
  navigate: (to: string, replace?: boolean) => void;
};
const RouteContext = createContext<RouteContextValue | null>(null);

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [params, setParams] = useState<Record<string, string>>({});
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = (to: string, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setPathname(window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const value = useMemo(
    () => ({ pathname, params, navigate }),
    [pathname, params],
  );
  return (
    <RouteContext.Provider value={value}>
      <ParamsSetter setParams={setParams}>{children}</ParamsSetter>
    </RouteContext.Provider>
  );
}

function ParamsSetter({
  children,
}: {
  children: ReactNode;
  setParams: (p: Record<string, string>) => void;
}) {
  return <>{children}</>;
}

export function Link({
  to,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      navigate(to);
    }
  }
  return <a href={to} onClick={handle} {...props} />;
}

export function NavLink({
  to,
  end = false,
  className,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
}) {
  const { pathname } = useRouter();
  const active = end
    ? pathname === to
    : pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      className={
        typeof className === "function"
          ? className({ isActive: active })
          : className
      }
      {...props}
    />
  );
}

export function Navigate({
  to,
  replace = false,
}: {
  to: string;
  replace?: boolean;
}) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, replace), [navigate, replace, to]);
  return null;
}
export function Route(props: { path: string; element: ReactElement }) {
  void props;
  return null;
}

/**
 * decodeURIComponent throws URIError on a malformed escape such as "%E0%A4%A".
 * A bad link must never break rendering: fall back to the raw segment so the
 * page can show its normal "not found" state.
 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function match(pattern: string, pathname: string) {
  if (pattern === "*") return { matches: true, params: {} };
  const keys: string[] = [];
  const regex = new RegExp(
    `^${pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:([A-Za-z0-9_]+)/g, (_all, key) => {
        keys.push(key);
        return "([^/]+)";
      })}/?$`,
  );
  const result = pathname.match(regex);
  if (!result) return { matches: false, params: {} };
  return {
    matches: true,
    params: Object.fromEntries(
      keys.map((key, index) => [key, safeDecode(result[index + 1] ?? "")]),
    ),
  };
}

export function Routes({ children }: { children: ReactNode }) {
  const context = useRouter();
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ path: string; element: ReactElement }>(child))
      continue;
    const result = match(child.props.path, context.pathname);
    if (result.matches)
      return (
        <RouteContext.Provider value={{ ...context, params: result.params }}>
          {child.props.element}
        </RouteContext.Provider>
      );
  }
  return null;
}

export function useLocation() {
  const { pathname } = useRouter();
  return { pathname };
}
export function useNavigate() {
  const { navigate } = useRouter();
  return (to: string, options?: { replace?: boolean }) =>
    navigate(to, options?.replace);
}
export function useParams<T extends Record<string, string>>() {
  return useRouter().params as Partial<T>;
}
function useRouter() {
  const value = useContext(RouteContext);
  if (!value) throw new Error("Router is not mounted");
  return value;
}

import {
  clearClientSessionData,
  clearDraft,
  loadDraft,
  saveDraft as persistDraft,
} from "./drafts";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "./router";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderClock,
  Gauge,
  Headphones,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageSquareWarning,
  Phone,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  ApiError,
  downloadFile,
  formatDate,
  formatMoney,
  request,
} from "./api";
import type { ApplicationItem, DashboardData, Service, User } from "./types";
import { extraStaticPages } from "./PublicEnhancements";
import { GholnameHome } from "./GholnameHome";
import { StaffWorkspace } from "./StaffWorkspace";
import { UserSupport } from "./UserSupport";
import { ServiceSpecificFields } from "./ServiceSpecificFields";
import { StructuredApplicationFields } from "./StructuredApplicationFields";
import { LocationFields } from "./LocationFields";
import { AdminManagement } from "./AdminManagement";
import { InternalControls } from "./InternalControls";
import { can } from "./access";
import { PublicOrganizationProfile } from "./OrganizationProfile";
import { publicNavigation } from "./public-navigation";

export const statusLabels: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  initial_review: "در انتظار بررسی اولیه",
  documents_deficient: "نقص مدارک",
  awaiting_applicant: "در انتظار تکمیل متقاضی",
  completed_documents: "مدارک تکمیل",
  awaiting_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  assigned_registry_expert: "ارجاع به کارشناس ثبتی",
  assigned_surveyor: "ارجاع به نقشه‌بردار",
  under_expert_review: "در حال بررسی کارشناسی",
  additional_action: "نیازمند اقدام تکمیلی",
  ready_to_send: "آماده ارسال و تبادل اطلاعات",
  registry_exchange: "تبادل با سازمان",
  awaiting_registry: "در انتظار پاسخ سازمان",
  registry_return_deficient: "بازگشت از سازمان با نقص",
  correcting_registry_deficiency: "در حال اصلاح نقص سازمان",
  completed: "خاتمه‌یافته",
  closed_incomplete: "مختومه به علت عدم تکمیل",
  out_of_scope: "خارج از صلاحیت",
  stopped_legal_technical: "متوقف به علت ایراد حقوقی یا فنی",
  stopped_security: "متوقف به علت ایراد امنیتی",
  cancelled_by_applicant: "لغوشده توسط متقاضی",
  referred_complaint: "ارجاع به شکایت",
};
const messageTypeLabels: Record<string, string> = {
  system: "پیام سیستمی",
  support: "پیام پشتیبانی",
  deficiency: "اعلام نقص",
  deadline: "هشدار زمان‌بندی",
  document_receipt: "تأییدیه دریافت مدرک",
  payment: "اطلاعیه پرداخت",
  general: "پیام پرونده",
};
function messageTypesForRole(role: string): string[] {
  const byRole: Record<string, string[]> = {
    applicant: ["general", "support"],
    representative: ["general", "support"],
    registry_expert: ["general", "deficiency", "deadline"],
    surveyor: ["general", "deficiency", "deadline"],
    support: ["support", "general", "deficiency", "deadline"],
    finance: ["payment", "general"],
    operations_manager: Object.keys(messageTypeLabels),
    compliance: ["system", "general", "deficiency", "deadline"],
    admin: Object.keys(messageTypeLabels),
  };
  return byRole[role] ?? [];
}
const roleLabels: Record<string, string> = {
  applicant: "متقاضی",
  representative: "نماینده یا وکیل",
  registry_expert: "کارشناس ثبتی",
  surveyor: "کارشناس نقشه‌برداری",
  support: "پشتیبانی",
  finance: "مسئول مالی",
  operations_manager: "مدیر عملیات",
  compliance: "مسئول تطبیق",
  technical: "مسئول فنی",
  admin: "مدیر سامانه",
  observer: "ناظر سازمان ثبت",
};

function parseArrayField(value: unknown): any[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function Logo({
  onClick,
  light,
  className = "",
}: {
  onClick?: () => void;
  light?: boolean;
  className?: string;
}) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className={`inline-flex flex-row flex-nowrap items-center gap-2 whitespace-nowrap ${className}`.trim()}
      aria-label="قولنامه — صفحه اصلی"
      style={{
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
      }}
    >
      <img
        src="/logo.png"
        alt=""
        width={48}
        height={48}
        className={`h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12 ${
          light ? "rounded-full bg-white p-0.5" : ""
        }`}
      />

      <span
        className={`shrink-0 font-['Aref_Ruqaa',serif] text-3xl font-extrabold ${
          light ? "text-white" : "text-navy"
        }`}
        style={{
          fontFamily: "'Aref Ruqaa', serif",
          fontSize: "1.875rem",
          fontWeight: 700,
          color: light ? "#ffffff" : undefined,
        }}
      >
        قولنامه
      </span>
    </Link>
  );
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
}
interface MeResponse {
  mustChangePassword?: boolean;
  id: number;
  fullName: string;
  role: string;
  capabilities: string[];
}
const AuthContext = createContext<AuthContextValue | null>(null);
function AuthProvider({ children }: { children: ReactNode }) {
  // The session cookie is HttpOnly, so the browser cannot tell whether it is
  // signed in; ask the server once on load. Nothing identifying is cached in
  // localStorage.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    clearClientSessionData(); // drop tokens left by older versions
    request<MeResponse>("/auth/me")
      .then((me) =>
        setUser({
          id: me.id,
          name: me.fullName,
          role: me.role,
          capabilities: me.capabilities,
          mustChangePassword: me.mustChangePassword,
        }),
      )
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      login: (next: User) => {
        setUser(next);
      },
      logout: () => {
        request("/auth/logout", { method: "POST", body: "{}" }).catch(
          () => undefined,
        );
        clearClientSessionData();
        setUser(null);
      },
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext)!;

function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <>
      <div className="legal-strip">
        <span>
          <ShieldCheck size={16} /> نسخهٔ نمایشی؛ سامانهٔ رسمی دولتی نیست و
          هنوز به سامانه‌های سازمان ثبت متصل نشده است
        </span>
        <span>پرداخت آنلاین در این نسخه غیرفعال است</span>
      </div>
      <header className="site-header">
        <div className="container header-inner">
          <Logo />
          <nav
            id="public-main-navigation"
            className={open ? "main-nav open" : "main-nav"}
            aria-label="ناوبری اصلی"
          >
            {publicNavigation.map((item) =>
              item.children ? (
                <details className="nav-group" key={item.to}>
                  <summary>
                    <span>{item.label}</span>
                    <ChevronLeft aria-hidden="true" />
                  </summary>
                  <div className="nav-submenu">
                    <Link className="nav-category-link" to={item.to}>
                      مشاهده همه {item.label}
                    </Link>
                    {item.children.map((child) => (
                      <Link key={`${child.to}-${child.label}`} to={child.to}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </details>
              ) : (
                <NavLink
                  end={item.to === "/"}
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link className="button subtle" to="/panel">
                  <LayoutDashboard size={18} /> پنل من
                </Link>
                <button className="icon-button" title="خروج" onClick={logout}>
                  <LogOut size={19} />
                </button>
              </>
            ) : (
              <Link className="button primary small" to="/login">
                <LogIn size={18} /> ورود به سامانه
              </Link>
            )}
            <button
              className="menu-button"
              aria-label={open ? "بستن منو" : "باز کردن منو"}
              aria-expanded={open}
              aria-controls="public-main-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer>
      <div className="container footer-grid">
        <div>
          <Logo light className="footer-brand" />
          <p>
            پذیرش، تکمیل مدارک و پیگیری خدمات ثبتی در حدود دسترسی‌ها و مقررات
            ابلاغی.
          </p>
        </div>
        <div>
          <h4>دسترسی سریع</h4>
          <Link to="/privacy">حریم خصوصی</Link>
          <Link to="/terms">شرایط استفاده</Link>
          <Link to="/applicant-rights">منشور حقوق متقاضیان</Link>
          <Link to="/security">امنیت و ضدکلاهبرداری</Link>
          <Link to="/complaints">شکایات و گزارش تخلف</Link>
        </div>
        <div>
          <h4>تماس و پاسخ‌گویی</h4>
          <span>
            <Phone size={16} />{" "}
            {SUPPORT_PHONE ? (
              <bdi dir="ltr">{SUPPORT_PHONE}</bdi>
            ) : (
              "از طریق تیکت پشتیبانی"
            )}
          </span>
          <span>
            <Headphones size={16} /> شنبه تا چهارشنبه، ۸ تا ۱۶
          </span>
        </div>
      </div>
      <div className="footer-bottom">
        کارگزاری مرجع صدور رأی، تشخیص نهایی مالکیت یا تضمین نتیجه پرونده نیست.
      </div>
    </footer>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span className="spinner" />
      در حال دریافت اطلاعات...
    </div>
  );
}
export function Notice({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`notice ${type}`}>
      <AlertCircle size={20} />
      <div>{children}</div>
    </div>
  );
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <FolderClock />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function HomePage() {
  return (
    <PublicLayout>
      <GholnameHome />
    </PublicLayout>
  );
}

function ServicesPage({ category }: { category?: "legal" | "technical" }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    request<Service[]>("/public/services")
      .then(setServices)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "دریافت فهرست خدمات ناموفق بود.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const visibleServices = category
    ? services.filter((service) => service.category === category)
    : services;
  const title =
    category === "legal"
      ? "خدمات ثبتی و حقوقی املاک"
      : category === "technical"
        ? "خدمات فنی، مهندسی و حدنگاری"
        : "خدمات ثبتی و مهندسی";
  return (
    <PublicLayout>
      <PageHero
        title={title}
        body="پذیرش و پیگیری هر خدمت صرفاً در حدود مقررات، سند الزامات و دسترسی‌های رسمی انجام می‌شود."
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <section className="container narrow">
          <Notice type="warning">{error}</Notice>
        </section>
      ) : (
        <section className="container service-list">
          {visibleServices.map((s) => (
            <article key={s.id}>
              <div>
                <span className={`pill ${s.category}`}>
                  {s.category === "legal" ? "ثبتی و حقوقی" : "فنی و مهندسی"}
                </span>
                <h2>{s.title}</h2>
                <p>{s.description}</p>
                <h4>مدارک پایه موردنیاز</h4>
                <ul>
                  {s.requirements.map((r) => (
                    <li key={r}>
                      <CheckCircle2 />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <Link className="button secondary" to="/panel/new">
                ثبت درخواست <ArrowLeft />
              </Link>
            </article>
          ))}
        </section>
      )}
    </PublicLayout>
  );
}
function ServiceDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<Service>(`/public/services/${encodeURIComponent(code ?? "")}`)
      .then(setService)
      .catch((reason) => setError(reason.message));
  }, [code]);
  if (error)
    return (
      <PublicLayout>
        <PageHero title="خدمت پیدا نشد" body={error} />
      </PublicLayout>
    );
  if (!service)
    return (
      <PublicLayout>
        <Loading />
      </PublicLayout>
    );
  return (
    <PublicLayout>
      <PageHero title={service.title} body={service.description} />
      <section className="container service-detail-grid">
        <article className="service-detail-main">
          <span className={`pill ${service.category}`}>
            {service.category === "legal" ? "ثبتی و حقوقی" : "فنی و مهندسی"}
          </span>
          <h2>چه کسانی می‌توانند درخواست ثبت کنند؟</h2>
          <p>
            مالک، وکیل، نماینده قانونی، مدیر شخص حقوقی، وارث، متصرف قانونی یا
            ذی‌نفع با ارائه مدرک سمت.
          </p>
          <h2>مدارک اولیه موردنیاز</h2>
          <ul className="check-list">
            {service.requirements.map((item) => (
              <li key={item}>
                <CheckCircle2 />
                {item}
              </li>
            ))}
          </ul>
          <h2>مراحل انجام خدمت</h2>
          <ol className="workflow-list">
            {(service.workflow ?? []).map((item) => (
              <li key={item}>{statusLabels[item] ?? item}</li>
            ))}
          </ol>
          <h2>زمان بررسی اولیه</h2>
          <p>
            حداکثر دو روز کاری پس از دریافت مدارک کامل؛ زمان تصمیم نهایی در
            اختیار مرجع ثبتی است.
          </p>
          <h2>هشدارهای حقوقی و موارد خارج از صلاحیت</h2>
          <p>
            کارگزاری مرجع تشخیص مالکیت، صدور رأی، تضمین نتیجه یا تسریع خارج از
            ضابطه نیست و پرونده دارای تعارض جدی را متوقف و گزارش می‌کند.
          </p>
          <h2>پرسش‌های متداول</h2>
          <details>
            <summary>اگر مدرک ناقص باشد چه می‌شود؟</summary>
            <p>
              نقص دقیق در پنل اعلام می‌شود و نسخه اصلاحی مدرک قابل بارگذاری است.
            </p>
          </details>
          <details>
            <summary>چطور وضعیت را ببینم؟</summary>
            <p>
              با شماره پرونده از رهگیری عمومی یا پس از ورود از پنل استفاده کنید.
            </p>
          </details>
        </article>
        <aside className="service-detail-aside">
          <h3>تعرفه خدمت</h3>
          <strong>
            {service.feeRials
              ? `${service.feeRials.toLocaleString("fa-IR")} ریال`
              : "در انتظار تعرفه مصوب"}
          </strong>
          <small>
            نسخه الزامات: {service.requirementsVersion ?? "پیش‌نویس"}
          </small>
          <Link className="button primary full" to="/panel/new">
            ثبت درخواست
          </Link>
          <Link className="button subtle full" to="/documents-guide">
            راهنمای مدارک
          </Link>
          <Link className="button subtle full" to="/support">
            ارتباط با پشتیبانی
          </Link>
        </aside>
      </section>
    </PublicLayout>
  );
}
function PageHero({ title, body }: { title: string; body: string }) {
  return (
    <section className="page-hero">
      <div className="container">
        <span className="eyebrow">قولنامه</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </section>
  );
}

function TrackingPage() {
  const [number, setNumber] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await request(
          `/public/tracking/${encodeURIComponent(number.trim())}?token=${encodeURIComponent(token.trim())}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "پرونده پیدا نشد.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <PageHero
        title="پیگیری پرونده"
        body="شماره پرونده داخلی کارگزاری را وارد کنید تا آخرین وضعیت بدون نمایش اطلاعات حساس مشاهده شود."
      />
      <section className="container narrow">
        <form className="tracking-card" onSubmit={submit}>
          <label>شماره پرونده</label>
          <div className="inline-input">
            <input
              dir="ltr"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="RB-20260801-XXXXXXXX"
              required
            />
            <button className="button primary" disabled={busy}>
              <Search /> {busy ? "در حال بررسی" : "پیگیری"}
            </button>
          </div>
          <label htmlFor="tracking-token">کد امنیتی پیگیری</label>
          <input
            id="tracking-token"
            dir="ltr"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="کد ۴۳ نویسه‌ای پرونده"
            minLength={43}
            maxLength={43}
            required
          />
          {error && <Notice type="warning">{error}</Notice>}
          {result && (
            <div className="tracking-result">
              <CheckCircle2 />
              <div>
                <small>{result.serviceTitle}</small>
                <h3>{statusLabels[result.status] ?? result.status}</h3>
                <p>آخرین به‌روزرسانی: {formatDate(result.updatedAt)}</p>
              </div>
            </div>
          )}
        </form>
      </section>
    </PublicLayout>
  );
}

// Set VITE_SUPPORT_PHONE (client/.env) once a real support number exists; until
// then no placeholder number is shown to visitors.
const SUPPORT_PHONE = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env?.VITE_SUPPORT_PHONE?.trim();

const staticPages: Record<
  string,
  { title: string; body: string; sections: { h: string; p: string }[] }
> = {
  ...extraStaticPages,
  "/documents-guide": {
    title: "راهنمای مدارک",
    body: "مدارک دقیق هر خدمت پس از انتخاب آن نمایش داده می‌شود.",
    sections: [
      {
        h: "مدارک هویتی",
        p: "تصویر خوانا و معتبر کارت ملی و مدارک نمایندگی حسب مورد.",
      },
      {
        h: "مدارک مالکیت",
        p: "تمام صفحات سند، مشخصات پلاک، نشانی و کدپستی دقیق ملک.",
      },
      {
        h: "نقشه و مدارک فنی",
        p: "فایل‌ها فقط در فرمت‌های مجاز و مطابق سند الزامات هر خدمت پذیرفته می‌شوند.",
      },
    ],
  },
  "/tariffs": {
    title: "تعرفه‌ها و پرداخت‌ها",
    body: "هزینه هر خدمت پس از ابلاغ تعرفه مصوب و پیش از پرداخت به‌صورت شفاف نمایش داده می‌شود.",
    sections: [
      {
        h: "درگاه رسمی",
        p: "پرداخت آنلاین در این نسخهٔ نمایشی غیرفعال است. پس از فعال‌سازی، پرداخت فقط از درگاه رسمی متصل به حساب حقوقی کارگزاری انجام خواهد شد.",
      },
      {
        h: "رسید الکترونیکی",
        p: "هر پرداخت به پرونده متصل شده و رسید آن در پنل کاربری نگهداری می‌شود.",
      },
      {
        h: "استرداد وجه",
        p: "استرداد تنها طبق ضوابط قانونی و با ثبت کامل سوابق انجام می‌شود.",
      },
    ],
  },
  "/privacy": {
    title: "سیاست حفظ حریم خصوصی",
    body: "این صفحه روشن می‌کند چه داده‌ای در مرورگر شما و چه داده‌ای روی سرور ذخیره می‌شود، چه کسی به آن دسترسی دارد و چه زمانی پاک می‌شود.",
    sections: [
      {
        h: "داده‌های ذخیره‌شده در مرورگر شما",
        p: "پیش‌نویس فرم «درخواست جدید» به‌صورت موقت در حافظهٔ محلی مرورگر شما نگه‌داری می‌شود تا با بستن صفحه از دست نرود. این پیش‌نویس کدملی، شماره همراه و شناسه‌های هویتی را شامل نمی‌شود، پس از دو ساعت منقضی می‌شود و با خروج از حساب یا ثبت نهایی پاک می‌شود. نشست ورود شما در کوکی امن HttpOnly نگه‌داری می‌شود و برای اسکریپت‌های صفحه قابل خواندن نیست.",
      },
      {
        h: "داده‌های ذخیره‌شده روی سرور",
        p: "با «ثبت نهایی» یا ایجاد حساب، اطلاعات هویتی (رمزنگاری‌شده)، مشخصات ملک، مدارک بارگذاری‌شده، پیام‌ها و سوابق دسترسی در پایگاه دادهٔ سرور ذخیره می‌شود. در این نسخهٔ نمایشی هیچ اطلاعاتی به سامانه‌های سازمان ثبت یا درگاه پرداخت ارسال نمی‌شود.",
      },
      {
        h: "چه کسی به داده دسترسی دارد",
        p: "خود متقاضی و کارکنانی که پرونده به نقش آن‌ها مربوط است یا به آن‌ها ارجاع شده است. هر مشاهده یا دانلود اطلاعات حساس در سوابق ممیزی ثبت می‌شود و ناظر فقط حق مشاهده دارد.",
      },
      {
        h: "مدت نگهداری و پاک‌سازی",
        p: "پرونده‌ها، اطلاعات هویتی و سوابق ممیزی ۱۲۰ ماه، سوابق پشتیبانی ۳۶ ماه و گزارش درخواست‌های API ۲۴ ماه نگه‌داری می‌شود. پیش‌نویس مرورگر پس از دو ساعت و نشست‌های ورود پس از انقضا یا خروج از حساب بی‌اعتبار می‌شوند. افشای اطلاعات جز در موارد قانونی انجام نمی‌شود.",
      },
    ],
  },
  "/terms": {
    title: "شرایط استفاده",
    body: "استفاده از سامانه به معنی پذیرش مسئولیت صحت اطلاعات و حدود صلاحیت کارگزاری است.",
    sections: [
      {
        h: "صحت اطلاعات",
        p: "مسئولیت اصالت مدارک و قانونی بودن مستندات بر عهده متقاضی است.",
      },
      {
        h: "حدود صلاحیت",
        p: "کارگزاری مرجع تصمیم نهایی ثبتی، تشخیص مالکیت یا تضمین نتیجه نیست.",
      },
      {
        h: "رفتار ممنوع",
        p: "ارائه سند جعلی، اطلاعات خلاف واقع یا استفاده از مدارک متعلق به غیر موجب توقف و پیگیری قانونی است.",
      },
    ],
  },
  "/support": {
    title: "مرکز پشتیبانی",
    body: "پشتیبانی تلفنی و آنلاین برای راهنمایی فرایند، ثبت تیکت و پیگیری درخواست‌ها در دسترس است.",
    sections: [
      {
        h: "پشتیبانی تلفنی",
        p: SUPPORT_PHONE
          ? `شنبه تا چهارشنبه از ساعت ۸ تا ۱۶ از طریق ${SUPPORT_PHONE}.`
          : "شنبه تا چهارشنبه از ساعت ۸ تا ۱۶ از طریق ثبت تیکت در پنل کاربری.",
      },
      {
        h: "پیام داخلی",
        p: "پس از ورود، پیام‌های مرتبط با پرونده را از مسیر کنترل‌شده سامانه ارسال کنید.",
      },
      {
        h: "موارد تخصصی",
        p: "پرسش‌های تخصصی برای پاسخ مستند به کارشناس مربوط ارجاع می‌شوند.",
      },
    ],
  },
};
function StaticPage({ page }: { page: keyof typeof staticPages }) {
  const d = staticPages[page];
  return (
    <PublicLayout>
      <PageHero title={d.title} body={d.body} />
      <section className="container info-grid">
        {d.sections.map((s) => (
          <article key={s.h}>
            <CircleHelp />
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </article>
        ))}
      </section>
      {page === "/about" && <PublicOrganizationProfile />}
      {page === "/documents-guide" && (
        <section
          className="container upload-visual-guide"
          aria-label="راهنمای تصویری بارگذاری"
        >
          <article>
            <span>
              <FileText />
            </span>
            <b>۱</b>
            <h2>اسکن خوانا</h2>
            <p>
              چهار گوشه مدرک، متن و مهرها باید کامل و بدون بازتاب نور دیده شوند.
            </p>
          </article>
          <i aria-hidden="true">←</i>
          <article>
            <span>
              <Upload />
            </span>
            <b>۲</b>
            <h2>انتخاب نوع و حساسیت</h2>
            <p>
              نوع واقعی مدرک و سطح محرمانگی را پیش از انتخاب فایل مشخص کنید.
            </p>
          </article>
          <i aria-hidden="true">←</i>
          <article>
            <span>
              <FileCheck2 />
            </span>
            <b>۳</b>
            <h2>کنترل و نسخه‌بندی</h2>
            <p>
              فرمت، امضای فایل، حجم و هش کنترل و هر اصلاح به‌عنوان نسخه جدید ثبت
              می‌شود.
            </p>
          </article>
        </section>
      )}
    </PublicLayout>
  );
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [personType, setPersonType] = useState<"individual" | "legal">(
    "individual",
  );
  if (user) return <Navigate to="/panel" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const data = Object.fromEntries(form);
    if (mode === "register") {
      Object.assign(data, {
        acceptTerms: form.has("acceptTerms"),
        acceptPrivacy: form.has("acceptPrivacy"),
        confirmAccuracy: form.has("confirmAccuracy"),
      });
    }
    try {
      const result = await request<
        { user: User } | { mfaRequired: true; message: string }
      >(`/auth/${mode}`, { method: "POST", body: JSON.stringify(data) });
      if ("mfaRequired" in result) {
        setMfaRequired(true);
        setError(result.message);
        return;
      }
      login(result.user);
      navigate("/panel");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "ورود به سامانه ناموفق بود.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <section className="auth-section">
        <div className="auth-card">
          <span className="auth-icon">
            <UserRound />
          </span>
          <h1>{mode === "login" ? "ورود به سامانه" : "ایجاد حساب متقاضی"}</h1>
          <p>
            {mode === "login"
              ? "برای مشاهده و پیگیری پرونده وارد شوید."
              : "اطلاعات را دقیقاً مطابق مدارک هویتی وارد کنید."}
          </p>
          {error && <Notice type="warning">{error}</Notice>}
          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <Field name="fullName" label="نام و نام خانوادگی" />
                <div className="form-row">
                  <Field name="nationalId" label="کد ملی" dir="ltr" />
                  <Field name="mobile" label="شماره همراه" dir="ltr" />
                </div>
                <label className="field">
                  <span>نوع شخصیت*</span>
                  <select
                    name="personType"
                    value={personType}
                    onChange={(event) =>
                      setPersonType(
                        event.target.value as "individual" | "legal",
                      )
                    }
                  >
                    <option value="individual">حقیقی</option>
                    <option value="legal">حقوقی</option>
                  </select>
                </label>
                {personType === "legal" && (
                  <div className="form-row">
                    <Field name="organizationName" label="نام شخص حقوقی" />
                    <Field
                      name="organizationNationalId"
                      label="شناسه ملی شخص حقوقی"
                      dir="ltr"
                    />
                  </div>
                )}
              </>
            )}
            {mode === "login" && (
              <Field
                name="mobile"
                label="شماره همراه"
                dir="ltr"
                type="tel"
                autoComplete="username"
                placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              />
            )}
            <Field
              name="password"
              label="رمز عبور"
              type="password"
              dir="ltr"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              hint={
                mode === "register"
                  ? "حداقل ۱۰ کاراکتر شامل حروف بزرگ، کوچک، عدد و نماد"
                  : ""
              }
            />
            {mode === "login" && mfaRequired && (
              <div className="form-row">
                <Field
                  name="otp"
                  label="کد شش‌رقمی احراز هویت"
                  dir="ltr"
                  placeholder="000000"
                  required={false}
                />
                <Field
                  name="recoveryCode"
                  label="کد بازیابی ۱۰رقمی"
                  dir="ltr"
                  placeholder="A1B2C3D4E5"
                  required={false}
                />
              </div>
            )}
            {mode === "register" && (
              <div className="consent-stack">
                <label>
                  <input type="checkbox" name="acceptTerms" required /> شرایط
                  استفاده را می‌پذیرم.
                </label>
                <label>
                  <input type="checkbox" name="acceptPrivacy" required /> سیاست
                  حریم خصوصی را می‌پذیرم.
                </label>
                <label>
                  <input type="checkbox" name="confirmAccuracy" required /> صحت
                  اطلاعات واردشده را تأیید می‌کنم.
                </label>
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "لطفاً صبر کنید"
                : mode === "login"
                  ? "ورود امن"
                  : "ایجاد حساب"}
            </button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                حساب ندارید؟ <Link to="/register">ثبت‌نام کنید</Link>
              </>
            ) : (
              <>
                قبلاً ثبت‌نام کرده‌اید؟ <Link to="/login">وارد شوید</Link>
              </>
            )}
          </div>
        </div>
        <aside className="auth-side">
          <img
            className="auth-side-img"
            src="/hero.jpg"
            alt=""
            width={1200}
            height={800}
            decoding="async"
          />
          <div className="auth-side-content">
            <ShieldCheck />
            <h2>حریم خصوصی شما جدی است</h2>
            <p>
              ورودها، مشاهده اسناد و تغییرات پرونده ثبت و بر اساس نقش کنترل
              می‌شوند.
            </p>
            <ul>
              <li>عدم اشتراک‌گذاری رمز عبور</li>
              <li>خروج امن پس از پایان کار</li>
              <li>گزارش فوری فعالیت مشکوک</li>
            </ul>
          </div>
        </aside>
      </section>
    </PublicLayout>
  );
}
function Field({
  label,
  name,
  type = "text",
  dir,
  hint,
  required = true,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  type?: string;
  dir?: "ltr" | "rtl";
  hint?: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b>*</b>}
      </span>
      <input
        name={name}
        type={type}
        dir={dir}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Protected({
  children,
  capability,
}: {
  children: ReactNode;
  capability?: string;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  // Accounts created by the bootstrap script must replace the temporary
  // password before anything else is available.
  if (user.mustChangePassword && location.pathname !== "/panel/profile")
    return <Navigate to="/panel/profile" replace />;
  if (capability && !can(user.role, capability, user.capabilities))
    return <Navigate to="/panel" replace />;
  return <>{children}</>;
}
const SIDEBAR_COLLAPSED_KEY = "gholname.sidebarCollapsed";

export function PanelLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    // On small screens the sidebar is an off-canvas drawer; on larger
    // screens the hamburger collapses it into an icon-only rail.
    if (window.matchMedia("(max-width: 900px)").matches) {
      setOpen((value) => !value);
      return;
    }
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable: the choice just won't persist */
      }
      return next;
    });
  }
  const links = [
    ["/panel", Gauge, "نمای کلی", "panel.view"],
    ["/panel/applications", FolderClock, "پرونده‌ها", "applications.read"],
    ["/panel/new", FileText, "درخواست جدید", "applications.create"],
    ["/panel/workspace", ClipboardCheck, "میزکار عملیات", "workspace"],
    ["/panel/complaints", MessageSquareWarning, "شکایات", "complaints"],
    ["/panel/support", Headphones, "پشتیبانی و اعلان‌ها", "support"],
    ["/panel/profile", UserRound, "پروفایل و امنیت", "profile"],
    ["/panel/admin", LayoutDashboard, "داشبورد نظارتی", "dashboard"],
    ["/panel/manage", Gauge, "مدیریت سامانه", "management"],
    [
      "/panel/internal-controls",
      ShieldCheck,
      "کنترل داخلی",
      "internal_controls",
    ],
  ];
  return (
    <div className={collapsed ? "panel-shell sidebar-collapsed" : "panel-shell"}>
      <aside
        id="panel-sidebar"
        className={open ? "panel-sidebar open" : "panel-sidebar"}
      >
        <Logo light className="panel-brand" />
        <div className="user-brief">
          <span>
            <UserRound />
          </span>
          <div className="user-brief-text">
            <strong>{user?.name}</strong>
            <small>{roleLabels[user?.role ?? ""] ?? user?.role}</small>
          </div>
        </div>
        <nav>
          {links
            .filter(([, , , capability]) =>
              can(user?.role, capability as string, user?.capabilities),
            )
            .map(([to, Icon, label]) => (
              <NavLink
                end={to === "/panel"}
                to={to as string}
                key={to as string}
                title={label as string}
                onClick={() => setOpen(false)}
              >
                <Icon size={20} />
                <span className="nav-label">{label as string}</span>
              </NavLink>
            ))}
        </nav>
        <button className="logout" onClick={logout} title="خروج امن">
          <LogOut /> <span className="nav-label">خروج امن</span>
        </button>
      </aside>
      <div className="panel-main">
        <div className="panel-top">
          <button
            type="button"
            className="menu-button"
            onClick={toggleSidebar}
            aria-controls="panel-sidebar"
            aria-expanded={open || !collapsed}
            aria-label={
              open || !collapsed ? "جمع کردن منوی کناری" : "باز کردن منوی کناری"
            }
            title={open || !collapsed ? "جمع کردن منو" : "باز کردن منو"}
          >
            <Menu />
          </button>
          <div>
            <small>امروز</small>
            <strong>
              {new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                dateStyle: "full",
              }).format(new Date())}
            </strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="مشاهده اعلان‌ها"
              title="اعلان‌ها"
              onClick={() =>
                navigate(
                  can(user?.role, "support", user?.capabilities)
                    ? "/panel/support"
                    : "/panel",
                )
              }
            >
              <Bell />
            </button>
            <Link className="button subtle" to="/">
              مشاهده سایت
            </Link>
          </div>
        </div>
        <div className="panel-content">{children}</div>
      </div>
      {open && (
        <button
          aria-label="بستن منو"
          className="sidebar-overlay"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function PanelHome() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    request<ApplicationItem[]>("/applications")
      .then(setItems)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "دریافت پرونده‌ها ناموفق بود.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>سلام، {user?.name}</span>
          <h1>نمای کلی فعالیت شما</h1>
        </div>
        {can(user?.role, "applications.create", user?.capabilities) && (
          <Link className="button primary" to="/panel/new">
            <FileText /> درخواست جدید
          </Link>
        )}
      </div>
      <Notice>
        کارگزاری فقط پذیرش، تکمیل مدارک و پیگیری مجاز را انجام می‌دهد و نتیجه
        نهایی در اختیار مرجع ثبتی است.
      </Notice>
      {error && <Notice type="warning">{error}</Notice>}
      <div className="stats">
        <Stat
          icon={<FolderClock />}
          value={items.length}
          label="کل پرونده‌ها"
        />
        <Stat
          icon={<ClipboardCheck />}
          value={items.filter((i) => i.status === "completed").length}
          label="پرونده خاتمه‌یافته"
        />
        <Stat
          icon={<AlertCircle />}
          value={
            items.filter((i) =>
              ["documents_deficient", "awaiting_applicant"].includes(i.status),
            ).length
          }
          label="نیازمند اقدام شما"
        />
      </div>
      <section className="panel-card">
        <div className="card-header">
          <h2>آخرین پرونده‌ها</h2>
          {can(user?.role, "applications.read", user?.capabilities) && (
            <Link to="/panel/applications">مشاهده همه</Link>
          )}
        </div>
        {loading ? (
          <Loading />
        ) : items.length ? (
          <ApplicationTable items={items.slice(0, 5)} />
        ) : (
          <Empty
            title={
              can(user?.role, "applications.create", user?.capabilities)
                ? "هنوز پرونده‌ای ندارید"
                : "پرونده‌ای در سطح دسترسی شما نیست"
            }
            body={
              can(user?.role, "applications.create", user?.capabilities)
                ? "با انتخاب خدمت و تکمیل فرم، نخستین درخواست خود را ثبت کنید."
                : "این بخش بر اساس قابلیت‌های نقش شما محدود شده است."
            }
          />
        )}
      </section>
    </PanelLayout>
  );
}
function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <div>
        <strong>{new Intl.NumberFormat("fa-IR").format(value)}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
function ApplicationTable({ items }: { items: ApplicationItem[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>شماره پرونده</th>
            <th>خدمت</th>
            <th>وضعیت</th>
            <th>آخرین تغییر</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td dir="ltr">{i.fileNumber}</td>
              <td>{i.serviceTitle}</td>
              <td>
                <span className={`status ${i.status}`}>
                  {statusLabels[i.status] ?? i.status}
                </span>
              </td>
              <td>{formatDate(i.updatedAt)}</td>
              <td>
                <Link
                  aria-label="مشاهده پرونده"
                  to={`/panel/applications/${i.id}`}
                >
                  <ChevronLeft />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ApplicationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    request<ApplicationItem[]>("/applications")
      .then(setItems)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "دریافت پرونده‌ها ناموفق بود.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>مدیریت سوابق</span>
          <h1>پرونده‌ها</h1>
        </div>
        {can(user?.role, "applications.create", user?.capabilities) && (
          <Link className="button primary" to="/panel/new">
            درخواست جدید
          </Link>
        )}
      </div>
      <section className="panel-card">
        {error ? (
          <Notice type="warning">{error}</Notice>
        ) : loading ? (
          <Loading />
        ) : items.length ? (
          <ApplicationTable items={items} />
        ) : (
          <Empty
            title="پرونده‌ای وجود ندارد"
            body="هنوز درخواستی ثبت نشده است."
          />
        )}
      </section>
    </PanelLayout>
  );
}

function NewApplication() {
  const savedDraft = useMemo(() => loadDraft(), []);
  const [services, setServices] = useState<Service[]>([]);
  const [step, setStep] = useState(Number(savedDraft.step) || 1);
  const [serviceId, setServiceId] = useState(
    String(savedDraft.serviceId ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    request<Service[]>("/public/services")
      .then(setServices)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "دریافت فهرست خدمات ناموفق بود.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!formRef.current || !savedDraft.fields) return;
    for (const element of Array.from(formRef.current.elements)) {
      if (!(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ))
        continue;
      if (element.dataset.controlled === "true") continue;
      if (["radio", "hidden", "checkbox"].includes(element.type)) continue;
      const value = (savedDraft.fields as Record<string, unknown>)[element.name];
      if (typeof value === "string") element.value = value;
    }
  }, [services.length, step]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(), 0);
    return () => window.clearTimeout(timer);
  }, [serviceId, step]);
  function saveDraft(nextStep = step) {
    if (!formRef.current) return;
    persistDraft({
      step: nextStep,
      serviceId,
      fields: Object.fromEntries(new FormData(formRef.current)),
    });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const relatedProperties = parseArrayField(
        f.get("relatedPropertiesJson"),
      ).map((item: any) => ({
        ...item,
        area: item.area ? Number(item.area) : undefined,
      }));
      const parties = parseArrayField(f.get("partiesJson")).map(
        (item: any) => ({
          ...item,
          nationalId: item.nationalId || undefined,
          shareDescription: item.shareDescription || undefined,
        }),
      );
      const subdivisionUnits = parseArrayField(
        f.get("subdivisionUnitsJson"),
      ).map((item: any) => ({
        ...item,
        floor: item.floor || undefined,
        area: item.area ? Number(item.area) : undefined,
      }));
      const formData = Object.fromEntries(f.entries());
      delete formData.relatedPropertiesJson;
      delete formData.partiesJson;
      delete formData.subdivisionUnitsJson;
      if (
        selected?.code === "land-apartment-subdivision" &&
        subdivisionUnits.length !== Number(formData.unitCount)
      )
        throw new Error(
          "تعداد قطعات یا واحدهای ثبت‌شده باید با تعداد اعلام‌شده برابر باشد.",
        );
      if (
        selected?.code === "merge-partition" &&
        (relatedProperties.length + 1 !== Number(formData.relatedPlateCount) ||
          parties.length === 0)
      )
        throw new Error(
          "همه پلاک‌ها و حداقل یک مالک یا ذی‌نفع را به‌صورت ساختاریافته ثبت کنید.",
        );
      const created = await request<{
        id: number;
        fileNumber: string;
        trackingToken: string;
      }>("/applications", {
        method: "POST",
        body: JSON.stringify({
          serviceId: Number(serviceId),
          applicantCapacity: f.get("applicantCapacity"),
          formData,
          relatedProperties,
          parties,
          subdivisionUnits,
          property: {
            province: f.get("province"),
            county: f.get("county"),
            registrySection: f.get("registrySection"),
            mainPlate: f.get("mainPlate"),
            subPlate: f.get("subPlate") || undefined,
            parcel: f.get("parcel") || undefined,
            address: f.get("address"),
            postalCode: f.get("postalCode") || undefined,
            propertyType: f.get("propertyType"),
            deedType: f.get("deedType") || undefined,
            area: f.get("area") ? Number(f.get("area")) : undefined,
            coordinates:
              f.get("latitude") && f.get("longitude")
                ? {
                    lat: Number(f.get("latitude")),
                    lng: Number(f.get("longitude")),
                  }
                : undefined,
            notes: f.get("description") || undefined,
          },
        }),
      });
      clearDraft();
      navigate(`/panel/applications/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت درخواست ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  const selected = services.find((s) => s.id === Number(serviceId));
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>فرم هوشمند</span>
          <h1>ثبت درخواست جدید</h1>
        </div>
      </div>
      <div className="wizard-steps">
        {["انتخاب خدمت", "اطلاعات ملک", "بازبینی و ثبت"].map((s, i) => (
          <div className={step >= i + 1 ? "active" : ""} key={s}>
            <b>{i + 1}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>
      {error && <Notice type="warning">{error}</Notice>}
      <form
        ref={formRef}
        className="panel-card wizard"
        onSubmit={submit}
        onInput={() => saveDraft()}
      >
        {step === 1 && (
          <>
            <h2>خدمت موردنظر را انتخاب کنید</h2>
            <p>هر درخواست باید فقط برای یک خدمت مجاز تشکیل شود.</p>
            <div className="service-options">
              {services.map((s) => (
                <label
                  className={serviceId === String(s.id) ? "selected" : ""}
                  key={s.id}
                >
                  <input
                    type="radio"
                    name="serviceId"
                    value={s.id}
                    checked={serviceId === String(s.id)}
                    onChange={() => {
                      setServiceId(String(s.id));
                    }}
                  />
                  <span>
                    <FileCheck2 />
                    <strong>{s.title}</strong>
                    <small>{s.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="wizard-actions">
              <button
                type="button"
                className="button primary"
                disabled={!serviceId}
                onClick={() => {
                  setStep(2);
                  saveDraft(2);
                }}
              >
                ادامه <ArrowLeft />
              </button>
            </div>
          </>
        )}
        {step >= 2 && (
          <div className={step === 2 ? "" : "hidden-step"}>
            <h2>اطلاعات متقاضی و ملک</h2>
            <p>اطلاعات را دقیقاً مطابق سند و مدارک رسمی وارد کنید.</p>
            <div className="form-grid">
              <label className="field">
                <span>سمت متقاضی*</span>
                <select name="applicantCapacity" required>
                  <option value="owner">مالک</option>
                  <option value="attorney">وکیل</option>
                  <option value="legal_representative">نماینده قانونی</option>
                  <option value="company_manager">مدیر شرکت</option>
                  <option value="heir">وارث</option>
                  <option value="occupant">متصرف</option>
                  <option value="beneficiary">ذی‌نفع</option>
                  <option value="other">سایر سمت‌های مجاز</option>
                </select>
              </label>
              <LocationFields
                initialProvince={String(savedDraft.fields?.province ?? "")}
                initialCity={String(savedDraft.fields?.county ?? "")}
                initialSection={String(
                  savedDraft.fields?.registrySection ?? "",
                )}
              />
              <Field name="mainPlate" label="پلاک اصلی" />
              <Field name="subPlate" label="پلاک فرعی" required={false} />
              <Field name="parcel" label="قطعه" required={false} />
              <Field
                name="postalCode"
                label="کدپستی"
                dir="ltr"
                required={false}
              />
              <Field name="propertyType" label="نوع ملک" />
              <Field name="deedType" label="نوع سند" required={false} />
              <Field
                name="area"
                label="مساحت (متر مربع)"
                type="number"
                dir="ltr"
                required={false}
              />
              <Field
                name="deedNumber"
                label="شماره سند"
                dir="ltr"
                required={false}
              />
              <Field
                name="latitude"
                label="عرض جغرافیایی"
                dir="ltr"
                required={false}
              />
              <Field
                name="longitude"
                label="طول جغرافیایی"
                dir="ltr"
                required={false}
              />
              <label className="field span-2">
                <span>نشانی کامل ملک*</span>
                <textarea name="address" required minLength={10} />
              </label>
              <label className="field span-2">
                <span>توضیحات تکمیلی</span>
                <textarea name="description" />
              </label>
            </div>
            <ServiceSpecificFields
              code={selected?.code}
              initialValues={savedDraft.fields ?? {}}
            />
            <StructuredApplicationFields code={selected?.code} />
            {selected?.servicePolicy?.requiredDocuments?.length ? (
              <section className="service-requirements" aria-live="polite">
                <strong>مدارک الزامی پیش از ارسال نهایی</strong>
                <ul>
                  {selected.servicePolicy.requiredDocuments.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Notice type="warning">
              مسئولیت صحت اطلاعات، اصالت مدارک و قانونی بودن مستندات بر عهده
              متقاضی است.
            </Notice>
            <div className="wizard-actions">
              <button
                type="button"
                className="button subtle"
                onClick={() => {
                  setStep(1);
                  saveDraft(1);
                }}
              >
                بازگشت
              </button>
              <button
                type="button"
                className="button primary"
                onClick={(event) => {
                  if (event.currentTarget.form?.reportValidity()) {
                    setStep(3);
                    saveDraft(3);
                  }
                }}
              >
                بازبینی <ArrowLeft />
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2>بازبینی و تأیید نهایی</h2>
            <div className="review-service">
              <FileCheck2 />
              <div>
                <small>خدمت انتخاب‌شده</small>
                <strong>{selected?.title}</strong>
              </div>
            </div>
            <label className="consent">
              <input type="checkbox" required />
              <span>
                صحت اطلاعات واردشده را تأیید می‌کنم و می‌پذیرم کارگزاری مرجع
                تصمیم نهایی ثبتی یا تضمین‌کننده نتیجه نیست.
              </span>
            </label>
            <div className="wizard-actions">
              <button
                type="button"
                className="button subtle"
                onClick={() => {
                  setStep(2);
                  saveDraft(2);
                }}
              >
                بازگشت و اصلاح
              </button>
              <button className="button primary" disabled={busy}>
                <Send />
                {busy ? "در حال تشکیل پرونده" : "تشکیل پرونده"}
              </button>
            </div>
          </div>
        )}
      </form>
    </PanelLayout>
  );
}

function ApplicationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isObserver = user?.role === "observer";
  const [data, setData] = useState<any>(null);
  const [paymentQuote, setPaymentQuote] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [error, setError] = useState("");
  const [docType, setDocType] = useState("مدارک هویتی");
  const [sensitivity, setSensitivity] = useState("confidential");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    message: string;
    fileNumber?: string;
    trackingToken?: string;
  } | null>(null);
  async function load() {
    try {
      setData(await request(`/applications/${id}`));
      if (
        [
          "applicant",
          "representative",
          "finance",
          "operations_manager",
          "compliance",
          "admin",
          "observer",
        ].includes(user?.role ?? "")
      )
        setPaymentQuote(
          await request(`/operations/applications/${id}/payment-quote`),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    }
  }
  useEffect(() => {
    load();
  }, [id, user?.role]);
  useEffect(() => {
    const allowedTypes = data?.servicePolicy?.documentTypes as
      string[] | undefined;
    if (allowedTypes?.length && !allowedTypes.includes(docType))
      setDocType(allowedTypes[0]);
  }, [data?.servicePolicy?.documentTypes, docType]);
  async function initiatePayment() {
    setBusy(true);
    try {
      await request(`/operations/applications/${id}/payments/initiate`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "شروع پرداخت ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function showReceipt(paymentId: number) {
    try {
      setReceipt(await request(`/operations/payments/${paymentId}/receipt`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت رسید ناموفق بود.");
    }
  }
  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("documentType", docType);
    fd.append("sensitivity", sensitivity);
    try {
      await request(`/applications/${id}/documents`, {
        method: "POST",
        body: fd,
      });
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function removeDocument(documentId: number) {
    if (!window.confirm("مدرک از نمایش پرونده حذف و سابقه اقدام نگهداری شود؟"))
      return;
    try {
      await request(`/applications/documents/${documentId}`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حذف مدرک ناموفق بود.");
    }
  }
  async function submitCase() {
    setBusy(true);
    try {
      const result = await request<{
        message: string;
        fileNumber?: string;
        trackingToken?: string;
      }>(`/applications/${id}/submit`, {
        method: "POST",
        body: "{}",
      });
      setError("");
      setSubmissionSuccess({
        message: result.message || "پرونده شما با موفقیت ثبت شد.",
        fileNumber: result.fileNumber,
        trackingToken: result.trackingToken,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارسال ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function cancelCase() {
    const reason = window.prompt("دلیل لغو پرونده را وارد کنید:");
    if (!reason || reason.trim().length < 5) {
      setError("دلیل لغو باید حداقل ۵ نویسه باشد.");
      return;
    }
    setBusy(true);
    try {
      await request(`/applications/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "لغو پرونده ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function sendCaseMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request(`/operations/applications/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          type: values.get("type"),
          body: values.get("body"),
          attachmentDocumentId:
            Number(values.get("attachmentDocumentId")) || undefined,
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارسال پیام ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <PanelLayout>
        {error ? <Notice type="warning">{error}</Notice> : <Loading />}
      </PanelLayout>
    );
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span dir="ltr">{data.file_number}</span>
          <h1>{data.serviceTitle}</h1>
          {data.trackingToken && (
            <small>
              کد امنیتی پیگیری: <b dir="ltr">{data.trackingToken}</b>
            </small>
          )}
        </div>
        <span className={`status large ${data.status}`}>
          {statusLabels[data.status] ?? data.status}
        </span>
        <button
          className="button subtle"
          onClick={() =>
            downloadFile(
              `/applications/${id}/report`,
              `${data.file_number}.html`,
            ).catch((e) => setError(e.message))
          }
        >
          دریافت گزارش مجاز
        </button>
        <button
          className="button subtle"
          onClick={() =>
            downloadFile(
              `/applications/${id}/report.csv`,
              `${data.file_number}.csv`,
            ).catch((e) => setError(e.message))
          }
        >
          خروجی Excel/CSV
        </button>
      </div>
      {error && <Notice type="warning">{error}</Notice>}
      {submissionSuccess && (
        <Notice type="success">
          <strong>{submissionSuccess.message}</strong>
          {submissionSuccess.fileNumber && (
            <span>
              شماره پرونده: <b dir="ltr">{submissionSuccess.fileNumber}</b>
            </span>
          )}
          {submissionSuccess.trackingToken && (
            <span>
              کد امنیتی پیگیری:{" "}
              <b dir="ltr">{submissionSuccess.trackingToken}</b>
            </span>
          )}
        </Notice>
      )}
      <div className="detail-grid">
        <section className="panel-card">
          <div className="card-header">
            <h2>مشخصات ملک</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>استان / شهر</dt>
              <dd>
                {data.property?.province} / {data.property?.county}
              </dd>
            </div>
            <div>
              <dt>بخش و پلاک اصلی</dt>
              <dd>
                {data.property?.registry_section} - {data.property?.main_plate}
              </dd>
            </div>
            <div>
              <dt>نوع ملک</dt>
              <dd>{data.property?.property_type}</dd>
            </div>
            <div className="wide">
              <dt>نشانی</dt>
              <dd>{data.property?.address}</dd>
            </div>
          </dl>
        </section>
        {(data.relatedProperties?.length > 0 ||
          data.parties?.length > 0 ||
          data.form_data?.subdivisionUnits?.length > 0) && (
          <section className="panel-card structured-summary">
            <div className="card-header">
              <h2>املاک و طرف‌های مرتبط</h2>
            </div>
            {data.relatedProperties?.map((property: any) => (
              <div key={property.id}>
                <strong>پلاک {property.main_plate}</strong>
                <small>
                  فرعی {property.sub_plate || "-"}، قطعه{" "}
                  {property.parcel || "-"}
                </small>
              </div>
            ))}
            {data.parties?.map((party: any) => (
              <div key={party.id}>
                <strong>{party.full_name}</strong>
                <small>
                  {party.party_type} - سهم:{" "}
                  {party.share_description || "ثبت نشده"}
                </small>
              </div>
            ))}
            {data.form_data?.subdivisionUnits?.map(
              (unit: any, index: number) => (
                <div key={`${unit.identifier}-${index}`}>
                  <strong>قطعه یا واحد {unit.identifier}</strong>
                  <small>
                    کاربری {unit.useType}، مساحت {unit.area} متر مربع
                    {unit.floor ? `، طبقه ${unit.floor}` : ""}
                  </small>
                </div>
              ),
            )}
          </section>
        )}
        <section className="panel-card">
          <div className="card-header">
            <h2>مدارک پرونده</h2>
            <span>{(data.documents ?? []).length} فایل</span>
          </div>
          {(data.documents ?? []).length ? (
            <div className="document-list">
              {(data.documents ?? []).map((d: any) => (
                <div key={d.id}>
                  <FileText />
                  <div>
                    <strong>{d.documentType}</strong>
                    <small>
                      {d.originalName} - نسخه {d.version}
                    </small>
                  </div>
                  <span className="status">
                    {d.reviewStatus === "received"
                      ? "دریافت شد"
                      : d.reviewStatus === "needs_revision"
                        ? "نیازمند اصلاح"
                        : d.reviewStatus === "rejected"
                          ? "رد شده"
                          : d.reviewStatus}
                  </span>
                  <div className="document-actions">
                    <button
                      type="button"
                      onClick={() =>
                        downloadFile(
                          `/applications/documents/${d.id}/download`,
                          d.originalName,
                        ).catch((e) => setError(e.message))
                      }
                    >
                      دریافت
                    </button>
                    {data.allowedActions?.deleteDocument && (
                      <button
                        type="button"
                        onClick={() => removeDocument(d.id)}
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="مدرکی بارگذاری نشده"
              body="مدارک موردنیاز خدمت را بارگذاری کنید."
            />
          )}
          {data.servicePolicy?.requiredDocuments?.length > 0 && (
            <div className="document-checklist">
              <strong>کنترل مدارک الزامی</strong>
              <ul>
                {data.servicePolicy.requiredDocuments.map((type: string) => {
                  const received = (data.documents ?? []).some(
                    (document: any) =>
                      document.documentType === type &&
                      !["rejected", "needs_revision"].includes(
                        document.reviewStatus,
                      ),
                  );
                  return (
                    <li
                      className={received ? "complete" : "missing"}
                      key={type}
                    >
                      {received ? "تکمیل" : "ناقص"} - {type}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {data.allowedActions?.uploadDocument && (
            <form className="upload-box" onSubmit={upload}>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {(
                  data.servicePolicy?.documentTypes ?? [
                    "مدارک هویتی",
                    "تصویر سند مالکیت",
                    "وکالت‌نامه یا نمایندگی",
                    "نقشه و مختصات",
                    "مستندات پشتیبان",
                  ]
                ).map((type: string) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                aria-label="سطح محرمانگی"
              >
                <option value="normal">عادی</option>
                <option value="confidential">محرمانه</option>
                <option value="highly_confidential">بسیار محرمانه</option>
              </select>
              <label>
                <Upload />
                <span>{file?.name ?? "انتخاب فایل مجاز"}</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.zip,.kml"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button className="button secondary" disabled={!file || busy}>
                بارگذاری
              </button>
            </form>
          )}
        </section>
        <section className="panel-card timeline-card">
          <div className="card-header">
            <h2>تاریخچه پرونده</h2>
          </div>
          {data.history.length ? (
            <div className="timeline">
              {data.history.map((h: any) => (
                <div key={h.id}>
                  <i />
                  <div>
                    <strong>{statusLabels[h.to_status] ?? h.to_status}</strong>
                    <p>{h.reason}</p>
                    {h.note && <p className="muted">{h.note}</p>}
                    <small>
                      {formatDate(h.created_at)} - {h.changedByName}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="هنوز تغییری ثبت نشده"
              body="پس از ارسال نهایی، رویدادهای پرونده اینجا نمایش داده می‌شود."
            />
          )}
        </section>
        <section className="panel-card case-messages">
          <div className="card-header">
            <h2>پیام‌های پرونده</h2>
            <span>{data.messages.length} پیام</span>
          </div>
          {data.messages.map((message: any) => (
            <article key={message.id}>
              <strong>
                {message.senderName} -{" "}
                {messageTypeLabels[message.message_type] ?? "پیام"}
              </strong>
              <p>{message.body}</p>
              <small>{formatDate(message.created_at)}</small>
              {message.attachment_document_id && (
                <button
                  type="button"
                  onClick={() => {
                    const attachment = (data.documents ?? []).find(
                      (document: any) =>
                        document.id === message.attachment_document_id,
                    );
                    if (attachment)
                      downloadFile(
                        `/applications/documents/${attachment.id}/download`,
                        attachment.originalName,
                      ).catch((error) => setError(error.message));
                  }}
                >
                  دریافت ضمیمه
                </button>
              )}
            </article>
          ))}
          {user && !isObserver && messageTypesForRole(user.role).length > 0 && (
            <form onSubmit={sendCaseMessage}>
              <select name="type">
                {messageTypesForRole(user.role).map((type) => (
                  <option key={type} value={type}>
                    {messageTypeLabels[type]}
                  </option>
                ))}
              </select>
              <textarea
                name="body"
                required
                minLength={2}
                maxLength={5000}
                placeholder="متن پیام"
              />
              <select name="attachmentDocumentId">
                <option value="">بدون ضمیمه</option>
                {(data.documents ?? []).map((document: any) => (
                  <option key={document.id} value={document.id}>
                    {document.originalName}
                  </option>
                ))}
              </select>
              <button className="button secondary" disabled={busy}>
                ارسال پیام امن
              </button>
            </form>
          )}
        </section>
        {paymentQuote && (
          <section className="panel-card payment-card">
            <div className="card-header">
              <h2>
                <ReceiptText /> تعرفه و پرداخت رسمی
              </h2>
              <span dir="ltr">{paymentQuote.fileNumber}</span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>هزینه قانونی</dt>
                <dd>{formatMoney(paymentQuote.legalFeeRials)}</dd>
              </div>
              <div>
                <dt>هزینه خدمات کارگزاری</dt>
                <dd>{formatMoney(paymentQuote.serviceFeeRials)}</dd>
              </div>
              <div className="wide">
                <dt>جمع قابل پرداخت</dt>
                <dd>
                  <strong>{formatMoney(paymentQuote.totalRials)}</strong>
                </dd>
              </div>
            </dl>
            <Notice type="warning">
              کارت‌به‌کارت، پرداخت به کارکنان و حساب واسط ممنوع است. پرداخت فقط
              از درگاه رسمی متصل به حساب حقوقی کارگزاری انجام می‌شود.
            </Notice>
            {paymentQuote.paymentMode !== "production" && (
              <p className="payment-disabled">
                درگاه تا ثبت حساب حقوقی و فعال‌سازی PSP رسمی غیرفعال است.
              </p>
            )}
            {["applicant", "representative"].includes(user?.role ?? "") && (
              <button
                className="button primary"
                type="button"
                disabled={!paymentQuote.payable || busy}
                onClick={initiatePayment}
              >
                <ReceiptText /> پرداخت از درگاه رسمی
              </button>
            )}
            {data.payments?.length > 0 && (
              <div className="payment-list">
                {data.payments.map((payment: any) => (
                  <article key={payment.id}>
                    <span>
                      <strong>{formatMoney(payment.amountRials)}</strong>
                      <small>{formatDate(payment.createdAt)}</small>
                    </span>
                    <i className="status">{payment.status}</i>
                    {payment.status === "successful" && (
                      <button
                        type="button"
                        className="button subtle small"
                        onClick={() => showReceipt(payment.id)}
                      >
                        مشاهده رسید
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
            {receipt && (
              <div className="electronic-receipt" role="status">
                <strong>رسید الکترونیکی {receipt.receiptNumber}</strong>
                <span>
                  شناسه تراکنش: <b dir="ltr">{receipt.transactionId}</b>
                </span>
                <span>مبلغ: {formatMoney(receipt.totalRials)}</span>
                <span>زمان: {formatDate(receipt.paidAt)}</span>
              </div>
            )}
          </section>
        )}
        <aside className="panel-card action-card">
          <h2>اقدام بعدی</h2>
          {submissionSuccess ? (
            <div className="submission-success" role="status">
              <CheckCircle2 />
              <h3>پرونده شما ثبت شد</h3>
              <p>{submissionSuccess.message}</p>
              {submissionSuccess.fileNumber && (
                <b dir="ltr">{submissionSuccess.fileNumber}</b>
              )}
            </div>
          ) : data.allowedActions?.submit ? (
            <>
              <p>
                ابتدا مدارک موردنیاز را بارگذاری و سپس درخواست را نهایی کنید.
              </p>
              <button
                className="button primary full"
                disabled={busy}
                onClick={submitCase}
              >
                <Send /> ارسال نهایی پرونده
              </button>
              {data.allowedActions?.cancel && (
                <button
                  className="button subtle full"
                  disabled={busy}
                  onClick={cancelCase}
                >
                  لغو پرونده
                </button>
              )}
            </>
          ) : data.allowedActions?.cancel ? (
            <>
              <p>در این مرحله می‌توانید پرونده را با ثبت دلیل لغو کنید.</p>
              <button
                className="button subtle full"
                disabled={busy}
                onClick={cancelCase}
              >
                لغو پرونده
              </button>
            </>
          ) : (
            <>
              <CheckCircle2 />
              <p>
                پرونده ثبت شده است. تغییرات و اعلام نقص از همین بخش قابل مشاهده
                خواهد بود.
              </p>
            </>
          )}
        </aside>
      </div>
    </PanelLayout>
  );
}

function ComplaintsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [complaintFiles, setComplaintFiles] = useState<
    Record<number, File | null>
  >({});
  async function load() {
    setItems(await request("/complaints"));
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await request<{ trackingCode: string }>("/complaints", {
        method: "POST",
        body: JSON.stringify(f),
      });
      setMessage(`شکایت ثبت شد. کد رهگیری: ${r.trackingCode}`);
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "ثبت شکایت ناموفق بود.");
    }
  }
  async function uploadComplaintAttachment(complaintId: number) {
    const file = complaintFiles[complaintId];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    try {
      await request(`/complaints/${complaintId}/attachments`, {
        method: "POST",
        body,
      });
      setComplaintFiles((current) => ({ ...current, [complaintId]: null }));
      setMessage("مستند شکایت با ثبت هش و سابقه بارگذاری شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "بارگذاری ناموفق بود.",
      );
    }
  }
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>رسیدگی مستند</span>
          <h1>شکایات و گزارش تخلف</h1>
        </div>
      </div>
      {message && (
        <Notice type={message.startsWith("شکایت ثبت") ? "success" : "warning"}>
          {message}
        </Notice>
      )}
      <div className="detail-grid">
        <form className="panel-card complaint-form" onSubmit={submit}>
          <h2>ثبت مورد جدید</h2>
          <label className="field">
            <span>موضوع گزارش*</span>
            <select name="category" required>
              <option value="service">کیفیت خدمت</option>
              <option value="staff">رفتار کارکنان</option>
              <option value="off_platform_payment">
                درخواست پرداخت خارج سامانه
              </option>
              <option value="impersonation">سوءاستفاده از نام کارگزاری</option>
              <option value="privacy">نقض حریم خصوصی</option>
              <option value="other">سایر</option>
            </select>
          </label>
          <Field name="subject" label="عنوان" />
          <label className="field">
            <span>شرح کامل*</span>
            <textarea name="description" minLength={20} required />
          </label>
          <button className="button primary">
            <Send /> ثبت و دریافت کد رهگیری
          </button>
        </form>
        <section className="panel-card">
          <div className="card-header">
            <h2>سوابق گزارش‌ها</h2>
          </div>
          {items.length ? (
            <div className="complaint-list">
              {items.map((c) => (
                <div key={c.id} className="complaint-item">
                  <div>
                    <strong>{c.subject}</strong>
                    <small dir="ltr">{c.tracking_code}</small>
                  </div>
                  <span className="status">{c.status}</span>
                  <p>{c.description}</p>
                  {c.response && <blockquote>{c.response}</blockquote>}
                  {c.status !== "closed" && (
                    <div className="complaint-attachment">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        aria-label={`مستند شکایت ${c.tracking_code}`}
                        onChange={(event) =>
                          setComplaintFiles((current) => ({
                            ...current,
                            [c.id]: event.target.files?.[0] ?? null,
                          }))
                        }
                      />
                      <button
                        type="button"
                        disabled={!complaintFiles[c.id]}
                        onClick={() => uploadComplaintAttachment(c.id)}
                      >
                        بارگذاری مستند
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="گزارشی ثبت نشده"
              body="موارد ثبت‌شده همراه پاسخ رسمی در این قسمت دیده می‌شوند."
            />
          )}
        </section>
      </div>
    </PanelLayout>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpAuthUri: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  async function load() {
    setProfile(await request("/auth/me"));
  }
  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setMessage("اطلاعات پایه با ثبت سابقه به‌روز شد.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ذخیره ناموفق بود.");
    }
  }
  async function beginMfa() {
    try {
      setMfaSetup(
        await request("/auth/mfa/setup", { method: "POST", body: "{}" }),
      );
      setMessage(
        "کلید را در برنامه Authenticator وارد و سپس کد را تأیید کنید.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "راه‌اندازی ناموفق بود.",
      );
    }
  }
  async function requestMobileOtp() {
    try {
      await request("/auth/mobile-otp/request", { method: "POST", body: "{}" });
      setMessage("کد تأیید رسمی به شماره همراه ارسال شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ارسال کد ناموفق بود.",
      );
    }
  }
  async function verifyMobileOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request("/auth/mobile-otp/verify", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage("شماره همراه با OTP رسمی تأیید شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تأیید کد ناموفق بود.",
      );
    }
  }
  async function enableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request<{ recoveryCodes: string[] }>(
        "/auth/mfa/enable",
        {
          method: "POST",
          body: JSON.stringify(values),
        },
      );
      setRecoveryCodes(result.recoveryCodes);
      setMfaSetup(null);
      setMessage(
        "احراز هویت دومرحله‌ای فعال شد. کدهای بازیابی را امن نگهداری کنید.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "فعال‌سازی ناموفق بود.",
      );
    }
  }
  async function disableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request("/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage("احراز هویت دومرحله‌ای غیرفعال شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "غیرفعال‌سازی ناموفق بود.",
      );
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await request("/auth/password/change", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      setMessage("رمز عبور با ثبت کامل سابقه تغییر کرد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تغییر رمز عبور ناموفق بود.",
      );
    }
  }
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>اطلاعات پایه و امنیت حساب</span>
          <h1>پروفایل کاربری</h1>
        </div>
      </div>
      {message && (
        <Notice type={message.includes("شد") ? "success" : "warning"}>
          {message}
        </Notice>
      )}
      {!profile ? (
        <Loading />
      ) : (
        <div className="profile-grid">
          <form className="panel-card" onSubmit={saveProfile}>
            <h2>اطلاعات پایه</h2>
            <Field
              name="fullName"
              label="نام و نام خانوادگی"
              value={profile.fullName}
              onChange={(value) => setProfile({ ...profile, fullName: value })}
            />
            <Field
              name="email"
              label="ایمیل"
              type="email"
              dir="ltr"
              value={profile.email}
              onChange={(value) => setProfile({ ...profile, email: value })}
            />
            <Field
              name="mobile"
              label="شماره همراه"
              dir="ltr"
              value={profile.mobile ?? ""}
              onChange={(value) => setProfile({ ...profile, mobile: value })}
            />
            {profile.personType === "legal" && (
              <Field
                name="organizationName"
                label="نام شخص حقوقی"
                value={profile.organizationName ?? ""}
                onChange={(value) =>
                  setProfile({ ...profile, organizationName: value })
                }
              />
            )}
            <button className="button primary">ذخیره اطلاعات</button>
          </form>
          <section className="panel-card mfa-card">
            <h2>تأیید شماره همراه</h2>
            <p>وضعیت: {profile.mobileVerifiedAt ? "تأییدشده" : "تأییدنشده"}</p>
            {!profile.mobileVerifiedAt && (
              <>
                <button className="button secondary" onClick={requestMobileOtp}>
                  ارسال OTP رسمی
                </button>
                <form onSubmit={verifyMobileOtp}>
                  <Field name="code" label="کد پیامکی" dir="ltr" />
                  <button className="button primary">تأیید شماره</button>
                </form>
              </>
            )}
            <h2>احراز هویت دومرحله‌ای</h2>
            <p>
              وضعیت: <strong>{profile.mfaEnabled ? "فعال" : "غیرفعال"}</strong>
            </p>
            {!profile.mfaEnabled && !mfaSetup && (
              <button className="button secondary" onClick={beginMfa}>
                شروع راه‌اندازی MFA
              </button>
            )}
            {mfaSetup && (
              <form onSubmit={enableMfa}>
                <code dir="ltr">{mfaSetup.secret}</code>
                <a href={mfaSetup.otpAuthUri}>بازکردن در Authenticator</a>
                <Field name="otp" label="کد شش‌رقمی" dir="ltr" />
                <button className="button primary">تأیید و فعال‌سازی</button>
              </form>
            )}
            {profile.mfaEnabled && (
              <form onSubmit={disableMfa}>
                <Field
                  name="password"
                  label="رمز عبور فعلی"
                  type="password"
                  dir="ltr"
                />
                <Field name="otp" label="کد شش‌رقمی" dir="ltr" />
                <button className="button danger">
                  غیرفعال‌سازی کنترل‌شده
                </button>
              </form>
            )}
            {recoveryCodes.length > 0 && (
              <div className="recovery-codes">
                {recoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
            )}
            <small>نقش: {roleLabels[user?.role ?? ""]}</small>
          </section>
          <form className="panel-card" onSubmit={changePassword}>
            <h2>تغییر امن رمز عبور</h2>
            <Field
              name="currentPassword"
              label="رمز عبور فعلی"
              type="password"
              dir="ltr"
            />
            <Field
              name="newPassword"
              label="رمز عبور جدید"
              type="password"
              dir="ltr"
              hint="حداقل ۱۲ نویسه شامل حرف بزرگ، حرف کوچک، عدد و نماد"
            />
            {profile.mfaEnabled && (
              <Field name="otp" label="کد شش‌رقمی MFA" dir="ltr" />
            )}
            <button className="button primary">تغییر رمز عبور</button>
          </form>
        </div>
      )}
    </PanelLayout>
  );
}

function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<DashboardData>("/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>دسترسی فقط‌خواندنی و مدیریتی</span>
          <h1>داشبورد نظارتی</h1>
        </div>
      </div>
      {error ? (
        <Notice type="warning">{error}</Notice>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="stats">
            <Stat
              icon={<FolderClock />}
              value={data.counts.totalApplications ?? 0}
              label="کل پرونده‌ها"
            />
            <Stat
              icon={<CheckCircle2 />}
              value={data.counts.completed ?? 0}
              label="خاتمه‌یافته"
            />
            <Stat
              icon={<MessageSquareWarning />}
              value={data.counts.highRisk ?? 0}
              label="پرریسک"
            />
          </div>
          <div className="kpi-grid">
            <article>
              <small>نرخ خاتمه پرونده</small>
              <strong>{data.kpis.completionRate}%</strong>
            </article>
            <article>
              <small>میانگین پاسخ پشتیبانی</small>
              <strong>{data.kpis.averageFirstResponseMinutes} دقیقه</strong>
            </article>
            <article>
              <small>رسیدگی به شکایات</small>
              <strong>{data.kpis.complaintResolutionRate}%</strong>
            </article>
            <article>
              <small>پرداخت موفق</small>
              <strong>{data.kpis.successfulPayments}</strong>
            </article>
            <article>
              <small>زمان بررسی اولیه</small>
              <strong>{data.kpis.averageInitialReviewHours} ساعت</strong>
            </article>
            <article>
              <small>کیفیت پشتیبانی</small>
              <strong>{data.kpis.supportQualityScore} از ۵</strong>
            </article>
            <article>
              <small>پایداری سرویس</small>
              <strong>{data.kpis.serviceAvailabilityRate}%</strong>
            </article>
            <article>
              <small>موفقیت API</small>
              <strong>{data.kpis.apiSuccessRate}%</strong>
            </article>
          </div>
          <section className="panel-card resource-board">
            <div className="card-header">
              <h2>منابع و سلامت سامانه</h2>
              <span>
                {data.resources.database === "connected"
                  ? "پایگاه داده متصل"
                  : "اختلال دیتابیس"}
              </span>
            </div>
            <div>
              <span>
                <small>RAM پردازش</small>
                <b>{data.resources.processMemoryMb} MB</b>
              </span>
              <span>
                <small>RAM آزاد میزبان</small>
                <b>{data.resources.freeMemoryMb} MB</b>
              </span>
              <span>
                <small>هسته CPU</small>
                <b>{data.resources.cpuCount}</b>
              </span>
              <span>
                <small>Load یک دقیقه</small>
                <b>{data.resources.loadAverage[0]}</b>
              </span>
              <span>
                <small>Uptime سرویس</small>
                <b>
                  {Math.floor(data.resources.processUptimeSeconds / 60)} دقیقه
                </b>
              </span>
              <span>
                <small>فضای آزاد دیسک</small>
                <b>{data.resources.diskFreeMb} MB</b>
              </span>
              <span>
                <small>صف تبادل</small>
                <b>{data.resources.pendingJobs} باز</b>
              </span>
              <span>
                <small>Dead letter</small>
                <b>{data.resources.deadLetterJobs}</b>
              </span>
              <span>
                <small>آخرین Backup</small>
                <b>{data.kpis.backupStatus}</b>
              </span>
            </div>
          </section>
          <section className="panel-card resource-board">
            <div className="card-header">
              <h2>کنترل SLA و پایداری ۳۰ روزه</h2>
              <span
                className={`status ${data.sla.targetMet ? "operational" : "outage"}`}
              >
                {data.sla.targetMet ? "هدف ۹۹٪ محقق شده" : "کمتر از هدف ۹۹٪"}
              </span>
            </div>
            <div>
              <span>
                <small>پایداری اندازه‌گیری‌شده</small>
                <b>{data.sla.availabilityPercent}%</b>
              </span>
              <span>
                <small>نمونه‌های پایش</small>
                <b>{data.sla.observations}</b>
              </span>
              <span>
                <small>نمونه اختلال / قطعی</small>
                <b>
                  {data.sla.degradedObservations} /{" "}
                  {data.sla.outageObservations}
                </b>
              </span>
              <span>
                <small>میانگین پاسخ</small>
                <b>{data.sla.averageResponseMs} ms</b>
              </span>
              <span>
                <small>رخداد باز</small>
                <b>{data.sla.openIncidents}</b>
              </span>
              <span>
                <small>آمادگی بازگشت</small>
                <b>{data.sla.fallbackReady ? "آماده" : "نیازمند اقدام"}</b>
              </span>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                const month = new Date().toISOString().slice(0, 7);
                downloadFile(
                  `/admin/reports/sla.csv?month=${month}`,
                  `sla-${month}.csv`,
                ).catch((downloadError) => setError(downloadError.message));
              }}
            >
              دریافت گزارش ماهانه SLA
            </button>
          </section>
          <div className="admin-grid">
            <section className="panel-card">
              <div className="card-header">
                <h2>توزیع وضعیت پرونده‌ها</h2>
              </div>
              <div className="bar-list">
                {data.byStatus.map((s) => (
                  <div key={s.status}>
                    <span>{statusLabels[s.status] ?? s.status}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, (s.count / Math.max(1, data.counts.totalApplications)) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>{s.count}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel-card integration">
              <div className="card-header">
                <h2>یکپارچه‌سازی‌ها</h2>
              </div>
              <div>
                <span>
                  <Landmark /> API سازمان ثبت
                </span>
                <b
                  className={
                    data.integrations.registryApi === "production"
                      ? "ok"
                      : "off"
                  }
                >
                  {data.integrations.registryApi}
                </b>
              </div>
              <div>
                <span>
                  <ReceiptText /> درگاه پرداخت
                </span>
                <b
                  className={
                    data.integrations.payment === "production" ? "ok" : "off"
                  }
                >
                  {data.integrations.payment}
                </b>
              </div>
              <Notice type="warning">
                Production تا دریافت مجوز، کلید رسمی و تأیید امنیتی غیرفعال
                می‌ماند.
              </Notice>
            </section>
            <section className="panel-card">
              <div className="card-header">
                <h2>کارایی API</h2>
              </div>
              <div className="metric-list">
                {data.api.length ? (
                  data.api.map((item) => (
                    <div key={item.serviceCode}>
                      <span>{item.serviceCode}</span>
                      <small>
                        کمینه {item.minimumDurationMs ?? 0} / میانگین{" "}
                        {item.averageDurationMs ?? 0} / بیشینه{" "}
                        {item.maximumDurationMs ?? 0} ms
                      </small>
                      <b>{item.errors} خطا</b>
                    </div>
                  ))
                ) : (
                  <small>هنوز تبادل API رسمی ثبت نشده است.</small>
                )}
              </div>
            </section>
            <section className="panel-card">
              <div className="card-header">
                <h2>رخدادها و اقدام اصلاحی</h2>
              </div>
              <div className="metric-list">
                {data.incidents.length ? (
                  data.incidents.map((item) => (
                    <div key={item.incidentCode}>
                      <span>{item.title}</span>
                      <small>{item.serviceCode}</small>
                      <b className={`status ${item.severity}`}>
                        {item.resolvedAt ? "رفع‌شده" : item.severity}
                      </b>
                    </div>
                  ))
                ) : (
                  <small>رخداد بازی ثبت نشده است.</small>
                )}
              </div>
            </section>
            <section className="panel-card">
              <div className="card-header">
                <h2>آخرین رویدادهای ثبت‌شده</h2>
              </div>
              <div className="audit-list">
                {data.auditEvents.map((e, i) => (
                  <div key={i}>
                    <ShieldCheck />
                    <span>
                      <strong>{e.action}</strong>
                      <small>
                        {e.entityType} - {formatDate(e.createdAt)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </PanelLayout>
  );
}

function ComplaintsPublic() {
  return (
    <PublicLayout>
      <PageHero
        title="شکایات و گزارش تخلف"
        body="برای حفظ محرمانگی و دریافت کد رهگیری، ثبت گزارش پس از ورود امن انجام می‌شود."
      />
      <section className="container narrow">
        <div className="tracking-card centered">
          <MessageSquareWarning />
          <h2>مسیر رسمی ثبت و رسیدگی</h2>
          <p>
            درخواست پرداخت خارج از سامانه، سوءاستفاده از نام کارگزاری، رفتار
            کارکنان و نقض حریم خصوصی را ثبت کنید.
          </p>
          <Link className="button primary" to="/panel/complaints">
            ورود و ثبت گزارش
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route
          path="/services/legal"
          element={<ServicesPage category="legal" />}
        />
        <Route
          path="/services/technical"
          element={<ServicesPage category="technical" />}
        />
        <Route path="/services/:code" element={<ServiceDetailPage />} />
        <Route path="/tracking" element={<TrackingPage />} />
        <Route
          path="/documents-guide"
          element={<StaticPage page="/documents-guide" />}
        />
        <Route path="/tariffs" element={<StaticPage page="/tariffs" />} />
        <Route path="/privacy" element={<StaticPage page="/privacy" />} />
        <Route path="/terms" element={<StaticPage page="/terms" />} />
        <Route path="/support" element={<StaticPage page="/support" />} />
        <Route path="/about" element={<StaticPage page="/about" />} />
        <Route
          path="/regulations"
          element={<StaticPage page="/regulations" />}
        />
        <Route
          path="/applicant-rights"
          element={<StaticPage page="/applicant-rights" />}
        />
        <Route path="/security" element={<StaticPage page="/security" />} />
        <Route path="/contact" element={<StaticPage page="/contact" />} />
        <Route path="/complaints" element={<ComplaintsPublic />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          path="/panel"
          element={
            <Protected capability="panel.view">
              <PanelHome />
            </Protected>
          }
        />
        <Route
          path="/panel/applications"
          element={
            <Protected capability="applications.read">
              <ApplicationsPage />
            </Protected>
          }
        />
        <Route
          path="/panel/applications/:id"
          element={
            <Protected capability="applications.read">
              <ApplicationDetail />
            </Protected>
          }
        />
        <Route
          path="/panel/new"
          element={
            <Protected capability="applications.create">
              <NewApplication />
            </Protected>
          }
        />
        <Route
          path="/panel/complaints"
          element={
            <Protected capability="complaints">
              <ComplaintsPage />
            </Protected>
          }
        />
        <Route
          path="/panel/workspace"
          element={
            <Protected capability="workspace">
              <StaffWorkspace />
            </Protected>
          }
        />
        <Route
          path="/panel/internal-controls"
          element={
            <Protected capability="internal_controls">
              <InternalControls />
            </Protected>
          }
        />
        <Route
          path="/panel/support"
          element={
            <Protected capability="support">
              <UserSupport />
            </Protected>
          }
        />
        <Route
          path="/panel/profile"
          element={
            <Protected capability="profile">
              <ProfilePage />
            </Protected>
          }
        />
        <Route
          path="/panel/admin"
          element={
            <Protected capability="dashboard">
              <AdminDashboard />
            </Protected>
          }
        />
        <Route
          path="/panel/manage"
          element={
            <Protected capability="management">
              <AdminManagement />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <PublicLayout>
              <PageHero
                title="صفحه پیدا نشد"
                body="نشانی واردشده معتبر نیست."
              />
            </PublicLayout>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

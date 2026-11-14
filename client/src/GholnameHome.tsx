import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Eye,
  Home,
  Info,
  Layers,
  ListChecks,
  Map as MapIcon,
  ShieldCheck,
  Smartphone,
  Trees,
} from "lucide-react";
import { Link } from "./router";
import "./gholname-home.css";

/* ---------- داده‌ها ---------- */
const HERO_PHOTO = "/hero.jpg";
const HERO_TITLE =
  "برای بررسی مسیر سنددار شدن ملک قولنامه‌ای خود، از اینجا شروع کنید.";

const steps = [
  { icon: Smartphone, title: "ثبت حساب", text: "با شماره موبایل وارد پنل نمایشی شوید." },
  { icon: Home, title: "معرفی ملک", text: "نوع ملک، مساحت و موقعیت را وارد کنید." },
  { icon: FileText, title: "تکمیل اطلاعات و مدارک", text: "نوع مدرک را مشخص و فایل آزمایشی را انتخاب کنید." },
  { icon: ClipboardList, title: "مشاهده وضعیت", text: "کد پیگیری بگیرید و روند را در پنل ببینید." },
];
const properties = [
  { icon: Building2, title: "خانه و آپارتمان", text: "واحد مسکونی یا خانه ویلایی با مدرک عادی." },
  { icon: MapIcon, title: "زمین", text: "زمین مسکونی، تجاری یا کشاورزی با قولنامه." },
  { icon: Trees, title: "باغ و ویلا", text: "باغ، باغچه یا ویلا که سند رسمی ندارد." },
  { icon: Layers, title: "سایر املاک", text: "مغازه یا هر ملک دیگری با مدرک عادی." },
];
const docs = [
  "قولنامه یا مبایعه‌نامه عادی",
  "صلح‌نامه",
  "گواهی انحصار وراثت (در صورت وراثت)",
  "رأی دادگاه (در صورت وجود)",
  "مدارک تکمیلی مرتبط با ملک، مانند نقشه یا تصویر نشانی",
];
const why = [
  { icon: ListChecks, title: "ثبت مرحله‌ای اطلاعات", text: "فرم پنج‌مرحله‌ای با راهنمای هر بخش و ذخیره خودکار پیش‌نویس." },
  { icon: Eye, title: "پیگیری یکجا", text: "همه درخواست‌ها و کدهای پیگیری در یک پنل ساده." },
  { icon: Info, title: "توضیح شفاف وضعیت", text: "هر وضعیت با متن روشن توضیح داده می‌شود، بدون ادعای غیرواقعی." },
  { icon: Smartphone, title: "دسترسی از موبایل", text: "طراحی اول-موبایل برای کسانی که بیشتر با گوشی وارد می‌شوند." },
];
const faqs = [
  { q: "قولنامه چه تفاوتی با سند رسمی دارد؟", a: "قولنامه یا مبایعه‌نامه عادی، مدرکی است که میان طرفین معامله تنظیم شده و در دفاتر ثبت رسمی صادر نشده است. سند رسمی توسط مراجع قانونی ثبت می‌شود. اینکه مدرک شما در عمل چه جایگاهی دارد به وضعیت پرونده بستگی دارد و باید از مراجع مربوط استعلام شود." },
  { q: "آیا «قولنامه» یک سامانه رسمی دولتی است؟", a: "خیر. این وب‌سایت یک پلتفرم مستقل برای معرفی خدمات و دریافت درخواست است و سامانه رسمی سازمان ثبت اسناد نیست. در نسخه نمایشی فعلی، هیچ درخواستی به مراجع دولتی ارسال نمی‌شود." },
  { q: "ثبت درخواست آزمایشی چه معنایی دارد؟", a: "درخواست آزمایشی فقط داخل مرورگر شما ذخیره می‌شود تا مسیر استفاده از پلتفرم را تجربه کنید. این ثبت هیچ اثر حقوقی ندارد و به معنی ثبت ادعا، تأیید مالکیت یا صدور سند نیست." },
  { q: "چه مدارکی ممکن است لازم باشد؟", a: "نمونه مدارک شامل قولنامه یا مبایعه‌نامه، صلح‌نامه، گواهی انحصار وراثت و رأی دادگاه (در صورت وجود) است. فهرست قطعی مدارک بسته به پرونده متفاوت است و باید پیش از انتشار واقعی، توسط کارشناس حقوقی تأیید شود." },
];

/* ---------- افکت تایپ ---------- */
function TypewriterText({ text }: { text: string }) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setN(i);
      if (i < text.length) timer = setTimeout(tick, 60);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [text, reduce]);
  return (
    <span className="gh-type">
      <span className="gh-type-ghost" aria-hidden="true">{text}</span>
      <span className="gh-type-live" aria-hidden="true">
        {text.slice(0, n)}
        <span className="gh-caret" />
      </span>
    </span>
  );
}

/* ---------- تصویر بالای صفحه ---------- */
function HeroArt() {
  return (
    <svg viewBox="0 0 440 340" role="img" aria-label="تصویرسازی خانه و پرونده مدارک" className="gh-art">
      <ellipse cx="220" cy="300" rx="190" ry="22" fill="#DCE6F0" />
      <rect x="70" y="140" width="190" height="150" rx="8" fill="#fff" stroke="#15314B" strokeWidth="4" />
      <path d="M52 148 165 52l113 96z" fill="#15314B" />
      <rect x="140" y="212" width="50" height="78" rx="6" fill="#0D9488" />
      <circle cx="180" cy="253" r="3.5" fill="#fff" />
      <rect x="92" y="172" width="34" height="34" rx="4" fill="#CCFBF1" stroke="#15314B" strokeWidth="3" />
      <rect x="204" y="172" width="34" height="34" rx="4" fill="#CCFBF1" stroke="#15314B" strokeWidth="3" />
      <rect x="262" y="104" width="140" height="180" rx="12" fill="#fff" stroke="#15314B" strokeWidth="4" transform="rotate(5 332 194)" />
      <g transform="rotate(5 332 194)" stroke="#B9CCE0" strokeWidth="6" strokeLinecap="round">
        <path d="M284 138h70M284 162h96M284 186h96M284 210h58" />
      </g>
      <circle cx="372" cy="262" r="26" fill="#0D9488" />
      <path d="m360 262 9 9 17-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroVisual() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="gh-visual">
      <span className="gh-circle-a" aria-hidden="true" />
      <span className="gh-circle-b" aria-hidden="true" />
      <div className="gh-photo">
        {failed ? (
          <div className="gh-photo-fallback"><HeroArt /></div>
        ) : (
          <img src={HERO_PHOTO} alt="نمای یک خانه و فضای سبز" onError={() => setFailed(true)} />
        )}
      </div>
      <div className="gh-status">
        <span className="gh-status-ico"><ClipboardCheck size={20} aria-hidden="true" /></span>
        <div className="gh-status-text">
          <small>وضعیت درخواست</small>
          <b>در انتظار بررسی</b>
        </div>
        <span className="gh-status-dot" aria-hidden="true" />
      </div>
    </div>
  );
}

/* ---------- پرسش‌های متداول ---------- */
function FAQList() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="gh-faq">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div className="gh-card gh-faq-item" key={f.q}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`gh-faq-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{f.q}</span>
                <ChevronDown className={isOpen ? "gh-chev open" : "gh-chev"} size={20} aria-hidden="true" />
              </button>
            </h3>
            <div id={`gh-faq-${i}`} role="region" hidden={!isOpen} className="gh-faq-body">
              {f.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- صفحه اصلی ---------- */
export function GholnameHome() {
  const scrollToHow = () =>
    document.getElementById("gh-how")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const fa = (n: number) => n.toLocaleString("fa-IR");
  return (
    <div className="gh-home">
      <section className="gh-hero">
        <div className="gh-wrap gh-hero-grid">
          <div>
            <span className="gh-badge">سامانه مستقل ساماندهی مدارک املاک قولنامه‌ای</span>
            <h1 className="gh-h1" aria-label={HERO_TITLE}>
              <TypewriterText text={HERO_TITLE} />
            </h1>
            <p className="gh-lead">
              اطلاعات اولیه خانه یا زمین خود را ثبت کنید، مدارک مورد نیاز را بشناسید و روند بررسی
              درخواست را در یک پنل ساده دنبال کنید.
            </p>
            <div className="gh-actions">
              <Link to="/panel/new" className="gh-btn gh-btn-primary gh-shine">شروع ثبت درخواست</Link>
              <Link to="/tracking" className="gh-btn gh-btn-secondary">پیگیری درخواست</Link>
            </div>
            <p className="gh-note">
              <ShieldCheck size={20} aria-hidden="true" />
              <span>این سرویس مستقل است و سامانه رسمی دولتی نیست؛ هیچ تضمینی برای صدور سند ارائه نمی‌شود.</span>
            </p>
          </div>
          <HeroVisual />
        </div>
        <div className="gh-scroll-row">
          <button type="button" className="gh-scroll" aria-label="رفتن به بخش بعدی" onClick={scrollToHow}>
            <ChevronDown size={24} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section id="gh-how" className="gh-section">
        <div className="gh-wrap">
          <h2 className="gh-title">چگونه کار می‌کند؟</h2>
          <p className="gh-sub">در چهار قدم ساده، از ثبت حساب تا دیدن وضعیت درخواست.</p>
          <ol className="gh-grid">
            {steps.map((s, i) => (
              <li className="gh-card gh-step" key={s.title}>
                <div className="gh-step-head">
                  <span className="gh-ico gh-ico-navy"><s.icon size={20} aria-hidden="true" /></span>
                  <span className="gh-step-n">مرحله {fa(i + 1)}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="gh-section gh-section-white">
        <div className="gh-wrap">
          <h2 className="gh-title">چه املاکی؟</h2>
          <p className="gh-sub">برای املاکی که فقط مدرک عادی یا قولنامه دارند. این سایت سامانه آگهی خریدوفروش ملک نیست.</p>
          <div className="gh-grid">
            {properties.map((p) => (
              <Link to="/services" className="gh-card gh-prop" key={p.title}>
                <span className="gh-ico"><p.icon size={24} aria-hidden="true" /></span>
                <strong>{p.title}</strong>
                <span className="gh-prop-text">{p.text}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="gh-section">
        <div className="gh-wrap gh-split">
          <div>
            <h2 className="gh-title">چه مدارکی ممکن است نیاز باشد؟</h2>
            <p className="gh-sub gh-sub-sm">
              فهرست زیر فقط نمونه است. مدارک نهایی بسته به وضعیت هر پرونده متفاوت است و پیش از انتشار
              واقعی باید توسط کارشناس حقوقی تأیید شود.
            </p>
          </div>
          <ul className="gh-card gh-doclist">
            {docs.map((d) => (
              <li key={d}><FileText size={20} aria-hidden="true" />{d}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="gh-section gh-section-white">
        <div className="gh-wrap">
          <h2 className="gh-title">چرا قولنامه؟</h2>
          <div className="gh-grid">
            {why.map((w) => (
              <div className="gh-why" key={w.title}>
                <w.icon size={28} aria-hidden="true" />
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gh-section">
        <div className="gh-narrow">
          <h2 className="gh-title gh-title-mb">سوالات متداول</h2>
          <FAQList />
          <Link to="/support" className="gh-more">
            مشاهده پشتیبانی و پرسش‌های بیشتر <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="gh-cta-section">
        <div className="gh-wrap">
          <div className="gh-cta">
            <h2>آماده‌اید مسیر را امتحان کنید؟</h2>
            <p>با چند مرحله ساده یک درخواست ثبت کنید و کد پیگیری بگیرید.</p>
            <div className="gh-cta-actions">
              <Link to="/panel/new" className="gh-btn gh-btn-primary">شروع ثبت درخواست</Link>
              <Link to="/tracking" className="gh-btn gh-btn-ghost-light">پیگیری درخواست</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

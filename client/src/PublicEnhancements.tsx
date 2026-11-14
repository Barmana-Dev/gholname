import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  FileClock,
  Landmark,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { request, formatDate } from "./api";

interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  publishedAt: string;
}
interface SystemStatus {
  status: "operational" | "degraded" | "outage";
  checkedAt: string;
}

export const extraStaticPages: Record<
  string,
  { title: string; body: string; sections: { h: string; p: string }[] }
> = {
  "/about": {
    title: "درباره کارگزاری",
    body: "ساختار تخصصی برای ارائه خدمات فنی، مهندسی و حقوقی ثبتی در حدود مجوز و تحت نظارت مرجع قانونی.",
    sections: [
      {
        h: "شخص حقوقی و ساختار پاسخ‌گویی",
        p: "اطلاعات ثبتی، شناسه ملی، شماره ثبت، نشانی شعبه و مدیران پس از صدور مجوز در این بخش به‌صورت رسمی منتشر می‌شود.",
      },
      {
        h: "مسئول فنی و تیم تخصصی",
        p: "مدیریت فنی، کارشناسان ثبتی و حقوقی، نقشه‌برداران، پشتیبانی، مالی و تطبیق با تفکیک مسئولیت فعالیت می‌کنند.",
      },
      {
        h: "حدود فعالیت",
        p: "کارگزاری فقط پذیرش، کنترل اولیه، تکمیل مدارک، پیگیری و تشریفات مجاز را انجام می‌دهد و مرجع صدور رأی یا تشخیص مالکیت نیست.",
      },
      {
        h: "منع تضمین و نفوذ",
        p: "کارگزاری نتیجه پرونده یا تسریع خارج از ضابطه را تضمین نمی‌کند و هیچ ادعایی درباره نفوذ در مرجع ثبتی معتبر نیست.",
      },
      {
        h: "پاسخ‌گویی و جبران خسارت",
        p: "حفاظت از اطلاعات، محرمانگی، پاسخ‌گویی به مرجع ناظر و رسیدگی مستند به ادعای خسارت از تعهدات کارگزاری است.",
      },
    ],
  },
  "/regulations": {
    title: "قوانین و مقررات",
    body: "چارچوب فعالیت کارگزاری بر قوانین، دستورالعمل‌ها و اسناد الزامات ابلاغی استوار است.",
    sections: [
      {
        h: "برنامه هفتم پیشرفت",
        p: "فعالیت در چارچوب بند پ ماده ۱۱۴ قانون برنامه هفتم پیشرفت جمهوری اسلامی ایران انجام می‌شود.",
      },
      {
        h: "حدنگاری و ثبت رسمی",
        p: "فرایندها با قانون جامع حدنگار و قانون الزام به ثبت رسمی معاملات اموال غیرمنقول تطبیق داده می‌شوند.",
      },
      {
        h: "نسخه الزامات خدمات",
        p: "نسخه سند الزامات و گردش‌کار هر خدمت ثبت می‌شود و فعال‌سازی خدمت بدون نسخه معتبر مجاز نیست.",
      },
    ],
  },
  "/applicant-rights": {
    title: "منشور حقوق متقاضیان",
    body: "شفافیت هزینه، محرمانگی، دسترسی به سوابق و پاسخ‌گویی مستند از حقوق پایه هر متقاضی است.",
    sections: [
      {
        h: "شفافیت و حق آگاهی",
        p: "خدمت، مدارک، تعرفه، وضعیت و اقدام بعدی باید پیش از تصمیم کاربر به زبان روشن نمایش داده شود.",
      },
      {
        h: "حریم خصوصی و امنیت",
        p: "اطلاعات فقط برای خدمت انتخاب‌شده پردازش و مشاهده هر سند حساس در گزارش غیرقابل حذف ثبت می‌شود.",
      },
      {
        h: "اعتراض و شکایت",
        p: "متقاضی می‌تواند شکایت یا گزارش تخلف ثبت کند، کد رهگیری بگیرد و پاسخ رسمی را در سامانه مشاهده کند.",
      },
    ],
  },
  "/security": {
    title: "امنیت اطلاعات و مقابله با سوءاستفاده",
    body: "کنترل دسترسی، ثبت رویداد، نسخه‌بندی مدارک و هشدارهای ضدکلاهبرداری در هسته سامانه قرار دارند.",
    sections: [
      {
        h: "پرداخت رسمی",
        p: "هیچ کارمند یا کارشناس مجاز به دریافت وجه در حساب شخصی، کارت بانکی یا خارج از درگاه رسمی نیست.",
      },
      {
        h: "مدارک و سوابق",
        p: "فایل‌ها با اثرانگشت SHA-256، شماره نسخه، زمان بارگذاری و هویت بارگذارنده ثبت می‌شوند.",
      },
      {
        h: "گزارش رخداد",
        p: "فعالیت مشکوک، جعل، افشای اطلاعات یا سوءاستفاده از نام کارگزاری باید از مسیر شکایات گزارش شود.",
      },
    ],
  },
  "/contact": {
    title: "تماس با ما",
    body: "پاسخ‌گویی حضوری اختیاری، تلفنی و آنلاین در چارچوب ساعت کاری و SLA پشتیبانی انجام می‌شود.",
    sections: [
      {
        h: "مرکز تماس",
        p: "شماره رسمی مرکز تماس پس از تجهیز شعبه در این صفحه و رسیدهای سامانه درج می‌شود.",
      },
      {
        h: "شعبه کارگزاری",
        p: "نشانی رسمی، ساعات مراجعه اختیاری و مسیر دسترسی پس از اخذ مجوز فعالیت منتشر خواهد شد.",
      },
      {
        h: "پشتیبانی آنلاین",
        p: "برای حفظ سوابق و محرمانگی، پرسش‌های پرونده از طریق تیکت و پیام داخلی پنل ارسال شوند.",
      },
    ],
  },
};

export function EnhancedHomeSections() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  useEffect(() => {
    request<Announcement[]>("/public/announcements")
      .then(setAnnouncements)
      .catch(() => undefined);
    request<SystemStatus>("/public/system-status")
      .then(setSystem)
      .catch(() => undefined);
  }, []);
  const audiences = [
    ["مالکان و وراث", "کاهش رفت‌وآمد و کنترل روشن مدارک", UsersRound],
    ["سازندگان و شرکت‌ها", "پیگیری ساختارمند پرونده‌های ملکی", Building2],
    [
      "متخصصان و نقشه‌برداران",
      "گردش‌کار فنی، نسخه نقشه و گزارش مستند",
      Landmark,
    ],
  ] as const;
  return (
    <>
      <section className="audience-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">برای چه کسانی؟</span>
              <h2>یک مسیر تخصصی برای هر متقاضی</h2>
            </div>
          </div>
          <div className="audience-grid">
            {audiences.map(([title, body, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{body}</p>
                <span>
                  <CheckCircle2 /> دسترسی غیرحضوری و امن
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="compliance-section">
        <div className="container compliance-grid">
          <div>
            <span className="eyebrow">اعتماد مبتنی بر کنترل</span>
            <h2>هر اقدام مهم، قابل ردگیری و بازرسی</h2>
            <p>
              پرونده، مدارک، پیام‌ها، پرداخت‌ها و تصمیم‌های کارشناسی بدون ثبت
              هویت اقدام‌کننده و زمان تغییر نمی‌کنند.
            </p>
            <div className="compliance-points">
              <span>
                <ShieldCheck /> دسترسی مبتنی بر نقش
              </span>
              <span>
                <FileClock /> تاریخچه تغییر وضعیت
              </span>
              <span>
                <Scale /> کنترل تعارض منافع
              </span>
              <span>
                <ShieldAlert /> گزارش تخلف و رخداد
              </span>
            </div>
          </div>
          <div className="status-board">
            <div className="status-board-head">
              <div>
                <small>وضعیت لحظه‌ای سامانه</small>
                <strong>
                  {system?.status === "operational"
                    ? "همه سرویس‌ها عملیاتی هستند"
                    : system?.status === "degraded"
                      ? "برخی سرویس‌ها با اختلال روبه‌رو هستند"
                      : system?.status === "outage"
                        ? "اختلال جدی ثبت شده است"
                        : "در حال دریافت وضعیت"}
                </strong>
              </div>
              <i className={system?.status ?? "loading"} />
            </div>
            <ul>
              <li>
                <span>درگاه ثبت درخواست</span>
                <b>آماده</b>
              </li>
              <li>
                <span>مدیریت پرونده</span>
                <b>آماده</b>
              </li>
              <li>
                <span>API سازمان ثبت</span>
                <b className="disabled">در انتظار دسترسی رسمی</b>
              </li>
              <li>
                <span>درگاه پرداخت حقوقی</span>
                <b className="disabled">در انتظار فعال‌سازی</b>
              </li>
            </ul>
            {system && (
              <small>آخرین بررسی: {formatDate(system.checkedAt)}</small>
            )}
          </div>
        </div>
      </section>
      <section className="announcements-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">اطلاعیه‌های رسمی</span>
              <h2>آخرین تغییرات و اعلان‌ها</h2>
            </div>
          </div>
          <div className="announcement-grid">
            {announcements.length ? (
              announcements.slice(0, 3).map((item) => (
                <article key={item.id}>
                  <span>
                    {item.category === "regulation"
                      ? "مقررات"
                      : item.category === "security"
                        ? "امنیت"
                        : "اطلاعیه"}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <small>{formatDate(item.publishedAt)}</small>
                </article>
              ))
            ) : (
              <article className="announcement-empty">
                <FileClock />
                <h3>اطلاعیه جدیدی منتشر نشده است</h3>
                <p>تغییرات رسمی خدمات و مقررات از همین بخش اعلام می‌شوند.</p>
              </article>
            )}
          </div>
        </div>
      </section>
      <section className="faq-section">
        <div className="container faq-grid">
          <div>
            <span className="eyebrow">پرسش‌های متداول</span>
            <h2>پیش از ثبت درخواست بدانید</h2>
            <p>پاسخ کوتاه به مهم‌ترین پرسش‌های مسیر ثبت و پیگیری پرونده.</p>
          </div>
          <div>
            {[
              [
                "آیا حضور در شعبه الزامی است؟",
                "خیر. اصل بر ارائه غیرحضوری است و مراجعه حضوری فقط در موارد ضروری و اعلام‌شده انجام می‌شود.",
              ],
              [
                "آیا کارگزاری صدور سند را تضمین می‌کند؟",
                "خیر. تصمیم نهایی ثبتی در صلاحیت سازمان ثبت و مراجع قانونی است.",
              ],
              [
                "نقص مدارک چگونه اعلام می‌شود؟",
                "شرح نقص به‌صورت مستند در پرونده و اعلان پنل ثبت می‌شود و امکان ارسال نسخه اصلاحی وجود دارد.",
              ],
              [
                "پرداخت معتبر از چه مسیری است؟",
                "فقط درگاه رسمی متصل به حساب حقوقی کارگزاری؛ پرداخت به اشخاص یا شماره کارت معتبر نیست.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

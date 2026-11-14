import { useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  Headphones,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { request, formatDate } from "./api";
import { Notice, PanelLayout } from "./App";

interface Ticket {
  id: number;
  tracking_code: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  updated_at: string;
}
interface Notification {
  id: number;
  title: string;
  body: string;
  deliveryStatus: string;
  readAt: string | null;
  createdAt: string;
}
interface TicketMessage {
  id: number;
  body: string;
  senderName: string;
  createdAt: string;
}
interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export function UserSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(
    null,
  );
  const [message, setMessage] = useState("");
  async function load() {
    const [t, n] = await Promise.all([
      request<Ticket[]>("/operations/tickets"),
      request<Notification[]>("/operations/notifications"),
    ]);
    setTickets(t);
    setNotifications(n);
  }
  async function openTicket(id: number) {
    try {
      setSelectedTicket(
        await request<TicketDetail>(`/operations/tickets/${id}`),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "نمایش تیکت ناموفق بود.",
      );
    }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    try {
      await request(`/operations/tickets/${selectedTicket.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body, status: "open", internal: false }),
      });
      form.reset();
      await Promise.all([load(), openTicket(selectedTicket.id)]);
      setMessage("پاسخ شما با ثبت سابقه ارسال شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ارسال پاسخ ناموفق بود.",
      );
    }
  }
  async function markRead(id: number) {
    await request(`/operations/notifications/${id}/read`, {
      method: "PATCH",
      body: "{}",
    });
    await load();
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    try {
      const result = await request<{ trackingCode: string }>(
        "/operations/tickets",
        { method: "POST", body: JSON.stringify(f) },
      );
      setMessage(`تیکت با کد ${result.trackingCode} ثبت شد.`);
      form.reset();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت تیکت ناموفق بود.",
      );
    }
  }
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>مرکز تماس و پاسخ‌گویی آنلاین</span>
          <h1>پشتیبانی و اعلان‌ها</h1>
        </div>
      </div>
      {message && (
        <Notice type={message.includes("ثبت شد") ? "success" : "warning"}>
          {message}
        </Notice>
      )}
      <section
        className="panel-card support-principles"
        aria-labelledby="support-principles-title"
      >
        <div className="card-header">
          <h2 id="support-principles-title">
            <ShieldCheck /> اصول ارتباط امن
          </h2>
        </div>
        <p>
          پاسخ‌ها مستند و قابل رهگیری هستند. وعده نتیجه خارج از اختیار کارگزاری
          داده نمی‌شود.
        </p>
        <ul>
          <li>
            اطلاعات حساس را فقط در پیام و تیکت داخل سامانه ثبت کنید؛ ارسال در
            ایمیل، پیامک یا پیام‌رسان غیررسمی ممنوع است.
          </li>
          <li>
            هزینه فقط مطابق تعرفه پرونده و از درگاه رسمی متصل به حساب حقوقی
            کارگزاری دریافت می‌شود.
          </li>
          <li>
            موارد تخصصی به کارشناس مجاز و شکایت‌ها به مسیر مستقل رسیدگی ارجاع
            می‌شوند.
          </li>
        </ul>
      </section>
      <div className="support-grid">
        <form className="panel-card" onSubmit={submit}>
          <div className="card-header">
            <h2>
              <Headphones /> تیکت جدید
            </h2>
          </div>
          <label className="field">
            <span>موضوع*</span>
            <input name="subject" required minLength={5} />
          </label>
          <div className="compact-grid">
            <label className="field">
              <span>دسته‌بندی</span>
              <select name="category">
                <option value="guidance">راهنمایی</option>
                <option value="technical">مشکل فنی</option>
                <option value="documents">مدارک</option>
                <option value="payment">پرداخت</option>
                <option value="status">وضعیت پرونده</option>
                <option value="other">سایر</option>
              </select>
            </label>
            <label className="field">
              <span>اولویت</span>
              <select name="priority">
                <option value="normal">عادی</option>
                <option value="high">زیاد</option>
                <option value="urgent">فوری</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>شرح درخواست*</span>
            <textarea name="body" required minLength={10} />
          </label>
          <button className="button primary">
            <Send /> ثبت تیکت
          </button>
        </form>
        <section className="panel-card">
          <div className="card-header">
            <h2>
              <MessageSquareText /> تیکت‌های من
            </h2>
          </div>
          {tickets.length ? (
            <div className="ticket-list">
              {tickets.map((t) => (
                <button
                  type="button"
                  className="ticket-row"
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                >
                  <span>
                    <strong>{t.subject}</strong>
                    <small dir="ltr">{t.tracking_code}</small>
                  </span>
                  <i className="status">{t.status}</i>
                  <small>{formatDate(t.updated_at)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <Headphones />
              <h3>تیکتی ندارید</h3>
              <p>پرسش جدید را از فرم روبه‌رو ثبت کنید.</p>
            </div>
          )}
        </section>
        {selectedTicket && (
          <section className="panel-card ticket-conversation">
            <div className="card-header">
              <h2>
                <MessageSquareText /> گفت‌وگوی {selectedTicket.tracking_code}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="بستن گفت‌وگو"
                onClick={() => setSelectedTicket(null)}
              >
                ×
              </button>
            </div>
            <div className="ticket-messages" aria-live="polite">
              {selectedTicket.messages.map((item) => (
                <article key={item.id}>
                  <strong>{item.senderName}</strong>
                  <p>{item.body}</p>
                  <small>{formatDate(item.createdAt)}</small>
                </article>
              ))}
            </div>
            {selectedTicket.status !== "closed" && (
              <form onSubmit={reply}>
                <label className="field">
                  <span>پاسخ امن داخل سامانه</span>
                  <textarea
                    name="body"
                    required
                    minLength={2}
                    maxLength={5000}
                  />
                </label>
                <button className="button secondary">
                  <Send /> ارسال پاسخ
                </button>
              </form>
            )}
          </section>
        )}
        <section className="panel-card notifications-card">
          <div className="card-header">
            <h2>
              <Bell /> اعلان‌های سامانه
            </h2>
          </div>
          {notifications.length ? (
            notifications.map((n) => (
              <article className={n.readAt ? "" : "unread"} key={n.id}>
                <Bell />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{formatDate(n.createdAt)}</small>
                </div>
                {!n.readAt && (
                  <button
                    type="button"
                    className="button subtle small"
                    onClick={() =>
                      markRead(n.id).catch((error) => setMessage(error.message))
                    }
                  >
                    خواندم
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="empty-inline">
              <Bell />
              <h3>اعلان جدیدی ندارید</h3>
            </div>
          )}
        </section>
      </div>
    </PanelLayout>
  );
}

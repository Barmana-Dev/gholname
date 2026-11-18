import { fa } from "./labels";
import { useEffect, useState, type FormEvent } from "react";
import {
  ClipboardCheck,
  FileWarning,
  MessageSquareText,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { request, requestAll } from "./api";
import type { ApplicationItem } from "./types";
import { Link } from "./router";
import { Notice, PanelLayout, statusLabels, useAuth } from "./App";
import { managedStatusOptions, reviewStatusOptions } from "./page-02-policy";

interface Expert {
  id: number;
  fullName: string;
  role: string;
  roleTitle: string;
}
interface Ticket {
  id: number;
  tracking_code: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  applicantName: string;
}
interface RefundRequest {
  id: number;
  fileNumber: string;
  requestedBy: string;
  amountRials: number;
  reason: string;
  status: string;
}
interface PendingReview {
  reportId: number;
  fileNumber: string;
  reportType: string;
  result: string;
  body: string;
  expertName: string;
}

const staffRoles = [
  "registry_expert",
  "surveyor",
  "support",
  "finance",
  "operations_manager",
  "compliance",
  "technical",
  "admin",
  "observer",
];
const reportTypeOptions: Record<string, string[][]> = {
  registry_expert: [
    ["initial_review", "بررسی اولیه"],
    ["registry_legal", "ثبتی و حقوقی"],
  ],
  surveyor: [["survey", "فنی و نقشه‌برداری"]],
  compliance: [
    ["compliance", "تطبیق"],
    ["risk", "ریسک"],
  ],
};
const allReportTypeOptions = [
  ["initial_review", "بررسی اولیه"],
  ["registry_legal", "ثبتی و حقوقی"],
  ["survey", "فنی و نقشه‌برداری"],
  ["compliance", "تطبیق"],
  ["risk", "ریسک"],
];
export function StaffWorkspace() {
  const { user } = useAuth();
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [selected, setSelected] = useState<ApplicationItem | null>(null);
  const [message, setMessage] = useState("");
  const canManage = ["operations_manager", "admin"].includes(user?.role ?? "");
  const canReview = [
    "registry_expert",
    "surveyor",
    "operations_manager",
    "compliance",
    "admin",
  ].includes(user?.role ?? "");
  async function load() {
    const [a, t] = await Promise.all([
      requestAll<ApplicationItem>("/applications"),
      requestAll<Ticket>("/operations/tickets"),
    ]);
    setApps(a);
    setTickets(t);
    if (
      ["support", "operations_manager", "compliance", "admin"].includes(
        user?.role ?? "",
      )
    )
      setExperts(await request<Expert[]>("/operations/experts"));
    if (
      ["finance", "operations_manager", "compliance", "admin"].includes(
        user?.role ?? "",
      )
    )
      setRefunds(await requestAll<RefundRequest>("/operations/refund-requests"));
    if (
      ["compliance", "operations_manager", "admin", "observer"].includes(
        user?.role ?? "",
      )
    )
      setPendingReviews(
        await requestAll<PendingReview>("/operations/review-approvals/pending"),
      );
  }
  useEffect(() => {
    if (user && staffRoles.includes(user.role))
      load().catch((e) => setMessage(e.message));
  }, [user?.role]);
  if (!user || !staffRoles.includes(user.role))
    return (
      <PanelLayout>
        <Notice type="warning">
          این میزکار فقط برای نقش‌های عملیاتی مجاز است.
        </Notice>
      </PanelLayout>
    );
  async function changeStatus(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await request(`/applications/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(f),
      });
      setMessage("وضعیت پرونده ثبت شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت وضعیت ناموفق بود.",
      );
    }
  }
  async function enqueueRegistryExchange() {
    if (!selected) return;
    try {
      await request("/integrations/registry/jobs", {
        method: "POST",
        body: JSON.stringify({
          applicationId: selected.id,
          idempotencyKey: `ui-${selected.id}-${selected.updatedAt}`,
        }),
      });
      setMessage("پرونده با داده‌های حداقلی مجاز در صف امن سازمان ثبت شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ارسال به صف سازمان ناموفق بود.",
      );
    }
  }
  async function report(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await request(`/operations/applications/${selected.id}/reports`, {
        method: "POST",
        body: JSON.stringify({ ...f, sign: true }),
      });
      setMessage("گزارش کارشناسی امضا و ثبت شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت گزارش ناموفق بود.",
      );
    }
  }
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    try {
      await request(`/operations/applications/${selected.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          expertId: Number(f.get("expertId")),
          assignmentType: f.get("assignmentType"),
          note: f.get("note"),
        }),
      });
      setMessage("ارجاع پرونده ثبت شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ارجاع ناموفق بود.");
    }
  }
  async function risk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    try {
      await request(`/operations/applications/${selected.id}/risk-reviews`, {
        method: "POST",
        body: JSON.stringify({
          level: f.get("level"),
          note: f.get("note"),
          conflictOfInterest: f.has("conflictOfInterest"),
          suspiciousDocument: f.has("suspiciousDocument"),
          identityMismatch: f.has("identityMismatch"),
          offPlatformPayment: f.has("offPlatformPayment"),
        }),
      });
      setMessage("ارزیابی ریسک ثبت شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت ریسک ناموفق بود.",
      );
    }
  }
  async function requestTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // currentTarget is null after the first await: keep the form element.
    const formElement = e.currentTarget;
    if (!selected) return;
    const values = new FormData(e.currentTarget);
    try {
      await request(
        `/operations/applications/${selected.id}/transfer-requests`,
        {
          method: "POST",
          body: JSON.stringify({ reason: values.get("reason") }),
        },
      );
      setMessage("درخواست انتقال برای تأیید مدیر عملیات ثبت شد.");
      formElement.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت انتقال ناموفق بود.",
      );
    }
  }
  async function recordInteraction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // currentTarget is null after the first await: keep the form element.
    const formElement = e.currentTarget;
    const values = new FormData(e.currentTarget);
    try {
      await request("/operations/support-interactions", {
        method: "POST",
        body: JSON.stringify({
          channel: values.get("channel"),
          subject: values.get("subject"),
          summary: values.get("summary"),
          responseText: values.get("responseText") || undefined,
          outcome: values.get("outcome"),
          durationSeconds: Number(values.get("durationSeconds")) || undefined,
          referredTo: Number(values.get("referredTo")) || undefined,
          containsSensitiveData: values.has("containsSensitiveData"),
          qualityScore: Number(values.get("qualityScore")) || undefined,
        }),
      });
      setMessage("تعامل پشتیبانی ثبت شد.");
      formElement.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت تعامل ناموفق بود.",
      );
    }
  }
  async function replyTicket(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await request(`/operations/tickets/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({
          body: values.get("body"),
          status: values.get("status"),
          internal: false,
        }),
      });
      setMessage("پاسخ تیکت با ثبت سابقه ارسال شد.");
      form.reset();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "پاسخ تیکت ناموفق بود.",
      );
    }
  }
  async function decideRefund(e: FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    try {
      await request(`/operations/refund-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decision: values.get("decision"),
          note: values.get("note"),
        }),
      });
      setMessage("تصمیم استرداد با ثبت سابقه ذخیره شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت تصمیم ناموفق بود.",
      );
    }
  }
  async function decideReview(
    event: FormEvent<HTMLFormElement>,
    reportId: number,
  ) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request(`/operations/reports/${reportId}/approvals`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage("تصمیم بازبینی مستقل ثبت شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت بازبینی ناموفق بود.",
      );
    }
  }
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>گردش‌کار تخصصی و کنترل داخلی</span>
          <h1>میزکار عملیات</h1>
        </div>
      </div>
      {message && (
        <Notice type={message.includes("شد") ? "success" : "warning"}>
          {message}
        </Notice>
      )}
      {user.role === "observer" && (
        <Notice>داشبورد نظارتی سازمان ثبت فقط‌خواندنی است.</Notice>
      )}
      <div className="workspace-stats">
        <div>
          <ClipboardCheck />
          <b>{apps.length}</b>
          <span>پرونده در دسترس</span>
        </div>
        <div>
          <MessageSquareText />
          <b>
            {
              tickets.filter((t) => !["answered", "closed"].includes(t.status))
                .length
            }
          </b>
          <span>تیکت باز</span>
        </div>
        <div>
          <ShieldAlert />
          <b>
            {
              apps.filter((a) => ["high", "critical"].includes(a.riskLevel))
                .length
            }
          </b>
          <span>پرونده پرریسک</span>
        </div>
      </div>
      <div className="workspace-grid">
        {["compliance", "operations_manager", "admin", "observer"].includes(
          user.role,
        ) && (
          <section className="panel-card refund-workspace">
            <div className="card-header">
              <h2>بازبینی دوم پرونده‌های حساس</h2>
            </div>
            {pendingReviews.length ? (
              pendingReviews.map((review) => (
                <form
                  key={review.reportId}
                  onSubmit={(event) => decideReview(event, review.reportId)}
                >
                  <span>
                    <strong>
                      {review.fileNumber} - {review.expertName}
                    </strong>
                    <small>
                      {fa(review.reportType)}: {review.body}
                    </small>
                  </span>
                  <select name="decision" disabled={user.role === "observer"}>
                    <option value="approved">تأیید مستقل</option>
                    <option value="rejected">رد و بازگشت</option>
                  </select>
                  <input
                    name="note"
                    required
                    minLength={10}
                    placeholder="مبنای تصمیم"
                    disabled={user.role === "observer"}
                  />
                  <button
                    className="button secondary"
                    disabled={user.role === "observer"}
                  >
                    ثبت بازبینی
                  </button>
                </form>
              ))
            ) : (
              <p>گزارش در انتظار بازبینی دوم وجود ندارد.</p>
            )}
          </section>
        )}
        {["finance", "operations_manager", "compliance", "admin"].includes(
          user.role,
        ) && (
          <section className="panel-card refund-workspace">
            <div className="card-header">
              <h2>میزکار مالی و استرداد</h2>
            </div>
            {refunds.length ? (
              refunds.map((refund) => (
                <form
                  key={refund.id}
                  onSubmit={(event) => decideRefund(event, refund.id)}
                >
                  <span>
                    <strong>{refund.fileNumber}</strong>
                    <small>
                      {refund.requestedBy} -{" "}
                      {refund.amountRials.toLocaleString("fa-IR")} ریال
                    </small>
                    <small>{refund.reason}</small>
                  </span>
                  <select
                    name="decision"
                    disabled={refund.status !== "pending"}
                  >
                    <option value="approved">تأیید استرداد</option>
                    <option value="rejected">رد استرداد</option>
                  </select>
                  <input
                    name="note"
                    required
                    minLength={5}
                    placeholder="دلیل تصمیم"
                    disabled={refund.status !== "pending"}
                  />
                  <button
                    className="button secondary"
                    disabled={
                      refund.status !== "pending" ||
                      !["finance", "admin"].includes(user.role)
                    }
                  >
                    ثبت تصمیم
                  </button>
                  <i className="status">{fa(refund.status)}</i>
                </form>
              ))
            ) : (
              <p>درخواست استردادی ثبت نشده است.</p>
            )}
          </section>
        )}
        <section className="panel-card">
          <div className="card-header">
            <h2>صف پرونده‌ها</h2>
          </div>
          <div className="workspace-list">
            {apps.map((app) => (
              <button
                className={selected?.id === app.id ? "active" : ""}
                onClick={() => setSelected(app)}
                key={app.id}
              >
                <span>
                  <strong>{app.serviceTitle}</strong>
                  <small dir="ltr">{app.fileNumber}</small>
                </span>
                <i className={`status ${app.status}`}>
                  {statusLabels[app.status] ?? app.status}
                </i>
              </button>
            ))}
          </div>
        </section>
        <section className="panel-card workspace-actions">
          {!selected ? (
            <div className="empty-inline">
              <FileWarning />
              <h3>یک پرونده را انتخاب کنید</h3>
              <p>اقدامات مجاز متناسب با نقش شما نمایش داده می‌شود.</p>
            </div>
          ) : (
            <>
              <div className="selected-case">
                <small dir="ltr">{selected.fileNumber}</small>
                <h2>{selected.serviceTitle}</h2>
                <span className={`status ${selected.status}`}>
                  {statusLabels[selected.status] ?? selected.status}
                </span>
                <Link
                  className="button subtle"
                  to={`/panel/applications/${selected.id}`}
                >
                  مشاهده پرونده، مدارک و پیام‌ها
                </Link>
              </div>
              {canManage &&
                ["registry_exchange", "ready_to_send"].includes(
                  selected.status,
                ) && (
                <button
                  type="button"
                  className="button primary"
                  onClick={enqueueRegistryExchange}
                >
                  <Send /> ارسال کنترل‌شده به صف سازمان ثبت
                </button>
              )}
              {canManage && (
                <form onSubmit={assign}>
                  <h3>
                    <Users /> ارجاع پرونده
                  </h3>
                  <div className="compact-grid">
                    <select name="assignmentType" required>
                      <option value="registry_legal">ثبتی و حقوقی</option>
                      <option value="survey">نقشه‌برداری</option>
                      <option value="compliance">تطبیق</option>
                      <option value="financial">مالی</option>
                    </select>
                    <select name="expertId" required>
                      <option value="">انتخاب کارشناس</option>
                      {experts.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.fullName} - {x.roleTitle}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea name="note" placeholder="توضیح ارجاع" />
                  <button className="button secondary">
                    <Send /> ثبت ارجاع
                  </button>
                </form>
              )}
              {canReview && (
                <>
                  <form onSubmit={report}>
                    <h3>
                      <ClipboardCheck /> گزارش کارشناسی
                    </h3>
                    <div className="compact-grid">
                      <select name="reportType" required>
                        {(
                          reportTypeOptions[user.role] ?? allReportTypeOptions
                        ).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select name="result" required>
                        <option value="accepted">تأیید اولیه</option>
                        <option value="deficient">نقص مدارک</option>
                        <option value="rejected">عدم تأیید اولیه</option>
                        <option value="needs_second_review">
                          نیازمند بازبینی دوم
                        </option>
                      </select>
                    </div>
                    <textarea
                      name="body"
                      required
                      minLength={20}
                      placeholder="شرح مستند بررسی کارشناسی"
                    />
                    <button className="button secondary">
                      <Send /> ثبت و امضای داخلی
                    </button>
                  </form>
                  <form onSubmit={changeStatus}>
                    <h3>تغییر وضعیت کنترل‌شده</h3>
                    <select name="status" required>
                      {(canManage || user.role === "compliance"
                        ? managedStatusOptions
                        : reviewStatusOptions
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      name="reason"
                      required
                      minLength={5}
                      placeholder="دلیل تغییر وضعیت"
                    />
                    <textarea name="note" placeholder="توضیحات تکمیلی" />
                    <button className="button primary">ثبت وضعیت</button>
                  </form>
                </>
              )}
              {["registry_expert", "surveyor"].includes(user.role) && (
                <form onSubmit={requestTransfer}>
                  <h3>درخواست انتقال ارجاع</h3>
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    placeholder="دلیل مستند درخواست انتقال"
                  />
                  <button className="button secondary">
                    ارسال برای مدیر عملیات
                  </button>
                </form>
              )}
              {["compliance", "operations_manager", "admin"].includes(
                user.role,
              ) && (
                <form onSubmit={risk}>
                  <h3>
                    <ShieldAlert /> ارزیابی ریسک و تعارض منافع
                  </h3>
                  <select name="level">
                    <option value="low">کم</option>
                    <option value="medium">متوسط</option>
                    <option value="high">زیاد</option>
                    <option value="critical">بحرانی</option>
                  </select>
                  <div className="risk-checks">
                    <label>
                      <input type="checkbox" name="conflictOfInterest" /> تعارض
                      منافع
                    </label>
                    <label>
                      <input type="checkbox" name="suspiciousDocument" /> سند
                      مشکوک
                    </label>
                    <label>
                      <input type="checkbox" name="identityMismatch" /> مغایرت
                      هویتی
                    </label>
                    <label>
                      <input type="checkbox" name="offPlatformPayment" /> پرداخت
                      خارج سامانه
                    </label>
                  </div>
                  <textarea
                    name="note"
                    required
                    minLength={10}
                    placeholder="شرح ارزیابی"
                  />
                  <button className="button secondary">ثبت ارزیابی</button>
                </form>
              )}
            </>
          )}
        </section>
        <section className="panel-card ticket-queue">
          <div className="card-header">
            <h2>صف پشتیبانی</h2>
          </div>
          {tickets.map((t) => (
            <div key={t.id} className="ticket-work-item">
              <span>
                <strong>{t.subject}</strong>
                <small>
                  {t.applicantName} - {t.tracking_code}
                </small>
              </span>
              <i className="status">{fa(t.status)}</i>
              {[
                "support",
                "operations_manager",
                "compliance",
                "admin",
              ].includes(user.role) &&
                t.status !== "closed" && (
                  <form onSubmit={(event) => replyTicket(event, t.id)}>
                    <textarea
                      name="body"
                      required
                      minLength={2}
                      maxLength={5000}
                      placeholder="پاسخ محترمانه و مستند"
                    />
                    <select name="status" defaultValue="answered">
                      <option value="answered">پاسخ داده شد</option>
                      <option value="waiting_applicant">
                        در انتظار متقاضی
                      </option>
                      <option value="closed">بستن تیکت</option>
                    </select>
                    <button className="button secondary">ارسال پاسخ</button>
                  </form>
                )}
            </div>
          ))}
          {["support", "operations_manager", "admin"].includes(user.role) && (
            <form className="interaction-form" onSubmit={recordInteraction}>
              <h3>ثبت تماس یا تعامل خارج پنل</h3>
              <select name="channel">
                <option value="phone">تلفن</option>
                <option value="email">ایمیل</option>
                <option value="chat">چت</option>
                <option value="ticket">تیکت</option>
                <option value="sms">پیامک</option>
                <option value="in_person">حضوری</option>
              </select>
              <input
                name="subject"
                required
                minLength={5}
                placeholder="موضوع"
              />
              <textarea
                name="summary"
                required
                minLength={10}
                placeholder="خلاصه مستند پاسخ"
              />
              <textarea
                name="responseText"
                minLength={2}
                maxLength={5000}
                placeholder="پاسخ ارائه‌شده"
              />
              <select name="outcome" required defaultValue="follow_up">
                <option value="resolved">حل‌شده</option>
                <option value="follow_up">نیازمند پیگیری</option>
                <option value="referred">ارجاع تخصصی</option>
                <option value="complaint_registered">شکایت ثبت شد</option>
              </select>
              <select name="referredTo" defaultValue="">
                <option value="">بدون ارجاع تخصصی</option>
                {experts.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.fullName} - {expert.roleTitle}
                  </option>
                ))}
              </select>
              <input
                name="durationSeconds"
                type="number"
                min="0"
                max="86400"
                placeholder="مدت تعامل (ثانیه)"
              />
              <label>
                <input type="checkbox" name="containsSensitiveData" /> حاوی
                اطلاعات حساس (فقط چت/تیکت داخل سامانه)
              </label>
              <select name="qualityScore">
                <option value="">امتیاز کیفیت</option>
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score}>{score}</option>
                ))}
              </select>
              <button className="button secondary">ثبت تعامل</button>
            </form>
          )}
        </section>
      </div>
    </PanelLayout>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { request, formatDate, formatMoney, downloadFile } from "./api";
import { Notice, PanelLayout } from "./App";
import { useAuth } from "./App";
import { can } from "./access";
import { OrganizationProfileManagement } from "./OrganizationProfile";
import { PersianDateField } from "./PersianDateField";

type Section =
  | "organization"
  | "services"
  | "users"
  | "transfers"
  | "payments"
  | "archives"
  | "audit"
  | "policies"
  | "security"
  | "backups"
  | "integrations";

function initialSectionForRole(role?: string): Section {
  if (role === "technical") return "security";
  if (role === "observer" || role === "compliance") return "organization";
  return "services";
}

function arrayValue(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function AdminManagement() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>(() =>
    initialSectionForRole(user?.role),
  );
  const [data, setData] = useState<any[]>([]);
  const [experts, setExperts] = useState<any[]>([]);
  const [archiveRequests, setArchiveRequests] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const loadSequence = useRef(0);
  async function load(active = section) {
    const sequence = ++loadSequence.current;
    if (active === "organization") {
      setData([]);
      return;
    }
    const paths: Record<Exclude<Section, "organization">, string> = {
      services: "/admin/services",
      users: "/admin/users",
      transfers: "/operations/transfer-requests",
      payments: "/admin/payments",
      archives: "/admin/archives",
      audit: "/admin/audit-logs?limit=200",
      policies: "/admin/retention-policies",
      security: "/admin/security-events",
      backups: "/admin/backups",
      integrations: "/integrations/registry/jobs",
    };
    setData([]);
    const [nextData, nextArchiveRequests] = await Promise.all([
      request<any[]>(paths[active]),
      active === "archives"
        ? request<any[]>("/admin/archive-access-requests")
        : Promise.resolve([]),
    ]);
    if (sequence !== loadSequence.current) return;
    setData(nextData);
    if (active === "archives") setArchiveRequests(nextArchiveRequests);
    if (active === "transfers") {
      const nextExperts = await request<any[]>("/operations/experts");
      if (sequence === loadSequence.current) setExperts(nextExperts);
    }
  }
  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [section]);
  async function updateService(item: any, form: HTMLFormElement) {
    const values = new FormData(form);
    const split = (name: string) =>
      String(values.get(name) ?? "")
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    await request(`/admin/services/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        legalFeeRials: Number(values.get("legalFeeRials")),
        serviceFeeRials: Number(values.get("serviceFeeRials")),
        isActive: values.get("isActive") === "true",
        requirementsVersion: values.get("requirementsVersion"),
        apiCode: values.get("apiCode") || null,
        apiPayloadFields: split("apiPayloadFields"),
        title: values.get("title"),
        description: values.get("description"),
        requirements: split("requirements"),
        workflow: split("workflow"),
        allowedRoles: split("allowedRoles"),
        automaticMessages: split("automaticMessages"),
      }),
    });
  }
  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const lines = (name: string) =>
      String(values.get(name) ?? "")
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    try {
      await request("/admin/services", {
        method: "POST",
        body: JSON.stringify({
          code: values.get("code"),
          title: values.get("title"),
          category: values.get("category"),
          description: values.get("description"),
          requirements: lines("requirements"),
          workflow: lines("workflow"),
          allowedRoles: lines("allowedRoles"),
          automaticMessages: lines("automaticMessages"),
          legalFeeRials: Number(values.get("legalFeeRials")),
          serviceFeeRials: Number(values.get("serviceFeeRials")),
          requirementsVersion: values.get("requirementsVersion"),
          apiCode: values.get("apiCode") || null,
          apiPayloadFields: lines("apiPayloadFields"),
        }),
      });
      setMessage("خدمت جدید با ثبت سابقه ایجاد شد.");
      event.currentTarget.reset();
      await load("services");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ایجاد خدمت ناموفق بود.",
      );
    }
  }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request("/admin/users", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage("کاربر مدیریتی در وضعیت انتظار و با ثبت audit ایجاد شد.");
      event.currentTarget.reset();
      await load("users");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ایجاد کاربر ناموفق بود.",
      );
    }
  }
  async function updateUser(item: any, form: HTMLFormElement) {
    const values = new FormData(form);
    await request(`/admin/users/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        role: values.get("role"),
        status: values.get("status"),
      }),
    });
  }
  async function submitRow(event: FormEvent<HTMLFormElement>, item: any) {
    event.preventDefault();
    try {
      if (section === "services")
        await updateService(item, event.currentTarget);
      if (section === "users") await updateUser(item, event.currentTarget);
      setMessage("تغییرات با ثبت سابقه ذخیره شد.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ذخیره ناموفق بود.");
    }
  }
  async function decideTransfer(event: FormEvent<HTMLFormElement>, item: any) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request(`/operations/transfer-requests/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decision: values.get("decision"),
          proposedExpertId: Number(values.get("proposedExpertId")) || undefined,
          note: values.get("note"),
        }),
      });
      setMessage("تصمیم انتقال ثبت شد.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت تصمیم ناموفق بود.",
      );
    }
  }
  async function reviewSecurity(event: FormEvent<HTMLFormElement>, item: any) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request(`/admin/security-events/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: values.get("status") }),
      });
      setMessage("وضعیت رخداد امنیتی ثبت شد.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت ناموفق بود.");
    }
  }
  async function createBackup() {
    try {
      await request("/admin/backups", { method: "POST", body: "{}" });
      setMessage("پشتیبان رمزنگاری‌شده ایجاد شد.");
      await load("backups");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "پشتیبان‌گیری ناموفق بود.",
      );
    }
  }
  async function verifyBackup(id: number) {
    try {
      await request(`/admin/backups/${id}/verify`, {
        method: "POST",
        body: "{}",
      });
      setMessage("checksum نسخه پشتیبان تأیید شد.");
      await load("backups");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "اعتبارسنجی ناموفق بود.",
      );
    }
  }
  async function requestArchiveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await request("/admin/archive-access-requests", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      setMessage("درخواست دسترسی بایگانی برای تأیید دومرحله‌ای مدیر ثبت شد.");
      await load("archives");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت درخواست ناموفق بود.",
      );
    }
  }
  async function decideArchiveAccess(
    event: FormEvent<HTMLFormElement>,
    item: any,
  ) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request(`/admin/archive-access-requests/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setMessage("تصمیم دسترسی بایگانی با احراز هویت مدیر ثبت شد.");
      await load("archives");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت تصمیم ناموفق بود.",
      );
    }
  }
  const allowedSections = (
    user?.role === "technical"
      ? ["security", "backups", "integrations", "audit"]
      : user?.role === "observer"
        ? [
            "organization",
            "services",
            "archives",
            "audit",
            "policies",
            "security",
            "backups",
            "integrations",
          ]
        : user?.role === "compliance"
          ? [
              "organization",
              "users",
              "payments",
              "archives",
              "audit",
              "policies",
              "security",
              "integrations",
            ]
          : [
              ...(can(user?.role, "organizationProfile", user?.capabilities)
                ? (["organization"] as Section[])
                : []),
              "services",
              "users",
              "transfers",
              "payments",
              "archives",
              "audit",
              "policies",
              "security",
              "backups",
              "integrations",
            ]
  ) as Section[];
  useEffect(() => {
    if (!allowedSections.includes(section)) setSection(allowedSections[0]);
  }, [user?.role]);
  return (
    <PanelLayout>
      <div className="panel-title">
        <div>
          <span>کنترل متمرکز و قابل بازرسی</span>
          <h1>مدیریت سامانه</h1>
        </div>
      </div>
      {message && (
        <Notice type={message.includes("شد") ? "success" : "warning"}>
          {message}
        </Notice>
      )}
      {user?.role === "observer" && (
        <Notice>این بخش برای ناظر سازمان ثبت فقط‌خواندنی است.</Notice>
      )}
      <div className="management-tabs">
        {(
          [
            "organization",
            "services",
            "users",
            "transfers",
            "payments",
            "archives",
            "audit",
            "policies",
            "security",
            "backups",
            "integrations",
          ] as Section[]
        )
          .filter((key) => allowedSections.includes(key))
          .map((key) => (
            <button
              className={section === key ? "active" : ""}
              key={key}
              onClick={() => setSection(key)}
            >
              {
                {
                  organization: "مشخصات کارگزاری",
                  services: "خدمات و تعرفه",
                  users: "کاربران و نقش‌ها",
                  transfers: "انتقال ارجاع",
                  payments: "پرداخت‌ها",
                  archives: "بایگانی پرونده‌ها",
                  audit: "گزارش امنیتی",
                  policies: "نگهداری داده",
                  security: "رخدادهای امنیتی",
                  backups: "پشتیبان‌گیری",
                  integrations: "صف API سازمان",
                }[key]
              }
            </button>
          ))}
      </div>
      {section === "organization" && (
        <OrganizationProfileManagement
          canManage={can(
            user?.role,
            "organization_profile.manage",
            user?.capabilities,
          )}
        />
      )}
      {section === "services" &&
        ["operations_manager", "admin"].includes(user?.role ?? "") && (
          <details className="panel-card service-create">
            <summary>تعریف خدمت جدید</summary>
            <form className="service-edit-form" onSubmit={createService}>
              <input
                name="code"
                required
                pattern="[a-z0-9-]+"
                placeholder="کد انگلیسی یکتا"
              />
              <input
                name="title"
                required
                minLength={3}
                placeholder="عنوان فارسی خدمت"
              />
              <select name="category" required>
                <option value="legal">حقوقی و ثبتی</option>
                <option value="technical">فنی و حدنگاری</option>
              </select>
              <textarea
                name="description"
                required
                minLength={20}
                placeholder="شرح کامل خدمت"
              />
              <textarea
                name="requirements"
                required
                placeholder="هر مدرک در یک خط"
              />
              <textarea
                name="workflow"
                required
                placeholder="هر مرحله گردش‌کار در یک خط"
              />
              <textarea
                name="allowedRoles"
                required
                defaultValue={"applicant\nrepresentative"}
                aria-label="نقش‌های مجاز"
              />
              <textarea
                name="automaticMessages"
                placeholder="هر پیام خودکار در یک خط"
              />
              <input
                name="legalFeeRials"
                type="number"
                min="0"
                required
                placeholder="هزینه قانونی (ریال)"
              />
              <input
                name="serviceFeeRials"
                type="number"
                min="0"
                required
                placeholder="هزینه خدمات (ریال)"
              />
              <input
                name="requirementsVersion"
                required
                defaultValue="draft-1"
                aria-label="نسخه الزامات"
              />
              <input name="apiCode" placeholder="کد API سازمان" />
              <textarea
                name="apiPayloadFields"
                aria-label="فیلدهای مجاز API"
                placeholder="هر مسیر مجاز در یک خط؛ مانند deedNumber"
              />
              <button className="button primary">ایجاد خدمت</button>
            </form>
          </details>
        )}
      {section === "users" && user?.role === "admin" && (
        <details className="panel-card service-create">
          <summary>ایجاد کاربر مدیریتی</summary>
          <form className="service-edit-form" onSubmit={createUser}>
            <input
              name="fullName"
              required
              minLength={3}
              placeholder="نام کامل"
            />
            <input name="email" type="email" required placeholder="ایمیل" />
            <input name="mobile" pattern="09[0-9]{9}" placeholder="موبایل" />
            <select name="role" required>
              {[
                "registry_expert",
                "surveyor",
                "support",
                "finance",
                "operations_manager",
                "compliance",
                "technical",
                "observer",
                "admin",
              ].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <input
              name="temporaryPassword"
              type="password"
              required
              minLength={12}
              placeholder="رمز موقت پیچیده"
            />
            <button className="button primary">ایجاد در وضعیت انتظار</button>
          </form>
        </details>
      )}
      {section === "archives" && user?.role !== "observer" && (
        <details className="panel-card service-create">
          <summary>درخواست دسترسی زمان‌دار به پرونده مختومه</summary>
          <form className="service-edit-form" onSubmit={requestArchiveAccess}>
            <select
              name="applicationId"
              required
              aria-label="پرونده بایگانی‌شده"
            >
              <option value="">انتخاب پرونده</option>
              {data.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.fileNumber} - {item.serviceTitle}
                </option>
              ))}
            </select>
            <select name="accessMode" required defaultValue="view">
              <option value="view">مشاهده</option>
              <option value="export">مشاهده و استخراج</option>
            </select>
            <PersianDateField
              name="validUntil"
              label="اعتبار تا"
              dateTime
              required
            />
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={2000}
              placeholder="دلیل سازمانی دسترسی"
            />
            <button className="button primary">ثبت درخواست</button>
          </form>
        </details>
      )}
      <section className="panel-card management-list">
        {section === "audit" &&
          can(user?.role, "reports.export", user?.capabilities) && (
            <button
              className="button secondary"
              onClick={() =>
                downloadFile(
                  "/admin/reports/operations.csv",
                  "operations-report.csv",
                ).catch((error) => setMessage(error.message))
              }
            >
              خروجی Excel/CSV سازمان
            </button>
          )}
        {section === "services" &&
          data.map((item) => (
            <form
              className="service-edit-form"
              onSubmit={(event) => submitRow(event, item)}
              key={item.id}
            >
              <input
                name="title"
                defaultValue={item.title}
                aria-label="عنوان خدمت"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="description"
                defaultValue={item.description}
                aria-label="شرح خدمت"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="requirements"
                defaultValue={arrayValue(item.requirements).join("\n")}
                aria-label="مدارک موردنیاز"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="workflow"
                defaultValue={arrayValue(item.workflow).join("\n")}
                aria-label="گردش کار"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="allowedRoles"
                defaultValue={arrayValue(item.allowedRoles, [
                  "applicant",
                  "representative",
                ]).join("\n")}
                aria-label="نقش‌های مجاز"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="automaticMessages"
                defaultValue={arrayValue(item.automaticMessages).join("\n")}
                aria-label="پیام‌های خودکار"
                disabled={user?.role === "observer"}
              />
              <input
                name="legalFeeRials"
                type="number"
                min="0"
                defaultValue={item.legalFeeRials}
                aria-label="هزینه قانونی ریالی"
                disabled={user?.role === "observer"}
              />
              <input
                name="serviceFeeRials"
                type="number"
                min="0"
                defaultValue={item.serviceFeeRials}
                aria-label="هزینه خدمات ریالی"
                disabled={user?.role === "observer"}
              />
              <input
                name="requirementsVersion"
                defaultValue={item.requirementsVersion}
                aria-label="نسخه الزامات"
                disabled={user?.role === "observer"}
              />
              <input
                name="apiCode"
                defaultValue={item.apiCode ?? ""}
                placeholder="کد API"
                disabled={user?.role === "observer"}
              />
              <textarea
                name="apiPayloadFields"
                defaultValue={arrayValue(item.apiPayloadFields).join("\n")}
                aria-label="فیلدهای مجاز ارسال به API"
                placeholder="هر مسیر مجاز در یک خط"
                disabled={user?.role === "observer"}
              />
              <select
                name="isActive"
                defaultValue={String(Boolean(item.isActive))}
                disabled={user?.role === "observer"}
              >
                <option value="true">فعال</option>
                <option value="false">غیرفعال</option>
              </select>
              <button
                className="button secondary"
                disabled={
                  !["operations_manager", "admin"].includes(user?.role ?? "")
                }
              >
                ذخیره
              </button>
            </form>
          ))}
        {section === "users" &&
          data.map((item) => (
            <form onSubmit={(event) => submitRow(event, item)} key={item.id}>
              <span>
                <strong>{item.fullName}</strong>
                <small>{item.email}</small>
              </span>
              <select
                name="role"
                defaultValue={item.role}
                disabled={user?.role !== "admin"}
              >
                {[
                  "applicant",
                  "representative",
                  "registry_expert",
                  "surveyor",
                  "support",
                  "finance",
                  "operations_manager",
                  "compliance",
                  "technical",
                  "admin",
                  "observer",
                ].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={item.status}
                disabled={user?.role !== "admin"}
              >
                <option value="active">فعال</option>
                <option value="suspended">تعلیق</option>
                <option value="pending">در انتظار</option>
              </select>
              <button
                className="button secondary"
                disabled={user?.role !== "admin"}
              >
                ثبت دسترسی
              </button>
            </form>
          ))}
        {section === "transfers" &&
          data.map((item) => (
            <form
              onSubmit={(event) => decideTransfer(event, item)}
              key={item.id}
            >
              <span>
                <strong>{item.fileNumber}</strong>
                <small>
                  {item.requestedBy}: {item.reason}
                </small>
              </span>
              <select name="proposedExpertId" defaultValue="">
                <option value="">کارشناس جایگزین</option>
                {experts.map((expert) => (
                  <option value={expert.id} key={expert.id}>
                    {expert.fullName} - {expert.roleTitle}
                  </option>
                ))}
              </select>
              <select name="decision">
                <option value="approved">تأیید</option>
                <option value="rejected">رد</option>
              </select>
              <input
                name="note"
                required
                minLength={5}
                placeholder="دلیل تصمیم"
              />
              <button
                className="button secondary"
                disabled={item.status !== "pending"}
              >
                ثبت تصمیم
              </button>
            </form>
          ))}
        {section === "payments" &&
          (data.length ? (
            data.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.fileNumber}</strong>
                  <small>{item.transactionId ?? "بدون تراکنش"}</small>
                </span>
                <b>{formatMoney(item.amountRials)}</b>
                <small>
                  قانونی: {formatMoney(item.legalFeeRials)} / خدمات:{" "}
                  {formatMoney(item.serviceFeeRials)}
                </small>
                <i className="status">{item.status}</i>
              </article>
            ))
          ) : (
            <p>پرداختی ثبت نشده است.</p>
          ))}
        {section === "archives" && (
          <>
            {data.map((item) => (
              <article key={`archive-${item.id}`}>
                <span>
                  <strong>{item.fileNumber}</strong>
                  <small>
                    {item.serviceTitle} - {item.applicantName}
                  </small>
                  <small>{item.propertySummary || "ملک ثبت نشده"}</small>
                </span>
                <i className="status">{item.status}</i>
                <small>{formatDate(item.archivedAt)}</small>
              </article>
            ))}
            <h2>درخواست‌های دسترسی</h2>
            {archiveRequests.map((item) =>
              ["operations_manager", "admin"].includes(user?.role ?? "") &&
              item.status === "pending" ? (
                <form
                  key={`archive-request-${item.id}`}
                  onSubmit={(event) => decideArchiveAccess(event, item)}
                >
                  <span>
                    <strong>{item.fileNumber}</strong>
                    <small>
                      {item.requesterName}: {item.reason}
                    </small>
                  </span>
                  <select name="decision" defaultValue="approved">
                    <option value="approved">تأیید</option>
                    <option value="rejected">رد</option>
                  </select>
                  <input
                    name="note"
                    required
                    minLength={5}
                    placeholder="توضیح تصمیم"
                  />
                  <button className="button secondary">ثبت تصمیم با MFA</button>
                </form>
              ) : (
                <article key={`archive-request-${item.id}`}>
                  <span>
                    <strong>{item.fileNumber}</strong>
                    <small>
                      {item.requesterName}: {item.reason}
                    </small>
                  </span>
                  <b>{item.accessMode === "export" ? "استخراج" : "مشاهده"}</b>
                  <i className="status">{item.status}</i>
                  <small>تا {formatDate(item.validUntil)}</small>
                </article>
              ),
            )}
          </>
        )}
        {section === "audit" &&
          data.map((item) => (
            <article key={item.id}>
              <span>
                <strong>{item.action}</strong>
                <small>
                  {item.actorName ?? "سامانه"} - {item.ipAddress ?? "-"}
                </small>
              </span>
              <b>{item.entityType}</b>
              <small>{formatDate(item.createdAt)}</small>
            </article>
          ))}
        {section === "policies" &&
          data.map((item) => (
            <article key={item.id}>
              <span>
                <strong>{item.data_category}</strong>
                <small>{item.legal_basis}</small>
              </span>
              <b>{item.retention_months} ماه</b>
              <i className="status">{item.is_active ? "فعال" : "غیرفعال"}</i>
            </article>
          ))}
        {section === "security" &&
          data.map((item) => (
            <form
              key={item.id}
              onSubmit={(event) => reviewSecurity(event, item)}
            >
              <span>
                <strong>{item.event_type ?? item.eventType}</strong>
                <small>
                  {item.userName ?? "سامانه"} -{" "}
                  {formatDate(item.created_at ?? item.createdAt)}
                </small>
              </span>
              <i className={`status ${item.severity}`}>{item.severity}</i>
              <select
                name="status"
                defaultValue={item.status}
                disabled={!["compliance", "admin"].includes(user?.role ?? "")}
              >
                <option value="reviewed">بررسی‌شده</option>
                <option value="resolved">رفع‌شده</option>
                <option value="false_positive">مثبت کاذب</option>
              </select>
              <button
                className="button secondary"
                disabled={!["compliance", "admin"].includes(user?.role ?? "")}
              >
                ثبت
              </button>
            </form>
          ))}
        {section === "backups" && (
          <>
            {user?.role === "admin" && (
              <button className="button primary" onClick={createBackup}>
                ایجاد پشتیبان رمزنگاری‌شده
              </button>
            )}
            {data.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.backupCode}</strong>
                  <small>
                    {item.sizeBytes
                      ? `${item.sizeBytes.toLocaleString("fa-IR")} بایت`
                      : item.errorMessage}
                  </small>
                </span>
                <i className="status">{item.status}</i>
                {["technical", "admin"].includes(user?.role ?? "") &&
                  item.status === "successful" && (
                    <button onClick={() => verifyBackup(item.id)}>
                      تأیید checksum
                    </button>
                  )}
              </article>
            ))}
          </>
        )}
        {section === "integrations" &&
          data.map((item) => (
            <article key={item.id}>
              <span>
                <strong>{item.serviceCode}</strong>
                <small>
                  {item.fileNumber ?? `پرونده ${item.applicationId}`} -{" "}
                  {item.environment}
                </small>
                <small dir="ltr">{item.requestId}</small>
              </span>
              <b>
                {item.attempts}/{item.maxAttempts}
              </b>
              <i className="status">{item.status}</i>
              <small>{item.lastError ?? formatDate(item.createdAt)}</small>
            </article>
          ))}
      </section>
    </PanelLayout>
  );
}

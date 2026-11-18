import { fa, roleLabel } from "./labels";
import { useEffect, useState, type FormEvent } from "react";
import { ClipboardCheck, FileCheck2, ShieldCheck, Users } from "lucide-react";
import { formatDate, request } from "./api";
import { Notice, PanelLayout, useAuth } from "./App";
import { PersianDateField } from "./PersianDateField";

interface ControlDashboard {
  staff: any[];
  cases: any[];
  campaigns: any[];
  audits: any[];
  evidence: any[];
  accessActivity: any[];
}

const initialData: ControlDashboard = {
  staff: [], cases: [], campaigns: [], audits: [], evidence: [], accessActivity: [],
};
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function InternalControls() {
  const { user } = useAuth();
  const [data, setData] = useState(initialData);
  const [items, setItems] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState<number>();
  const [message, setMessage] = useState("");
  const manager = ["compliance", "admin"].includes(user?.role ?? "");
  const caseReviewer = ["compliance", "operations_manager", "admin"].includes(user?.role ?? "");
  const evidenceManager = ["compliance", "technical", "admin"].includes(user?.role ?? "");

  async function load() {
    setData(await request<ControlDashboard>("/internal-controls/dashboard"));
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function create(event: FormEvent<HTMLFormElement>, path: string, body: object, success: string) {
    event.preventDefault();
    // currentTarget is null after the first await: keep the form element.
    const formElement = event.currentTarget;
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      formElement.reset();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت اطلاعات ناموفق بود.");
    }
  }

  async function showCampaign(id: number) {
    try {
      setCampaignId(id);
      setItems(await request<any[]>(`/internal-controls/access-reviews/${id}/items`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "دریافت اطلاعات ناموفق بود.");
    }
  }

  async function decideAccess(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/internal-controls/access-review-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision: form.get("decision"), note: text(form, "note") }),
      });
      setMessage("تصمیم بازبینی دسترسی ثبت شد.");
      if (campaignId) await showCampaign(campaignId);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت تصمیم ناموفق بود.");
    }
  }

  async function approveAudit(id: number) {
    try {
      await request(`/internal-controls/audits/${id}/approve`, { method: "PATCH", body: "{}" });
      setMessage("ممیزی با کنترل دو نفره تأیید شد.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تأیید ممیزی ناموفق بود.");
    }
  }

  return (
    <PanelLayout>
      <div className="panel-title"><div><span>الزامات کنترل داخلی صفحه ۲۶</span><h1>ریسک، تخلف و آمادگی بازرسی</h1></div></div>
      {message && <Notice type={message.includes("شد") ? "success" : "warning"}>{message}</Notice>}
      <div className="workspace-stats">
        <div><Users /><b>{data.staff.filter((x) => x.controlOverdue).length}</b><span>تعهد یا آموزش منقضی</span></div>
        <div><ClipboardCheck /><b>{data.cases.filter((x) => x.reviewOverdue).length}</b><span>بازبینی پرونده معوق</span></div>
        <div><ShieldCheck /><b>{data.campaigns.filter((x) => x.status === "open").length}</b><span>بازبینی دسترسی باز</span></div>
      </div>

      <div className="internal-controls-grid">
        <section className="panel-card control-wide">
          <div className="card-header"><h2>مانیتورینگ دسترسی کارکنان</h2></div>
          <div className="control-table" role="region" aria-label="مانیتورینگ دسترسی" tabIndex={0}>
            {data.accessActivity.map((x) => <div key={x.userId}><span><strong>{x.fullName}</strong><small>{roleLabel(x.role)}</small></span><b>{x.activityCount} رویداد</b><b>{x.documentDownloads} دانلود سند</b><small>{formatDate(x.lastActivityAt)}</small></div>)}
          </div>
        </section>

        <section className="panel-card">
          <div className="card-header"><h2>تعهد محرمانگی و آموزش</h2></div>
          <div className="control-list">{data.staff.map((x) => <div key={x.id}><span><strong>{x.fullName}</strong><small>{roleLabel(x.role)}</small></span><i className={`status ${x.controlOverdue ? "critical" : "operational"}`}>{x.controlOverdue ? "نیازمند اقدام" : "معتبر"}</i></div>)}</div>
          {manager && <form onSubmit={(event) => { const form = new FormData(event.currentTarget); void create(event, "/internal-controls/attestations", {
            userId: Number(form.get("userId")), ndaVersion: text(form, "ndaVersion"), ndaSignedAt: form.get("ndaSignedAt"),
            trainingVersion: text(form, "trainingVersion"), trainingCompletedAt: form.get("trainingCompletedAt"), trainingExpiresAt: form.get("trainingExpiresAt"), evidenceReference: text(form, "evidenceReference"),
          }, "تعهدنامه و آموزش کارمند ثبت شد."); }}>
            <h3>ثبت مدرک کارکنان</h3>
            <select name="userId" required><option value="">انتخاب کارمند</option>{data.staff.map((x) => <option value={x.id} key={x.id}>{x.fullName}</option>)}</select>
            <div className="compact-grid"><input name="ndaVersion" required placeholder="نسخه تعهدنامه" /><PersianDateField name="ndaSignedAt" label="تاریخ تعهدنامه" required /></div>
            <div className="compact-grid"><input name="trainingVersion" required placeholder="نسخه آموزش" /><PersianDateField name="trainingCompletedAt" label="تاریخ آموزش" required /></div>
            <PersianDateField name="trainingExpiresAt" label="انقضای آموزش" required /><input name="evidenceReference" required minLength={5} placeholder="شماره یا مسیر مدرک" />
            <button className="button secondary">ثبت مدرک</button>
          </form>}
        </section>

        <section className="panel-card">
          <div className="card-header"><h2>بازبینی دوره‌ای پرونده</h2></div>
          <div className="control-list">{data.cases.map((x) => <div key={x.applicationId}><span><strong dir="ltr">{x.fileNumber}</strong><small>{fa(x.riskLevel)}</small></span><i className={`status ${x.reviewOverdue ? "critical" : "operational"}`}>{x.reviewOverdue ? "معوق" : "برنامه‌ریزی‌شده"}</i></div>)}</div>
          {caseReviewer && <form onSubmit={(event) => { const form = new FormData(event.currentTarget); void create(event, "/internal-controls/case-reviews", {
            applicationId: Number(form.get("applicationId")), outcome: form.get("outcome"), conflictChecked: form.has("conflictChecked"), scopeChecked: form.has("scopeChecked"), privacyChecked: form.has("privacyChecked"), paymentChecked: form.has("paymentChecked"), note: text(form, "note"), nextReviewAt: form.get("nextReviewAt"),
          }, "بازبینی مستقل پرونده ثبت شد."); }}>
            <h3>ثبت بازبینی مستقل</h3><select name="applicationId" required><option value="">انتخاب پرونده</option>{data.cases.map((x) => <option value={x.applicationId} key={x.applicationId}>{x.fileNumber}</option>)}</select>
            <select name="outcome"><option value="compliant">منطبق</option><option value="follow_up">نیازمند پیگیری</option><option value="escalated">ارجاع ریسک</option></select>
            <div className="risk-checks"><label><input type="checkbox" name="conflictChecked" required /> تضاد منافع</label><label><input type="checkbox" name="scopeChecked" required /> دامنه مجاز</label><label><input type="checkbox" name="privacyChecked" required /> حریم خصوصی</label><label><input type="checkbox" name="paymentChecked" required /> پرداخت رسمی</label></div>
            <textarea name="note" required minLength={20} placeholder="شرح مستند بازبینی" /><PersianDateField name="nextReviewAt" label="موعد بازبینی بعدی" dateTime required /><button className="button secondary">ثبت بازبینی</button>
          </form>}
        </section>

        <section className="panel-card control-wide">
          <div className="card-header"><h2>بازبینی دوره‌ای سطح دسترسی</h2></div>
          <div className="control-list horizontal">{data.campaigns.map((x) => <button type="button" key={x.id} onClick={() => showCampaign(x.id)} className={campaignId === x.id ? "active" : ""}><span><strong>{x.title}</strong><small>{x.pendingItems ?? 0} مورد باز</small></span><i className="status">{fa(x.status)}</i></button>)}</div>
          {manager && <form className="control-inline-form" onSubmit={(event) => { const form = new FormData(event.currentTarget); void create(event, "/internal-controls/access-reviews", { title: text(form, "title"), periodStart: form.get("periodStart"), periodEnd: form.get("periodEnd"), dueAt: form.get("dueAt") }, "دوره بازبینی دسترسی ایجاد شد."); }}>
            <input name="title" required minLength={5} placeholder="عنوان دوره" /><PersianDateField name="periodStart" label="شروع دوره" required /><PersianDateField name="periodEnd" label="پایان دوره" required /><PersianDateField name="dueAt" label="مهلت بررسی" dateTime required /><button className="button secondary">ایجاد دوره</button>
          </form>}
          {items.length > 0 && <div className="control-table">{items.map((x) => <form key={x.id} onSubmit={(event) => decideAccess(event, x.id)}><span><strong>{x.fullName}</strong><small>{roleLabel(x.role)} - {x.activityCount} رویداد</small></span><select name="decision" disabled={!manager || x.decision !== "pending"}><option value="retain">ابقای دسترسی</option><option value="restrict">محدودسازی</option><option value="suspend">پیشنهاد تعلیق</option></select><input name="note" required minLength={10} placeholder="مبنای تصمیم" disabled={!manager || x.decision !== "pending"} /><button className="button secondary" disabled={!manager || x.decision !== "pending"}>{x.decision === "pending" ? "ثبت" : fa(x.decision)}</button></form>)}</div>}
        </section>

        <section className="panel-card">
          <div className="card-header"><h2>ممیزی ماهانه و آمادگی بازرسی</h2></div>
          <div className="control-list">{data.audits.map((x) => <div key={x.id}><span><strong>{formatDate(x.auditMonth)}</strong><small>{x.ownerName}</small></span><i className="status">{fa(x.status)}</i>{manager && x.status === "open" && <button type="button" onClick={() => approveAudit(x.id)}>تأیید مستقل</button>}</div>)}</div>
          {manager && <form onSubmit={(event) => { const form = new FormData(event.currentTarget); void create(event, "/internal-controls/audits", { auditMonth: form.get("auditMonth"), scope: text(form, "scope"), findings: text(form, "findings"), correctiveActions: text(form, "correctiveActions"), inspectionReady: form.has("inspectionReady") }, "ممیزی ماهانه برای تأیید مستقل ثبت شد."); }}>
            <PersianDateField name="auditMonth" label="ماه ممیزی" required /><textarea name="scope" required minLength={20} placeholder="دامنه ممیزی" /><textarea name="findings" required minLength={20} placeholder="یافته‌ها" /><textarea name="correctiveActions" required minLength={20} placeholder="اقدام اصلاحی" /><label><input name="inspectionReady" type="checkbox" /> مدارک آماده بازرسی سرزده است</label><button className="button secondary">ثبت ممیزی</button>
          </form>}
        </section>

        <section className="panel-card">
          <div className="card-header"><h2>مستندات، پیمانکار، پشتیبان و آزمون نفوذ</h2></div>
          <div className="control-list">{data.evidence.map((x) => <div key={x.id}><FileCheck2 /><span><strong>{x.title}</strong><small>{x.providerName ?? fa(x.evidenceType)}</small></span><i className={`status ${x.status}`}>{fa(x.status)}</i></div>)}</div>
          {evidenceManager && <form onSubmit={(event) => { const form = new FormData(event.currentTarget); void create(event, "/internal-controls/evidence", { evidenceType: form.get("evidenceType"), title: text(form, "title"), reference: text(form, "reference"), providerName: text(form, "providerName") || undefined, providerLicense: text(form, "providerLicense") || undefined, effectiveAt: form.get("effectiveAt"), expiresAt: form.get("expiresAt") || undefined }, "مدرک کنترل داخلی ثبت شد."); }}>
            <select name="evidenceType"><option value="technical_document">مستند فنی</option><option value="operational_document">مستند عملیاتی</option><option value="contractor_contract">قرارداد پیمانکار فنی</option><option value="backup_restore_test">آزمون بازیابی پشتیبان</option><option value="penetration_test">آزمون نفوذ دوره‌ای</option></select><input name="title" required minLength={5} placeholder="عنوان مدرک" /><input name="reference" required minLength={5} placeholder="شماره/مسیر/هش مدرک" /><div className="compact-grid"><input name="providerName" placeholder="نام پیمانکار یا آزمایشگاه" /><input name="providerLicense" placeholder="مجوز یا مرجع صلاحیت" /></div><div className="compact-grid"><PersianDateField name="effectiveAt" label="تاریخ اجرا" required /><PersianDateField name="expiresAt" label="تاریخ انقضا" /></div><button className="button secondary">ثبت مدرک</button>
          </form>}
        </section>
      </div>
    </PanelLayout>
  );
}

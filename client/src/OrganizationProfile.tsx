import { useEffect, useState, type FormEvent } from "react";
import { Building2, FileBadge2, LoaderCircle, ShieldCheck } from "lucide-react";
import { ApiError, formatDate, request } from "./api";

export interface OrganizationProfile {
  legalName: string;
  nationalId: string;
  registrationNumber: string;
  activitySubject: string;
  legalBasis: string;
  supervisoryAuthority: string;
  planType: string;
  documentVersion: string;
  publicationStatus: "draft" | "published";
  revision: number;
  publishedAt: string | null;
  updatedAt: string | null;
}

export function PublicOrganizationProfile() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<OrganizationProfile>("/public/organization-profile")
      .then(setProfile)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setUnavailable(true);
          return;
        }
        setError("دریافت اطلاعات رسمی کارگزاری در حال حاضر ممکن نیست.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <section
        className="container organization-profile-state"
        aria-live="polite"
      >
        <LoaderCircle className="spinner-icon" /> در حال دریافت اطلاعات ثبتی
        تأییدشده
      </section>
    );
  if (unavailable || !profile)
    return (
      <section
        className={`container organization-profile-state${error ? " warning" : ""}`}
        role={error ? "alert" : "status"}
      >
        <FileBadge2 />
        {error ||
          "اطلاعات هویتی شخص حقوقی پس از تکمیل و انتشار رسمی مدیر سامانه نمایش داده می‌شود."}
      </section>
    );

  return (
    <section
      className="container organization-profile"
      aria-labelledby="organization-profile-title"
    >
      <div className="organization-profile-heading">
        <span>
          <Building2 />
        </span>
        <div>
          <small>اطلاعات رسمی متقاضی طرح</small>
          <h2 id="organization-profile-title">{profile.legalName}</h2>
        </div>
        <i>
          <ShieldCheck /> منتشرشده
        </i>
      </div>
      <dl className="organization-profile-grid">
        <div>
          <dt>شناسه ملی</dt>
          <dd dir="ltr">{profile.nationalId}</dd>
        </div>
        <div>
          <dt>شماره ثبت</dt>
          <dd dir="ltr">{profile.registrationNumber}</dd>
        </div>
        <div className="wide">
          <dt>موضوع فعالیت</dt>
          <dd>{profile.activitySubject}</dd>
        </div>
        <div className="wide">
          <dt>مبنای قانونی</dt>
          <dd>{profile.legalBasis}</dd>
        </div>
        <div className="wide">
          <dt>مرجع ناظر</dt>
          <dd>{profile.supervisoryAuthority}</dd>
        </div>
        <div className="wide">
          <dt>نوع طرح</dt>
          <dd>{profile.planType}</dd>
        </div>
        <div className="wide">
          <dt>نسخه سند</dt>
          <dd>{profile.documentVersion}</dd>
        </div>
      </dl>
      <small className="organization-profile-date">
        آخرین انتشار: {formatDate(profile.publishedAt)}
      </small>
    </section>
  );
}

export function OrganizationProfileManagement({
  canManage,
}: {
  canManage: boolean;
}) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = () => {
    setLoading(true);
    setMessage("");
    request<OrganizationProfile>("/admin/organization-profile")
      .then(setProfile)
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "دریافت اطلاعات ناموفق بود.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !canManage) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setMessage("");
    try {
      const saved = await request<OrganizationProfile>(
        "/admin/organization-profile",
        {
          method: "PUT",
          body: JSON.stringify({
            ...values,
            expectedRevision: profile.revision,
          }),
        },
      );
      setProfile(saved);
      setMessage("اطلاعات ثبتی با ثبت سابقه ذخیره شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ذخیره اطلاعات ناموفق بود.",
      );
    }
  }

  if (loading)
    return (
      <div className="organization-profile-state">
        <LoaderCircle className="spinner-icon" /> در حال دریافت
      </div>
    );
  if (!profile)
    return (
      <div className="organization-profile-state warning">
        {message || "اطلاعات در دسترس نیست."}
      </div>
    );

  return (
    <form className="panel-card organization-profile-form" onSubmit={submit}>
      <div className="card-header">
        <div>
          <h2>هویت و مبانی رسمی کارگزاری</h2>
          <small>
            ویرایش {profile.revision} - آخرین تغییر{" "}
            {formatDate(profile.updatedAt)}
          </small>
        </div>
        <i className={`status ${profile.publicationStatus}`}>
          {profile.publicationStatus === "published" ? "منتشرشده" : "پیش‌نویس"}
        </i>
      </div>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div className="form-grid">
        <label className="field">
          <span>نام کامل شخص حقوقی *</span>
          <input
            name="legalName"
            defaultValue={profile.legalName}
            required
            minLength={3}
            maxLength={190}
            disabled={!canManage}
          />
        </label>
        <label className="field">
          <span>شناسه ملی ۱۱ رقمی *</span>
          <input
            name="nationalId"
            defaultValue={profile.nationalId}
            required
            inputMode="numeric"
            pattern="[0-9]{11}"
            dir="ltr"
            disabled={!canManage}
          />
        </label>
        <label className="field">
          <span>شماره ثبت *</span>
          <input
            name="registrationNumber"
            defaultValue={profile.registrationNumber}
            required
            inputMode="numeric"
            pattern="[0-9]{1,20}"
            dir="ltr"
            disabled={!canManage}
          />
        </label>
        <label className="field">
          <span>وضعیت انتشار *</span>
          <select
            name="publicationStatus"
            defaultValue={profile.publicationStatus}
            disabled={!canManage}
          >
            <option value="draft">پیش‌نویس - عدم نمایش عمومی</option>
            <option value="published">انتشار عمومی</option>
          </select>
        </label>
      </div>
      {[
        ["activitySubject", "موضوع فعالیت", profile.activitySubject],
        ["legalBasis", "مبنای قانونی", profile.legalBasis],
        ["supervisoryAuthority", "مرجع ناظر", profile.supervisoryAuthority],
        ["planType", "نوع طرح", profile.planType],
        ["documentVersion", "نسخه سند", profile.documentVersion],
      ].map(([name, label, value]) => (
        <label className="field" key={name}>
          <span>{label} *</span>
          <textarea
            name={name}
            defaultValue={value}
            required
            minLength={name === "documentVersion" ? 3 : 10}
            maxLength={name === "documentVersion" ? 120 : 2000}
            disabled={!canManage}
          />
        </label>
      ))}
      {canManage ? (
        <button className="button primary" type="submit">
          ذخیره و ثبت سابقه
        </button>
      ) : (
        <p className="readonly-note">این بخش برای نقش شما فقط‌خواندنی است.</p>
      )}
    </form>
  );
}

import type { ReactNode } from "react";
import { PersianDateField } from "./PersianDateField";

export function ServiceSpecificFields({
  code,
  initialValues = {},
}: {
  code?: string;
  initialValues?: Record<string, unknown>;
}) {
  if (!code) return null;
  const common = (
    <>
      <label className="field">
        <span>نحوه آشنایی با سابقه ملک</span>
        <textarea name="propertyHistory" required minLength={10} />
      </label>
      <label className="field">
        <span>مبنای قانونی درخواست</span>
        <textarea name="legalBasis" required minLength={10} />
      </label>
    </>
  );
  const fields: Record<string, ReactNode> = {
    "duplicate-deed": (
      <>
        <label className="field">
          <span>علت درخواست المثنی*</span>
          <select name="duplicateReason" required>
            <option value="lost">مفقودی</option>
            <option value="destroyed">از بین رفتن</option>
            <option value="unreadable">ناخوانا شدن</option>
          </select>
        </label>
        <PersianDateField
          name="incidentDate"
          label="تاریخ تقریبی فقدان یا آسیب"
          defaultValue={String(initialValues.incidentDate ?? "")}
        />
        <label className="field span-2">
          <span>شرح فقدان، تخریب یا ناخوانایی*</span>
          <textarea name="incidentDescription" required minLength={10} />
        </label>
        <label className="consent span-2">
          <input
            type="checkbox"
            name="duplicateDeclarationCommitment"
            value="accepted"
            required
          />
          <span>
            اقرار می‌کنم اطلاعات فقدان یا آسیب سند صحیح است و مسئولیت قانونی آن
            را می‌پذیرم.
          </span>
        </label>
      </>
    ),
    "booklet-to-cadastral": (
      <>
        <label className="field">
          <span>شماره دفتر املاک</span>
          <input name="registryBookNumber" required />
        </label>
        <label className="field">
          <span>شماره صفحه سند دفترچه‌ای</span>
          <input name="bookletPage" required />
        </label>
        <label className="field">
          <span>سریال سند دفترچه‌ای*</span>
          <input name="bookletSerial" required />
        </label>
      </>
    ),
    "land-apartment-subdivision": (
      <>
        <label className="field">
          <span>نوع تفکیک*</span>
          <select name="subdivisionType">
            <option value="land">عرصه</option>
            <option value="apartment">آپارتمان</option>
          </select>
        </label>
        <label className="field">
          <span>تعداد قطعات یا واحدها*</span>
          <input name="unitCount" type="number" min="2" required />
        </label>
      </>
    ),
    "merge-partition": (
      <>
        <label className="field">
          <span>نوع درخواست*</span>
          <select name="mergePartitionType">
            <option value="merge">تجمیع</option>
            <option value="partition">افراز</option>
          </select>
        </label>
        <label className="field">
          <span>تعداد پلاک‌های مرتبط*</span>
          <input name="relatedPlateCount" type="number" min="2" required />
        </label>
      </>
    ),
    "property-status-change": (
      <>
        <label className="field">
          <span>وضعیت فعلی ملک*</span>
          <input name="currentPropertyStatus" required />
        </label>
        <label className="field">
          <span>وضعیت درخواستی*</span>
          <input name="requestedPropertyStatus" required />
        </label>
        <label className="field span-2">
          <span>توضیحات متقاضی و علت تغییر*</span>
          <textarea name="applicantExplanation" required minLength={10} />
        </label>
      </>
    ),
    "boundary-determination": (
      <>
        <label className="field">
          <span>نوع مختصات*</span>
          <select name="coordinateType">
            <option value="utm">UTM</option>
            <option value="official">فرمت ابلاغی</option>
          </select>
        </label>
        <label className="field">
          <span>شرح محل وقوع و حدود مجاور*</span>
          <textarea name="boundaryDescription" required minLength={20} />
        </label>
      </>
    ),
    "deed-correction": (
      <>
        <label className="field">
          <span>نوع اصلاح*</span>
          <select name="correctionType">
            <option value="owner">مشخصات مالک</option>
            <option value="property">مشخصات ملک</option>
            <option value="deed">مندرجات سند</option>
            <option value="other">سایر</option>
          </select>
        </label>
        <label className="field">
          <span>مندرج فعلی سند*</span>
          <textarea name="currentEntry" required minLength={2} />
        </label>
        <label className="field">
          <span>مندرج صحیح پیشنهادی*</span>
          <textarea name="correctedEntry" required minLength={2} />
        </label>
        <label className="field span-2">
          <span>علت و مستند اصلاح*</span>
          <textarea name="correctionReason" required minLength={10} />
        </label>
      </>
    ),
    "occupant-cadastral-deed": (
      <>
        {common}
        <label className="field">
          <span>مدت تصرف*</span>
          <input name="possessionDuration" required />
        </label>
        <label className="field">
          <span>مبنای تصرف*</span>
          <textarea name="possessionBasis" required minLength={20} />
        </label>
        <label className="field span-2">
          <span>شرح استشهادات یا مستندات اثباتی*</span>
          <textarea
            name="witnessEvidenceDescription"
            required
            minLength={10}
          />
        </label>
        <label className="field">
          <span>اعلام تعارض منافع*</span>
          <select name="conflictOfInterestDeclaration" required>
            <option value="none">تعارضی وجود ندارد</option>
            <option value="declared">تعارض احتمالی اعلام می‌شود</option>
          </select>
        </label>
        <label className="field">
          <span>اعلام سند مشکوک*</span>
          <select name="suspiciousDocumentDeclaration" required>
            <option value="none">سند مشکوکی وجود ندارد</option>
            <option value="declared">سند مشکوک اعلام می‌شود</option>
          </select>
        </label>
        <label className="consent span-2">
          <input
            type="checkbox"
            name="documentAuthenticityCommitment"
            value="accepted"
            required
          />
          <span>تعهد صحت اطلاعات و اصالت مستندات را می‌پذیرم.</span>
        </label>
      </>
    ),
    "article-10-claim": (
      <>
        {common}
        <label className="field">
          <span>شرح دقیق ادعا*</span>
          <textarea name="claimDescription" required minLength={30} />
        </label>
        <label className="field">
          <span>طرف یا طرف‌های مرتبط</span>
          <textarea name="relatedParties" />
        </label>
        <label className="consent span-2">
          <input
            type="checkbox"
            name="claimAuthenticityCommitment"
            value="accepted"
            required
          />
          <span>
            صحت اطلاعات و اصالت مستندات ادعا را می‌پذیرم و می‌دانم کارگزاری
            مرجع تشخیص نهایی حق نیست.
          </span>
        </label>
      </>
    ),
  };
  return (
    <fieldset className="specific-fields">
      <legend>اطلاعات اختصاصی خدمت</legend>
      <div className="form-grid">{fields[code]}</div>
      {code === "article-10-claim" && (
        <p>
          کارگزاری مرجع تشخیص ماهوی یا نهایی حق نیست و فقط پذیرش و پیگیری مجاز
          را انجام می‌دهد.
        </p>
      )}
    </fieldset>
  );
}

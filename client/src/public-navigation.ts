export interface PublicNavigationItem {
  to: string;
  label: string;
  children?: readonly { to: string; label: string }[];
}

export const legalServiceNavigation = [
  { to: "/services/duplicate-deed", label: "صدور سند مالکیت المثنی" },
  {
    to: "/services/booklet-to-cadastral",
    label: "تبدیل سند دفترچه‌ای به حدنگاری",
  },
  {
    to: "/services/deed-correction",
    label: "اصلاح مندرجات سند مالکیت",
  },
  { to: "/services/deed-correction", label: "اصلاح ملک" },
  {
    to: "/services/property-status-change",
    label: "تغییر وضعیت املاک",
  },
  {
    to: "/services/article-10-claim",
    label: "درج ادعای موضوع ماده ۱۰ قانون الزام",
  },
  {
    to: "/services/occupant-cadastral-deed",
    label: "خدمات متصرفان قانونی فاقد سند رسمی",
  },
] as const;

export const technicalServiceNavigation = [
  { to: "/services/land-apartment-subdivision", label: "تفکیک عرصه" },
  { to: "/services/land-apartment-subdivision", label: "تفکیک آپارتمان" },
  { to: "/services/merge-partition", label: "تجمیع" },
  { to: "/services/merge-partition", label: "افراز" },
  { to: "/services/boundary-determination", label: "تعیین حدود" },
  { to: "/services/boundary-determination", label: "بررسی نقشه و مختصات" },
  {
    to: "/services/boundary-determination",
    label: "کنترل اولیه اطلاعات فنی ملک",
  },
] as const;

export const publicNavigation: readonly PublicNavigationItem[] = [
  { to: "/", label: "صفحه اصلی" },
  { to: "/about", label: "درباره کارگزاری" },
  {
    to: "/services/legal",
    label: "خدمات ثبتی و حقوقی املاک",
    children: legalServiceNavigation,
  },
  {
    to: "/services/technical",
    label: "خدمات فنی، مهندسی و حدنگاری",
    children: technicalServiceNavigation,
  },
  { to: "/panel/new", label: "ثبت درخواست غیرحضوری" },
  { to: "/tracking", label: "پیگیری پرونده" },
  { to: "/tariffs", label: "تعرفه‌ها و پرداخت‌ها" },
  { to: "/documents-guide", label: "راهنمای مدارک" },
  { to: "/support", label: "مرکز پشتیبانی" },
  { to: "/complaints", label: "شکایات و انتقادات" },
  { to: "/regulations", label: "قوانین و مقررات" },
  { to: "/privacy", label: "حریم خصوصی و امنیت اطلاعات" },
  { to: "/contact", label: "تماس با ما" },
  { to: "/login", label: "ورود به سامانه" },
] as const;

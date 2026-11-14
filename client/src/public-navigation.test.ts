import { describe, expect, it } from "vitest";
import {
  legalServiceNavigation,
  publicNavigation,
  technicalServiceNavigation,
} from "./public-navigation";

describe("page 8 public navigation", () => {
  it("contains all fourteen main-menu entries in the required order", () => {
    expect(publicNavigation.map((item) => item.label)).toEqual([
      "صفحه اصلی",
      "درباره کارگزاری",
      "خدمات ثبتی و حقوقی املاک",
      "خدمات فنی، مهندسی و حدنگاری",
      "ثبت درخواست غیرحضوری",
      "پیگیری پرونده",
      "تعرفه‌ها و پرداخت‌ها",
      "راهنمای مدارک",
      "مرکز پشتیبانی",
      "شکایات و انتقادات",
      "قوانین و مقررات",
      "حریم خصوصی و امنیت اطلاعات",
      "تماس با ما",
      "ورود به سامانه",
    ]);
  });

  it("contains both complete seven-item service submenus", () => {
    expect(legalServiceNavigation).toHaveLength(7);
    expect(technicalServiceNavigation).toHaveLength(7);
    expect(publicNavigation.every((item) => item.to.startsWith("/"))).toBe(
      true,
    );
    expect(
      [...legalServiceNavigation, ...technicalServiceNavigation].every((item) =>
        item.to.startsWith("/services/"),
      ),
    ).toBe(true);
  });
});

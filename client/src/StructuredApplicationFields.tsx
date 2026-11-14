import { useState } from "react";
import { normalizeDigits } from "./digits";

type RelatedProperty = {
  mainPlate: string;
  subPlate: string;
  parcel: string;
  area: string;
};
type Party = {
  partyType: string;
  fullName: string;
  nationalId: string;
  shareDescription: string;
};
type SubdivisionUnit = {
  identifier: string;
  floor: string;
  useType: string;
  area: string;
};

export function StructuredApplicationFields({ code }: { code?: string }) {
  const savedFields = (() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("regbroker_new_application_draft") ?? "{}",
        ).fields ?? {}
      );
    } catch {
      return {};
    }
  })();
  const [properties, setProperties] = useState<RelatedProperty[]>(() => {
    try {
      return JSON.parse(savedFields.relatedPropertiesJson ?? "[]");
    } catch {
      return [];
    }
  });
  const [parties, setParties] = useState<Party[]>(() => {
    try {
      return JSON.parse(savedFields.partiesJson ?? "[]");
    } catch {
      return [];
    }
  });
  const [subdivisionUnits, setSubdivisionUnits] = useState<SubdivisionUnit[]>(
    () => {
      try {
        return JSON.parse(savedFields.subdivisionUnitsJson ?? "[]");
      } catch {
        return [];
      }
    },
  );
  const needsProperties = [
    "merge-partition",
    "land-apartment-subdivision",
  ].includes(code ?? "");
  const needsParties = [
    "merge-partition",
    "occupant-cadastral-deed",
    "article-10-claim",
  ].includes(code ?? "");
  const needsUnits = code === "land-apartment-subdivision";
  if (!needsProperties && !needsParties && !needsUnits) return null;
  return (
    <fieldset className="specific-fields structured-fields">
      <legend>اطلاعات ساختاریافته مرتبط</legend>
      {needsProperties && (
        <section>
          <div className="structured-head">
            <h3>پلاک‌ها و قطعات مرتبط</h3>
            <button
              type="button"
              className="button subtle"
              onClick={() =>
                setProperties((items) => [
                  ...items,
                  { mainPlate: "", subPlate: "", parcel: "", area: "" },
                ])
              }
            >
              افزودن ملک
            </button>
          </div>
          {properties.map((property, index) => (
            <div className="structured-row" key={index}>
              {(["mainPlate", "subPlate", "parcel", "area"] as const).map(
                (key) => (
                  <input
                    key={key}
                    required={key === "mainPlate"}
                    inputMode={key === "area" ? "decimal" : "text"}
                    placeholder={
                      {
                        mainPlate: "پلاک اصلی",
                        subPlate: "پلاک فرعی",
                        parcel: "قطعه",
                        area: "مساحت",
                      }[key]
                    }
                    value={property[key]}
                    onChange={(event) =>
                      setProperties((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, [key]: normalizeDigits(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                ),
              )}
              <button
                type="button"
                className="remove-row"
                onClick={() =>
                  setProperties((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                حذف
              </button>
            </div>
          ))}
        </section>
      )}
      {needsParties && (
        <section>
          <div className="structured-head">
            <h3>مالکان و اشخاص مرتبط</h3>
            <button
              type="button"
              className="button subtle"
              onClick={() =>
                setParties((items) => [
                  ...items,
                  {
                    partyType: "owner",
                    fullName: "",
                    nationalId: "",
                    shareDescription: "",
                  },
                ])
              }
            >
              افزودن شخص
            </button>
          </div>
          {parties.map((party, index) => (
            <div className="structured-row party-row" key={index}>
              <select
                value={party.partyType}
                onChange={(event) =>
                  setParties((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, partyType: normalizeDigits(event.target.value) }
                        : item,
                    ),
                  )
                }
              >
                <option value="owner">مالک</option>
                <option value="beneficiary">ذی‌نفع</option>
                <option value="attorney">وکیل</option>
                <option value="claimant">ادعاکننده</option>
                <option value="related_party">شخص مرتبط</option>
              </select>
              <input
                required
                placeholder="نام کامل"
                value={party.fullName}
                onChange={(event) =>
                  setParties((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, fullName: normalizeDigits(event.target.value) }
                        : item,
                    ),
                  )
                }
              />
              <input
                inputMode="numeric"
                placeholder="کد ملی"
                value={party.nationalId}
                onChange={(event) =>
                  setParties((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, nationalId: normalizeDigits(event.target.value) }
                        : item,
                    ),
                  )
                }
              />
              <input
                placeholder="سهم یا سمت"
                value={party.shareDescription}
                onChange={(event) =>
                  setParties((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, shareDescription: normalizeDigits(event.target.value) }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="remove-row"
                onClick={() =>
                  setParties((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                حذف
              </button>
            </div>
          ))}
        </section>
      )}
      {needsUnits && (
        <section>
          <div className="structured-head">
            <h3>قطعات یا واحدهای حاصل از تفکیک</h3>
            <button
              type="button"
              className="button subtle"
              onClick={() =>
                setSubdivisionUnits((items) => [
                  ...items,
                  { identifier: "", floor: "", useType: "", area: "" },
                ])
              }
            >
              افزودن قطعه یا واحد
            </button>
          </div>
          {subdivisionUnits.map((unit, index) => (
            <div className="structured-row" key={index}>
              {(["identifier", "floor", "useType", "area"] as const).map(
                (key) => (
                  <input
                    key={key}
                    required={key !== "floor"}
                    inputMode={key === "area" ? "decimal" : "text"}
                    placeholder={
                      {
                        identifier: "شناسه قطعه یا واحد",
                        floor: "طبقه (اختیاری)",
                        useType: "کاربری",
                        area: "مساحت",
                      }[key]
                    }
                    value={unit[key]}
                    onChange={(event) =>
                      setSubdivisionUnits((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, [key]: normalizeDigits(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                ),
              )}
              <button
                type="button"
                className="remove-row"
                aria-label={`حذف قطعه یا واحد ${index + 1}`}
                onClick={() =>
                  setSubdivisionUnits((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                حذف
              </button>
            </div>
          ))}
        </section>
      )}
      <input
        type="hidden"
        name="relatedPropertiesJson"
        value={JSON.stringify(properties)}
      />
      <input type="hidden" name="partiesJson" value={JSON.stringify(parties)} />
      <input
        type="hidden"
        name="subdivisionUnitsJson"
        value={JSON.stringify(subdivisionUnits)}
      />
    </fieldset>
  );
}

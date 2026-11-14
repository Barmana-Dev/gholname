import { useMemo, useState } from "react";
import {
  citiesForProvince,
  provinces,
  sectionsForCity,
  type LocalCity,
} from "./locations";

interface LocationFieldsProps {
  initialProvince?: string;
  initialCity?: string;
  initialSection?: string;
}

function withSavedOption(
  options: LocalCity[],
  value: string,
): LocalCity[] {
  if (!value || options.some((option) => option.value === value)) return options;
  return [{ value, label: value, sections: ["مرکزی"] }, ...options];
}

/**
 * Offline cascading selectors for the property location. `county` remains
 * the submitted field name for API compatibility, while the user-facing
 * label is «شهر» as requested by the registry workflow.
 */
export function LocationFields({
  initialProvince = "",
  initialCity = "",
  initialSection = "",
}: LocationFieldsProps) {
  const [province, setProvince] = useState(initialProvince);
  const [city, setCity] = useState(initialCity);
  const [section, setSection] = useState(initialSection);
  const cities = useMemo(
    () => withSavedOption(citiesForProvince(province), city),
    [province, city],
  );
  const sections = useMemo(() => {
    const known = sectionsForCity(province, city);
    if (known.length) return known;
    return section ? [section] : [];
  }, [province, city, section]);

  return (
    <>
      <label className="field">
        <span>استان*</span>
        <select
          name="province"
          data-controlled="true"
          value={province}
          required
          onChange={(event) => {
            setProvince(event.target.value);
            setCity("");
            setSection("");
          }}
        >
          <option value="">انتخاب استان</option>
          {provinces.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <small className="field-hint">فهرست محلی سامانه، بدون اتصال بیرونی</small>
      </label>
      <label className="field">
        <span>شهر*</span>
        <select
          name="county"
          data-controlled="true"
          value={city}
          required
          disabled={!province}
          onChange={(event) => {
            setCity(event.target.value);
            setSection("");
          }}
        >
          <option value="">
            {province ? "انتخاب شهر" : "ابتدا استان را انتخاب کنید"}
          </option>
          {cities.map((item) => (
            <option value={item.value} key={`${province}-${item.value}`}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>بخش ثبتی*</span>
        <select
          name="registrySection"
          data-controlled="true"
          value={section}
          required
          disabled={!city}
          onChange={(event) => setSection(event.target.value)}
        >
          <option value="">
            {city ? "انتخاب بخش ثبتی" : "ابتدا شهر را انتخاب کنید"}
          </option>
          {sections.map((item) => (
            <option value={item} key={`${province}-${city}-${item}`}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

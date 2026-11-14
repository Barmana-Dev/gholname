const digitMap: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => digitMap[digit] ?? digit);
}

function normalizeEditable(target: EventTarget | null) {
  if (!(
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  ))
    return;
  const normalized = normalizeDigits(target.value);
  if (normalized === target.value) return;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  target.value = normalized;
  if (start !== null && end !== null) target.setSelectionRange(start, end);
}

export function installGlobalDigitNormalization() {
  document.addEventListener(
    "input",
    (event) => normalizeEditable(event.target),
  );
  document.addEventListener(
    "compositionend",
    (event) => normalizeEditable(event.target),
  );
}

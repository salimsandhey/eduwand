const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Plain "YYYY-MM-DD" strings are parsed as local calendar dates (not UTC midnight),
// so a date picked by the user doesn't shift a day in negative-UTC-offset timezones.
function parseDateIso(dateIso: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(dateIso);
}

export function getOrdinalSuffix(day: number): "st" | "nd" | "rd" | "th" {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

// "04 Sep 26"
export function formatDateShort(dateIso: string): string {
  const date = parseDateIso(dateIso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

// "04th Sep 2026" (plain string, no visual superscript)
export function formatDateLongPlain(dateIso: string): string {
  const date = parseDateIso(dateIso);
  const day = date.getDate();
  const dayStr = String(day).padStart(2, "0");
  const suffix = getOrdinalSuffix(day);
  const month = MONTH_ABBR[date.getMonth()];
  return `${dayStr}${suffix} ${month} ${date.getFullYear()}`;
}

// Parts for rendering "04" + superscript "th" + " Sep 2026"
export function getDateLongParts(dateIso: string): { day: string; suffix: string; monthYear: string } {
  const date = parseDateIso(dateIso);
  const day = date.getDate();
  return {
    day: String(day).padStart(2, "0"),
    suffix: getOrdinalSuffix(day),
    monthYear: `${MONTH_ABBR[date.getMonth()]} ${date.getFullYear()}`,
  };
}

export function getRelativeDateLabel(dateIso: string): string {
  const date = parseDateIso(dateIso);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((todayStart - dateStart) / 86_400_000);

  if (dayDifference <= 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference < 7) return `${dayDifference} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function getRelativeDateLabel(dateIso: string): string {
  const date = new Date(dateIso);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((todayStart - dateStart) / 86_400_000);

  if (dayDifference <= 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference < 7) return `${dayDifference} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

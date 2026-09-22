const COUNT_KEY = "calccanal_daily_calculations";
const DATE_KEY = "calccanal_daily_date";
const WAITLIST_KEY = "calccanal_waitlist_emails";

export const FREE_DAILY_LIMIT = 5;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyCalculationCount(): number {
  if (typeof window === "undefined") return 0;
  const storedDate = localStorage.getItem(DATE_KEY);
  const today = todayKey();
  if (storedDate !== today) {
    localStorage.setItem(DATE_KEY, today);
    localStorage.setItem(COUNT_KEY, "0");
    return 0;
  }
  return parseInt(localStorage.getItem(COUNT_KEY) ?? "0", 10);
}

export function incrementCalculationCount(): number {
  const today = todayKey();
  const storedDate = localStorage.getItem(DATE_KEY);
  if (storedDate !== today) {
    localStorage.setItem(DATE_KEY, today);
    localStorage.setItem(COUNT_KEY, "1");
    return 1;
  }
  const next = getDailyCalculationCount() + 1;
  localStorage.setItem(COUNT_KEY, String(next));
  return next;
}

export function canCalculate(): boolean {
  return getDailyCalculationCount() < FREE_DAILY_LIMIT;
}

export function saveWaitlistEmail(email: string): void {
  const raw = localStorage.getItem(WAITLIST_KEY);
  const list: string[] = raw ? JSON.parse(raw) : [];
  const normalized = email.trim().toLowerCase();
  if (!list.includes(normalized)) {
    list.push(normalized);
    localStorage.setItem(WAITLIST_KEY, JSON.stringify(list));
  }
}

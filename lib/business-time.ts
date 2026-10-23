export const businessZone = "America/New_York";

export function businessDateInput(now = new Date(), timeZone = businessZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  let hour = value("hour");
  if (hour === 24) {
    hour = 0;
  }
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour,
    minute: value("minute"),
    second: value("second"),
  };
}

export function zonedDateTimeToUtc(dateInput: string, time = "00:00:00", timeZone = businessZone) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const wall = wallClock(new Date(utc), timeZone);
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const next = desired - (asUtc - utc);
    if (next === utc) {
      break;
    }
    utc = next;
  }
  return new Date(utc);
}

export function nextCalendarDate(dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function businessDayRange(dateInput: string, timeZone = businessZone) {
  return {
    start: zonedDateTimeToUtc(dateInput, "00:00:00", timeZone),
    end: zonedDateTimeToUtc(nextCalendarDate(dateInput), "00:00:00", timeZone),
  };
}

export function businessTodayRange(now = new Date(), timeZone = businessZone) {
  return businessDayRange(businessDateInput(now, timeZone), timeZone);
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const formatDate = (date: Date | null | undefined) =>
  date ? dateFormatter.format(date) : "";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export const formatDateTime = (date: Date | null | undefined) =>
  date ? dateTimeFormatter.format(date) : "";

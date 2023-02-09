export const isEmpty = (value: string | undefined | null): value is undefined =>
  value === undefined || value === null || value === "";

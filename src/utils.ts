export const parseProgressBarFormat = (name: string) =>
  `[{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | ${name}`;

export const isEmpty = (value: string | undefined | null): value is undefined =>
  value === undefined || value === null || value === "";

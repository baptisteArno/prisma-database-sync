const transformToValidFilename = (ISOString: string) => {
  return ISOString.replace(/:/g, "_") + ".json";
};

const transformToValidISOString = (name: string) => {
  return name.replace(/_/g, ":");
};

export const fileName = {
  transformToValidFilename,
  transformToValidISOString,
};

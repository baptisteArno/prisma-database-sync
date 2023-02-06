import { dump } from "./dump";

export const main = async () => {
  await dump({
    filterTables: ["webhook", "coupon"],
    incrementalFields: { webhook: "updatedAt" },
  });
};

main().then();

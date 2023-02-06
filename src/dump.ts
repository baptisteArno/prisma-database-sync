import { PrismaClient } from "./prisma-clients/source";
import { models } from "./prisma-clients/source/utils";
import { createWriteStream, readdirSync } from "fs";
import { SingleBar, Presets } from "cli-progress";

type ModelName = keyof typeof models;

const take = 100000;

const prisma = new PrismaClient();

type IncrementalFields<FilterTable extends ModelName> = {
  [Key in FilterTable]?: typeof models[Key][number];
};

type DumpProps<FilterTable extends ModelName> = {
  incrementalFields?: IncrementalFields<FilterTable>;
  filterTables?: FilterTable[];
};

export const dump = async <FilterTable extends ModelName>(
  props?: DumpProps<FilterTable>
) => {
  const latestSnapshot = readdirSync("snapshots")
    .map((fileName) => fileName.split(".json")[0])
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] as
    | string
    | undefined;

  const latestSnapshotDate = latestSnapshot
    ? new Date(latestSnapshot)
    : undefined;

  const now = new Date();

  const filter = { lte: now, gt: latestSnapshotDate };

  if (latestSnapshotDate)
    console.log(`Dumping data from ${latestSnapshotDate} to now`);

  await Promise.all(
    (Object.keys(models) as ModelName[])
      .filter((modelName) =>
        props?.filterTables
          ? props.filterTables.includes(modelName as FilterTable)
          : true
      )
      .map(async (modelName) =>
        extractRecords(
          modelName,
          filter,
          now,
          props.incrementalFields[modelName]
        )
      )
  );
};

const extractRecords = async (
  recordName: ModelName,
  filter: any,
  snapshotDate: Date,
  incrementalField?: string
) => {
  const prismaRecord = prisma[recordName] as any;
  const totalRecords = (await prismaRecord.count()) as number;
  console.log(`Fetching ${totalRecords} ${recordName} records...`);
  const stream = createWriteStream(
    `snapshots/${snapshotDate}/${recordName}.json`
  );
  stream.write("[");
  let skip = 0;
  let batch = [];
  let i = 1;
  const progressBar = new SingleBar({}, Presets.legacy);
  progressBar.start(totalRecords, 0);
  do {
    skip += take;
    batch = await prismaRecord.findMany({
      skip,
      take,
      where: incrementalField ? { [incrementalField]: filter } : undefined,
      orderBy: incrementalField ? { [incrementalField]: "asc" } : undefined,
    });
    stream.write(JSON.stringify(batch).slice(1, -1));
    if (batch.length > 0) stream.write(",");
    progressBar.update((i * take) / totalRecords);
    i += 1;
  } while (batch.length > 0);

  stream.write("]");
  stream.end();
  progressBar.stop();
};

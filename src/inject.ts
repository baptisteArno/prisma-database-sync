import { PrismaClient } from "./prisma-clients/target";
import { models } from "./prisma-clients/target/utils";
import {
  createWriteStream,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";

type ModelName = keyof typeof models;

const prisma = new PrismaClient();

type InjectProps = {
  filterTables?: ModelName[];
};

export const inject = async (props?: InjectProps) => {
  const latestInjectedSnapshot = readFileSync(
    "snapshots/injectionHistory.log"
  ).toString();

  const latestInjectedSnapshotDate = new Date(latestInjectedSnapshot);

  const nextSnapshotsToInject = readdirSync("snapshots")
    .map((fileName) => fileName.split(".json")[0])
    .filter((fileName) => new Date(fileName) > latestInjectedSnapshotDate)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  for (const snapshot of nextSnapshotsToInject) {
    const snapshotDate = new Date(snapshot);
    console.log(`Injecting snapshot from ${snapshotDate}`);
    await Promise.all(
      (Object.keys(models) as ModelName[])
        .filter((modelName) =>
          props?.filterTables ? props.filterTables.includes(modelName) : true
        )
        .map(async (modelName) => injectRecords(modelName, snapshotDate))
    );
    console.log(`Writing ${snapshotDate} to injectionHistory.log`);
    writeFileSync("snapshots/injectionHistory.log", snapshotDate.toString());
  }
};

const injectRecords = async (recordName: ModelName, snapshotDate: Date) => {
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
    console.log(`Progress: ${Math.round(((i * take) / totalRecords) * 100)}%`);
    i += 1;
  } while (batch.length > 0);

  stream.write("]");
  stream.end();
};

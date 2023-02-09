import { PrismaClient } from "./prisma-clients/source";
import { incrementalFieldInModel } from "./prisma-clients/source/utils";
import { createWriteStream, existsSync, readFileSync } from "fs";
import { SingleBar, Presets } from "cli-progress";
import { join } from "path";
import { mkdir, readdir } from "fs/promises";
import { parseProgressBarFormat } from "./utils/parseProgressBarFormat";

type ModelName = keyof typeof incrementalFieldInModel;

let isFirstExtract = true;
const take = 100000;
const snapshotsPath = join(__dirname, "snapshots");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.SOURCE_DATABASE_URL } },
});

export type DumpProps = {
  includeTables?: ModelName[];
  excludeTables?: ModelName[];
};

/**
 * Read source database and generate timestamped snapshots
 */
export const dump = async (props?: DumpProps) => {
  if (!existsSync(snapshotsPath)) await mkdir(snapshotsPath);

  isFirstExtract = true;

  await Promise.all(
    (Object.keys(incrementalFieldInModel) as ModelName[])
      .filter(
        (ModelName) =>
          (props?.includeTables
            ? props.includeTables.includes(ModelName as ModelName)
            : true) &&
          (props?.excludeTables
            ? !props.excludeTables.includes(ModelName as ModelName)
            : true)
      )
      .map(async (modelName) => {
        return extractRecords(modelName);
      })
  );
};

const extractRecords = async (modelName: ModelName) => {
  const now = new Date();
  const incrementalField = incrementalFieldInModel[modelName];
  const filter = await parseFilter(modelName, now);
  const prismaRecord = prisma[modelName] as any;
  const totalRecords = (await prismaRecord.count({
    where: incrementalField ? { [incrementalField]: filter } : undefined,
  })) as number;
  if (totalRecords === 0) return;
  if (
    incrementalField === undefined &&
    totalRecords === (await getLatestSnapshotSize(modelName))
  )
    return;
  if (isFirstExtract) {
    isFirstExtract = false;
    console.log("\n------------------ Extracting ------------------\n");
  }
  const currentSnapshotPath = join(snapshotsPath, modelName);
  if (!existsSync(currentSnapshotPath)) await mkdir(currentSnapshotPath);
  const stream = createWriteStream(
    join(currentSnapshotPath, `${now.toISOString()}.json`)
  );
  stream.write("[");
  let skip = 0;
  let batch = [];
  let totalDumped = 0;
  const progressBar = new SingleBar(
    {
      format: parseProgressBarFormat(modelName),
    },
    Presets.legacy
  );
  progressBar.start(totalRecords, 0);
  do {
    if (totalDumped > 1) stream.write(",");
    batch = await prismaRecord.findMany({
      skip,
      take,
      where: incrementalField ? { [incrementalField]: filter } : undefined,
      orderBy: incrementalField ? { [incrementalField]: "asc" } : undefined,
    });
    stream.write(JSON.stringify(batch).slice(1, -1));
    totalDumped += batch.length;
    progressBar.update(totalDumped);
    skip += take;
  } while (batch.length >= take);

  stream.write("]");
  stream.end();
  progressBar.stop();
};

const parseFilter = async (recordName: ModelName, now: Date) => {
  const recordFolderPath = join(snapshotsPath, recordName);
  if (!existsSync(recordFolderPath)) return { lte: now };
  const latestSnapshot = (await readdir(recordFolderPath))
    .map((snapshot) => new Date(snapshot.split(".json")[0]))
    .filter((date) => !isNaN(date.getTime()))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .pop();
  const latestSnapshotDate = latestSnapshot
    ? new Date(latestSnapshot)
    : undefined;
  return { lte: now, gt: latestSnapshotDate };
};

const getLatestSnapshotSize = async (recordName: ModelName) => {
  const recordFolderPath = join(snapshotsPath, recordName);
  if (!existsSync(recordFolderPath)) return 0;
  const latestSnapshot = (await readdir(recordFolderPath))
    .map((snapshot) => new Date(snapshot.split(".json")[0]))
    .filter((date) => !isNaN(date.getTime()))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .pop();

  if (!latestSnapshot) return 0;

  const size = (
    JSON.parse(
      readFileSync(
        join(recordFolderPath, `${latestSnapshot.toISOString()}.json`)
      ).toString()
    ) as unknown[]
  ).length;

  return size;
};

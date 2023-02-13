import { Prisma, PrismaClient } from "./prisma-clients/target";
import {
  uniqueFields,
  nullableJsonFields,
  incrementalFieldInModel,
} from "./prisma-clients/target/utils";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { streamArray } from "stream-json/streamers/StreamArray";
import { parser } from "stream-json";
import { MultiBar, Presets } from "cli-progress";
import { chain } from "stream-chain";
import { progressBarFormat } from "./utils/parseProgressBarFormat";

type ModelName = keyof typeof incrementalFieldInModel;

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TARGET_DATABASE_URL } },
});

let isFirstInject = true;
const injectionLogFileName = "latestSnapshotInjected.log";
const snapshotsPath = join(__dirname, "snapshots");

const parallelQueries = 100;
const totalRowsPerQuery = 100;

export type InjectProps = {
  includeTables?: ModelName[];
  excludeTables?: ModelName[];
  order?: ModelName[];
};

/**
 * Inject the previously imported snapshots chronologically
 */
export const inject = async (props?: InjectProps) => {
  const progressBar = new MultiBar(
    { format: progressBarFormat },
    Presets.legacy
  );
  isFirstInject = true;
  const modelsToInject = readdirSync(snapshotsPath) as ModelName[];
  const modelNames = (props?.order ?? [])
    .concat(
      modelsToInject.filter((modelName) =>
        props?.order ? !props.order.includes(modelName) : true
      )
    )
    .filter(filterModelName(props?.includeTables, props?.excludeTables))
    .filter((modelName) => modelsToInject.includes(modelName));
  for (const modelName of modelNames) {
    const logPath = join(
      snapshotsPath,
      modelName,
      "latestSnapshotInjected.log"
    );
    const latestSnapshotInjected = existsSync(logPath)
      ? readFileSync(
          join(snapshotsPath, modelName, "latestSnapshotInjected.log")
        ).toString()
      : undefined;
    const snapshotsToInject = readdirSync(join(snapshotsPath, modelName))
      .map((snapshot) => new Date(snapshot.split(".json")[0]))
      .filter((snapshot) => !isNaN(snapshot.getTime()))
      .filter((snapshot) =>
        latestSnapshotInjected
          ? snapshot > new Date(latestSnapshotInjected)
          : true
      )
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    if (snapshotsToInject.length > 0 && isFirstInject) {
      isFirstInject = false;
      console.log("\n------------------ Injecting ------------------\n");
    }
    for (const snapshotToInject of snapshotsToInject) {
      await injectRecords(
        modelName as ModelName,
        snapshotToInject,
        progressBar,
        latestSnapshotInjected === undefined
      );
    }
  }
  progressBar.stop();
};

const injectRecords = async (
  modelName: ModelName,
  snapshotDate: Date,
  progressBar,
  isFirstInjection: boolean
) =>
  new Promise<void>(async (resolve, reject) => {
    const filePath = join(
      snapshotsPath,
      modelName,
      `${snapshotDate.toISOString()}.json`
    );

    const listSize = await computeListSize(filePath);

    const progress = progressBar.create(listSize, 0);
    progress.update(0, { modelName });

    let fillingChunk: any[] = [];
    let chunks: any[][] = [];
    let totalInjected = 0;

    const pipeline = chain([
      createReadStream(filePath),
      parser(),
      streamArray(),
      async ({ key, value }: { key: number; value: object }) => {
        fillingChunk.push(value);
        if (fillingChunk.length === totalRowsPerQuery || key === listSize - 1) {
          chunks.push(fillingChunk);
          fillingChunk = [];
        }
        if (key === listSize - 1 || chunks.length === parallelQueries) {
          await Promise.all(
            chunks.map((chunk) =>
              injectRecordsBatch(
                chunk,
                modelName,
                snapshotDate,
                isFirstInjection
              )
            )
          );
          totalInjected += chunks.reduce((acc, cur) => acc + cur.length, 0);
          progress.update(totalInjected);
          chunks = [];
          fillingChunk = [];
        }
        if (key === listSize - 1) {
          writeFileSync(
            join(snapshotsPath, modelName, injectionLogFileName),
            snapshotDate.toISOString()
          );
          resolve();
        }
        return null;
      },
    ]);

    pipeline.on("error", reject);
  });

const computeListSize = (filePath: string): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    let total = 0;

    const pipeline = createReadStream(filePath)
      .pipe(parser())
      .pipe(streamArray());

    pipeline.on("data", () => {
      total += 1;
    });
    pipeline.on("error", reject);
    pipeline.on("end", () => resolve(total));
  });

const injectRecordsBatch = async (
  batch: any[],
  modelName: ModelName,
  snapshotDate: Date,
  isFirstInjection: boolean
) => {
  const prismaRecord = prisma[modelName] as any;
  const deleteManyWhereFilter = parseDeleteWhereFilter(
    batch,
    modelName,
    snapshotDate
  );

  return prisma.$transaction([
    ...(isFirstInjection
      ? []
      : [
          prismaRecord.deleteMany({
            where: deleteManyWhereFilter,
          }),
        ]),
    prismaRecord.createMany({
      data: batch.map(replaceNullWithDbNull(modelName)),
      skipDuplicates: true,
    }),
  ]);
};

const parseDeleteWhereFilter = (
  batch: any[],
  modelName: ModelName,
  snapshotDate: Date
) => {
  const where: Record<string, { in: string[] }> = {};
  (uniqueFields[modelName] as ModelName[]).forEach((field) => {
    where[field] = {
      in: batch.map((record) => record[field]),
    };
  });
  return {
    ...where,
    ...(incrementalFieldInModel[modelName]
      ? { [incrementalFieldInModel[modelName]]: { lte: snapshotDate } }
      : {}),
  };
};

const replaceNullWithDbNull = (modelName: ModelName) => (obj: unknown) => {
  if (!obj) return obj;
  if (typeof obj !== `object`) return obj;
  for (const key in obj) {
    if (obj[key] === null && nullableJsonFields[modelName].includes(key)) {
      obj[key] = Prisma.DbNull;
    }
  }

  return obj;
};

const filterModelName =
  (includeTables?: ModelName[], excludeTables?: ModelName[]) =>
  (modelName: ModelName) =>
    (includeTables ? includeTables.includes(modelName as ModelName) : true) &&
    (excludeTables ? !excludeTables.includes(modelName as ModelName) : true);

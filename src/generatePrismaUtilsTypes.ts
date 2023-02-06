import {
  generatorHandler,
  GeneratorManifest,
  GeneratorOptions,
} from "@prisma/generator-helper";
import { writeFileSync } from "fs";
import { join } from "path";

generatorHandler({
  onManifest() {
    return {
      prettyName: "Prisma Utils Types",
    } satisfies GeneratorManifest;
  },
  onGenerate: async (options: GeneratorOptions) => {
    const models = options.dmmf.datamodel.models.map((model) => ({
      name: camelize(model.name),
      dateFields: model.fields
        .filter((field) => field.type === "DateTime")
        .map((field) => field.name),
    }));

    writeFileSync(
      join(options.generator.output?.value, "utils.ts"),
      `export const models = ${`{${models
        .map(
          (model) =>
            `${model.name}: ${
              model.dateFields.length === 0
                ? "[]"
                : JSON.stringify(model.dateFields)
            }`
        )
        .join(", ")}}`} as const;`
    );
  },
});

// Copy pasted from https://stackoverflow.com/questions/2970525/converting-any-string-into-camel-case 🤓
const camelize = (str: string) => {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
};

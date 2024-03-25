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
    const models = options.dmmf.datamodel.models.map((model) => {
      const idFields = model.fields.filter((field) => field.isId);
      const uniqueFields = model.fields.filter((field) => field.isUnique);
      const groupedUniqueFields = model.uniqueFields?.shift();
      return {
        name: camelize(model.name),
        incrementalField:
          model.fields.find((field) => field.isUpdatedAt)?.name ??
          model.fields.find(
            (field) =>
              field.isUpdatedAt ||
              (field.type === "DateTime" &&
                typeof field.default === "object" &&
                "name" in field.default &&
                field.default?.name === "now")
          )?.name,
        uniqueFields:
          idFields.length > 0
            ? idFields.map((field) => field.name)
            : uniqueFields.length > 0
            ? uniqueFields.map((field) => field.name)
            : groupedUniqueFields,
        nullableJsonFields: model.fields
          .filter(
            (field) => field.type === "Json" && field.isRequired === false
          )
          .map((field) => field.name),
      };
    });

    writeFileSync(
      join(options.generator.output?.value, "utils.ts"),
      `export const incrementalFieldInModel = ${`{${models
        .map(
          (model) =>
            `${model.name}: ${
              model.incrementalField
                ? `"${model.incrementalField}"`
                : "undefined"
            }`
        )
        .join(", ")}}`} as const;

export const uniqueFields = ${`{${models
        .map(
          (model) =>
            `${model.name}: ${
              model.uniqueFields.length === 0
                ? "[]"
                : JSON.stringify(model.uniqueFields)
            }`
        )
        .join(", ")}}`};
        
export const nullableJsonFields = ${`{${models
        .map(
          (model) =>
            `${model.name}: ${
              model.nullableJsonFields.length === 0
                ? "[]"
                : JSON.stringify(model.nullableJsonFields)
            }`
        )
        .join(", ")}}`};
`
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

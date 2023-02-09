import prompts from "prompts";
import { dump } from "./dump";
import { inject } from "./inject";
import { sync } from "./sync";
import * as dotenv from "dotenv";

dotenv.config();

export const main = async () => {
  const { action } = await prompts({
    type: "select",
    name: "action",
    message: "",
    choices: [
      {
        title: "Sync",
        value: "sync",
        description:
          "Watch for changes in your source database and inject it in your target database",
      },
      {
        title: "Dump",
        value: "dump",
        description:
          "Extract data from your source database and generate timestamped snapshots",
      },
      {
        title: "Inject",
        value: "inject",
        description:
          "Inject the previously extracted snapshots chronologically",
      },
    ],
  });

  switch (action) {
    case "sync":
      sync();
      break;
    case "dump":
      await dump();
      break;
    case "inject":
      await inject();
      break;
  }
};

main().then();

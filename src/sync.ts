import { dump } from "./dump";
import { inject, InjectProps } from "./inject";

export const sync = (props?: InjectProps & { interval?: string }) => {
  const parsedInterval = Number(
    props?.interval ?? process.env.SYNC_INTERVAL_MS
  );
  console.log(
    `Will scan source database every ${Math.round(
      parsedInterval / 1000
    )} seconds`
  );
  let isDumping = false;
  setInterval(async () => {
    if (isDumping) return;
    isDumping = true;
    await dump(props);
    await inject(props);
    isDumping = false;
  }, parsedInterval);
};

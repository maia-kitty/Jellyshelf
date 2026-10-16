export async function register() {
  // Imported only on Node: `next dev` also compiles this file for the edge runtime, which can't bundle the database.
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./instrumentation-node")).registerNode();
}

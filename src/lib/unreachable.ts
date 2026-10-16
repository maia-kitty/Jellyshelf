/**
 * `fetch(...).catch(unreachable)`: a dropped connection becomes an ordinary error response, so a button's usual
 * `!res.ok` path shows a message and re-enables it instead of spinning until a reload.
 */
export const unreachable = () =>
  Response.json({ error: "Couldn't reach Jellyshelf. Check your connection and try again." }, { status: 503 });

import { simulate } from "@/lab/server/http.mjs";
type Context = { params: Promise<{ parts: string[] }> };
async function handle(req: Request, context: Context) {
  const [id] = (await context.params).parts;
  // Read the path from the URL to preserve the distinction between an encoded and a literal slash.
  const pathname = new URL(req.url).pathname;
  return simulate(req, id, pathname.slice(("/simulate/" + id).length) || "/");
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};

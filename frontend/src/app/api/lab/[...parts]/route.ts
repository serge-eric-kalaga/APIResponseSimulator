import { administration } from "@/lab/server/http.mjs";
type Context = {params: Promise<{parts:string[]}>};
async function handle(req: Request, context: Context) {
  return administration(req, (await context.params).parts);
}
export {handle as GET, handle as POST};

import { Hono } from "hono";
import { autoClose, cleanup } from "./cron";
import { HelpDesk } from "./durable/HelpDesk";
import { LectureRoom } from "./durable/LectureRoom";
import { RateLimiter } from "./durable/RateLimiter";
import { type AppEnv, actorMiddleware, sameOrigin } from "./lib/context";
import { ApiError } from "./lib/errors";
import { verify } from "./lib/token";
import { adminPublic, adminRoutes } from "./routes/admin";
import { helpRoutes } from "./routes/help";
import { participantRoutes } from "./routes/participant";
import { publicRoutes } from "./routes/public";
import { uploadRoutes } from "./routes/uploads";

export { HelpDesk, LectureRoom, RateLimiter };

const app = new Hono<AppEnv>()
  .basePath("/board/api")
  .use(async (c, next) => {
    const started = Date.now();
    await next();
    // 주소의 쿼리 문자열과 인증 정보는 남기지 않는다 (plan.md 19.3)
    console.log(
      JSON.stringify({
        path: new URL(c.req.url).pathname.replace(/\/dev-files\/.*/, "/dev-files"),
        method: c.req.method,
        status: c.res.status,
        ms: Date.now() - started,
        courseId: c.get("courseId"),
        kst: new Date(started + 9 * 3_600_000).toISOString().replace("Z", "+09:00"),
      }),
    );
  })
  .use(actorMiddleware)
  .onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    console.error(JSON.stringify({ msg: "unhandled", error: String(err), stack: err.stack }));
    return c.json({ error: { code: "server_error", message: "문제가 생겼어요. 잠시 후 다시 시도해 주세요." } }, 500);
  })
  .notFound((c) => c.json({ error: { code: "not_found", message: "찾을 수 없어요." } }, 404))
  .route("/", publicRoutes)
  .route("/", participantRoutes)
  .route("/", uploadRoutes)
  .route("/", helpRoutes)
  .route("/", adminPublic)
  .route("/", adminRoutes);

export type AppType = typeof app;

type Ticket = { exp: number; kind: "lecture" | "help"; id: string; conn: unknown };

async function handleSocket(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/board\/ws\/(lecture|help)\/([^/]+)$/);
  if (!match || req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("not found", { status: 404 });
  if (!sameOrigin(req)) return new Response("forbidden", { status: 403 });
  const ticket = await verify<Ticket>(env.SESSION_SECRET, url.searchParams.get("ticket"));
  if (!ticket || ticket.kind !== match[1] || ticket.id !== match[2]) return new Response("forbidden", { status: 403 });
  const headers = new Headers(req.headers);
  headers.set("x-board-conn", encodeURIComponent(JSON.stringify(ticket.conn)));
  const forward = new Request("https://do.internal/connect", { headers });
  return ticket.kind === "lecture" ? env.LECTURE_ROOM.getByName(ticket.id).fetch(forward) : env.HELP_DESK.getByName(ticket.id).fetch(forward);
}

export default {
  fetch(req, env, ctx) {
    if (new URL(req.url).pathname.startsWith("/board/ws/")) return handleSocket(req, env);
    return app.fetch(req, env, ctx);
  },
  async scheduled(controller, env) {
    if (controller.cron === "0 15 * * *") await autoClose(env);
    await cleanup(env);
  },
} satisfies ExportedHandler<Env>;

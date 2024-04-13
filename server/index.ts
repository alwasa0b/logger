import { createRequestHandler } from "@remix-run/express";
import { ServerBuild, installGlobals } from "@remix-run/node";
import chalk from "chalk";
import express from "express";
import requestID from "express-request-id";
import * as fs from "node:fs";
import pino from "pino";
import pinoMiddleWare from "pino-http";
import pinoPrint from "pino-pretty";

const mode =
  process.env.NODE_ENV === "test" ? "development" : process.env.NODE_ENV;

export async function createExpressApp({
  configure,
  getLoadContext,
}: CreateExpressAppArgs) {
  let minimatch: any;

  if (process.env.NODE_ENV === "development") {
    minimatch = await import("minimatch");
  }

  const colored = {
    default: chalk.white,
    60: chalk.bgRed.bold,
    50: chalk.red.bold,
    40: chalk.yellow,
    30: chalk.green,
    20: chalk.blue,
    10: chalk.gray,
    method: chalk.cyan,
  };

  const start = Date.now();

  const prettyPrintFactory = pinoPrint({
    colorize: true,
    translateTime: false,
    ignore: "level,time,req,res,responseTime,hostname,pid,reqId",
    messageFormat: (log: any, messageKey) => {
      const exclude = [/^\/(app)\/.+/, /^\/@.+$/, /^\/node_modules\/.*/];

      if (process.env.NODE_ENV !== "production")
        for (const pattern of exclude) {
          if (log.req?.url) {
            if (pattern instanceof RegExp) {
              if (pattern.test(log.req?.url)) {
                return "";
              }
            } else if (minimatch(log.req?.url.toString(), pattern)) {
              return "";
            }
          }
        }

      const levelColor = (colored as any)[log.level] || colored.default;
      const reqId = (log.reqId || log.req.id).split("-")[0];
      const prefix = colored.default(
        `[${new Date(log.time).toLocaleString()} ${reqId}]`
      );

      if (log.req) {
        const url = `http://${log.req.headers.host}${log.req.url}`;
        return colored.default(
          `${prefix} ${log.req.method} ${levelColor(
            log.res.statusCode
          )} ${url} - ${log.responseTime}ms`
        );
      }

      return `${prefix} ${levelColor(
        pino.levels.labels[log.level].toUpperCase()
      )} ${log[messageKey]}`;
    },
  });

  const logger = pino(prettyPrintFactory);

  let viteVersion = "";
  let remixVersion = "";
  if (process.env.NODE_ENV !== "production") {
    // get the vite version from the vite package.json
    viteVersion = JSON.parse(
      fs.readFileSync("node_modules/vite/package.json") as any
    ).version;
    remixVersion = JSON.parse(
      fs.readFileSync("node_modules/@remix-run/dev/package.json") as any
    ).version;
  }

  installGlobals();

  const isProductionMode = mode === "production";

  const httpLogger = pinoMiddleWare({ logger });

  const app = express();

  app.use(requestID());
  app.use(httpLogger);

  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" })
  );

  // Everything else (like favicon.ico) is cached for an hour. You may want to be
  // more aggressive with this caching.
  app.use(
    express.static(isProductionMode ? "build/client" : "public", {
      maxAge: "1h",
    })
  );

  configure?.(app);

  // handle SSR requests
  app.all("*", async (req, res, next) => {
    const build = (process.env.NODE_ENV === "production"
      ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line import/no-unresolved -- this expected until you build the app
        await import("../build/server/remix.js")
      : await importDevBuild()) as unknown as ServerBuild;

    return createRequestHandler({ build, mode, getLoadContext })(
      req,
      res,
      next
    );
  });

  const port: number = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === "production")
    app.listen(port, "0.0.0.0", () => {
      if (process.env.NODE_ENV === "production") {
        console.log("http://localhost:" + port);
      } else {
        // since we're using a custom server, emulate what vite dev server prints

        const elapsed = Date.now() - start;

        console.log(
          `  ${chalk.greenBright.bold("VITE")} ${chalk.green(
            `v${viteVersion}`
          )} ${chalk.blueBright.bold("Remix")} ${chalk.blue(
            `v${remixVersion}`
          )} ready in ${chalk.bold(elapsed)} ms`
        );
        console.log();
        console.log(
          `  ${chalk.greenBright.bold("➜")}  ${chalk.bold(
            "Local:"
          )}   ${chalk.cyan("http://localhost:" + port)}`
        );
        console.log();
      }
    });
  return app;
}

// This server is only used to load the dev server build
const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({
          server: { middlewareMode: true },
          appType: "custom",
        })
      );

function importDevBuild() {
  return viteDevServer?.ssrLoadModule("virtual:remix/server-build");
}

import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import chalk from "chalk";
import express from "express";
import requestID from "express-request-id";
import morgan from "morgan";
import * as fs from "node:fs";
import pino from "pino";
import pinoMiddleWare from "pino-http";
import pinoPrint from "pino-pretty";

let minimatch;

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
  relativeUrl: false,
  translateTime: false,
  ignore: "level,time,req,res,responseTime,hostname,pid,reqId",
  messageFormat: (log, messageKey) => {
    const exclude = [/^\/(app)\/.+/, /^\/@.+$/, /^\/node_modules\/.*/];

    if (process.env.NODE_ENV !== "production")
      for (const pattern of exclude) {
        if (log.req?.url) {
          if (pattern instanceof RegExp) {
            if (pattern.test(log.req?.url)) {
              return;
            }
          } else if (minimatch(log.req?.url.toString(), pattern)) {
            return;
          }
        }
      }

    const levelColor = colored[log.level] || colored.default;
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

let viteVersion;
let remixVersion;
if (process.env.NODE_ENV !== "production") {
  // get the vite version from the vite package.json
  viteVersion = JSON.parse(
    fs.readFileSync("node_modules/vite/package.json")
  ).version;
  remixVersion = JSON.parse(
    fs.readFileSync("node_modules/@remix-run/dev/package.json")
  ).version;
}

installGlobals();

let vite =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then(({ createServer }) =>
        createServer({
          server: {
            middlewareMode: true,
          },
        })
      );

const httpLogger = pinoMiddleWare({ logger });

const app = express();

app.use(requestID());
app.use(httpLogger);

morgan.token("id", (req) => {
  return req.id.split("-")[0];
});

if (vite) {
  app.use(vite.middlewares);
} else {
  // add morgan here for production only
  // dev uses morgan plugin, otherwise it spams the console with HMR requests
  app.use(morgan("[:date[iso] :id] :method :url :status - :response-time ms"));
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" })
  );
}
app.use(express.static("build/client", { maxAge: "1h" }));

// handle SSR requests
app.all(
  "*",
  createRequestHandler({
    build: vite
      ? () => vite.ssrLoadModule("virtual:remix/server-build")
      : await import("./build/server/index.js"),
    getLoadContext: (req) => {
      return { logger: logger.child({ reqId: req.id }) };
    },
  })
);

const port = 3000;
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
      `  ${chalk.greenBright.bold("➜")}  ${chalk.bold("Local:")}   ${chalk.cyan(
        "http://localhost:" + port
      )}`
    );
    console.log();
  }
});

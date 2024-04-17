// server/index.ts

import chalk from "chalk";
import compression from "compression";
import requestID from "express-request-id";
import morgan from "morgan";
import pino from "pino";
import pinoMiddleWare from "pino-http";
import pinoPrint from "pino-pretty";
import { createExpressApp } from "remix-express-vite-plugin/express";

// update the AppLoadContext interface used in your app
declare module "@remix-run/node" {
  interface AppLoadContext {
    hello: () => string;
  }
}

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

const prettyPrintFactory = pinoPrint({
  colorize: true,
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
export default createExpressApp({
  configure: (app) => {
    // setup additional express middleware here
    app.use(compression());
    app.disable("x-powered-by");
    app.use(requestID());
    const httpLogger = pinoMiddleWare({ logger });

    app.use(httpLogger);

  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLoadContext: async (req, res) => {
   
    // custom load context should match the AppLoadContext interface defined above
    return { logger: logger.child({ reqId: req.id }) };
  },
});

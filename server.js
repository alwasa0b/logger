import * as fs from "node:fs";
import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import chalk from "chalk";
import express from "express";
import morgan from "morgan";
import winston from "winston";
import requestID from "express-request-id";

const start = Date.now();

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

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf((info) => {
          return `[${info.timestamp} ${info.requestId.split("-")[0]}] ${
            info.level
          }: ${info.message}`;
        })
      ),
    }),
  ],
});

const app = express();

app.use(requestID());

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
      const chld = logger.child({ requestId: req.id });
      console.log = chld.info;
      return { logger:chld };
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

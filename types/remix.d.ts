import "@remix-run/node";
import type { DataFunctionArgs } from "@remix-run/node";
import pino from "pino";
import winston from "winston";

declare module "@remix-run/node" {
  export interface LoaderArgs extends DataFunctionArgs {
    context: { logger: pino.Logger };
  }

  export interface ActionArgs extends DataFunctionArgs {
    context: { logger: pino.Logger };
  }
}
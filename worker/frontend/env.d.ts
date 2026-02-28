/// <reference path="../.astro/types.d.ts" />

type Env = import("./worker-configuration").Env;

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

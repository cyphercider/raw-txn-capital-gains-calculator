import { hasUncaughtExceptionCaptureCallback } from "node:process";

export interface Config {
  inputFile: string;
  outputFile: string;
}
export function getConfig(): Config {
  const config: Config = { inputFile: "", outputFile: "" };

  config.inputFile = process.env.INPUT_FILE || "";
  config.outputFile = process.env.OUTPUT_FILE || "";

  if (!config.inputFile) throw new Error("input file env var missing");
  if (!config.outputFile) throw new Error("output file env var missing");

  return config;
}

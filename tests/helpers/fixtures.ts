import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures");

export function loadFixture<T>(name: string): T {
  const filePath = path.join(FIXTURE_ROOT, name);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function cloneFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
  const projectRoot = path.resolve(__dirname, "../..");
  execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });
}

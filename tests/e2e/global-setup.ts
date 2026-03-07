import { execSync } from "child_process";
import path from "path";

export default async function globalSetup() {
  const projectRoot = path.resolve(__dirname, "../..");
  execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });
}

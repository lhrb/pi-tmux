import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";

export default function piTmux(pi: ExtensionAPI): void {
  registerCommands(pi);
}

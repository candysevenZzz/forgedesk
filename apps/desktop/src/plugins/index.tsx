import { developerToolboxPlugin } from "./developer-toolbox";
import { logInspectorPlugin } from "./log-inspector";
import { workNotesPlugin } from "./work-notes";
import type { PluginDefinition } from "../types";

export const plugins: PluginDefinition[] = [
  logInspectorPlugin,
  developerToolboxPlugin,
  workNotesPlugin,
];

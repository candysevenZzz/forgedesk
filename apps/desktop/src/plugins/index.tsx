import { developerToolboxPlugin } from "./developer-toolbox";
import { chatPlugin } from "./chat";
import { gameArcadePlugin } from "./game-arcade";
import { landlordGamePlugin } from "./landlord-game";
import { workNotesPlugin } from "./work-notes";
import type { PluginDefinition } from "../types";

export const plugins: PluginDefinition[] = [
  developerToolboxPlugin,
  chatPlugin,
  workNotesPlugin,
  gameArcadePlugin,
  landlordGamePlugin,
];

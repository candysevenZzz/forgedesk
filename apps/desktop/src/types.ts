import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import type { AuthUser } from "./api";

export type RuntimeMode = "local" | "connected";
export type PluginServiceRequirement = "local" | "on-demand" | "sync";

export type PluginContext = {
  runtimeMode: RuntimeMode;
  serviceOnline: boolean;
  checkedAt: string;
  auth: AuthUser | null;
};

export type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: string;
  shortcuts: string[];
  accent: "teal" | "amber" | "slate";
  serviceRequirement: PluginServiceRequirement;
  component: (props: { context: PluginContext }) => JSX.Element;
};

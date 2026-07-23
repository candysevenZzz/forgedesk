import type { PluginDefinition, RuntimeMode } from "./types";

export type RuntimeDataPolicy = {
  title: string;
  summary: string;
  status: string;
  notesBehavior: string;
  translationBehavior: string;
};

export function getRuntimeDataPolicy(mode: RuntimeMode, serviceOnline: boolean): RuntimeDataPolicy {
  if (mode === "local") {
    return {
      title: "本地运行",
      summary: "所有插件优先在本机处理，平台不会主动发起服务请求。",
      status: "未连接服务",
      notesBehavior: "工作笔记只写入本机应用数据目录。",
      translationBehavior: "翻译服务已禁用，不会发送文本。",
    };
  }

  return {
    title: serviceOnline ? "服务已连接" : "服务连接异常",
    summary: "本地数据始终保留；笔记在变更后同步，翻译仅在提交时调用服务。",
    status: serviceOnline ? "健康检查已通过" : "当前无法访问服务",
    notesBehavior: "先写入本机，再与服务端合并笔记记录。",
    translationBehavior: "仅在点击翻译后向所选厂商发起请求。",
  };
}

export function getPluginDataRoute(plugin: PluginDefinition, mode: RuntimeMode): string {
  if (plugin.serviceRequirement === "local") {
    return "仅本机处理，不请求服务";
  }
  if (plugin.serviceRequirement === "sync") {
    return mode === "connected" ? "先写入本机，变更后同步" : "只写入本机，等待服务模式";
  }
  return mode === "connected" ? "本机处理，服务能力按操作调用" : "本机处理，服务能力当前禁用";
}

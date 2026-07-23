package app.forgedesk.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WelcomeController {

    @GetMapping("/api/welcome")
    WelcomeResponse welcome() {
        return new WelcomeResponse(
                "欢迎回来",
                "这是一个刚起步的跨平台桌面应用骨架。先把入口、状态和后端连通跑顺，等想法成形后再长出真正的业务。",
                List.of("Windows", "macOS", "Xiaomi Pad"),
                List.of("产品探索", "本地优先", "Java 服务"),
                List.of(
                        new IdeaCard("AI 工作台", "把常用工具、对话和动作编排成一个桌面控制台。", "适合需要高频操作的个人效率工具"),
                        new IdeaCard("团队助手", "围绕消息、会议、知识库和待办做一个协同入口。", "适合和飞书、邮件、日程结合"),
                        new IdeaCard("垂直小工具", "围绕某个具体场景，先做一个足够顺手的单点能力。", "适合快速验证真实需求")
                ),
                List.of(
                        "先选一个最想解决的真实麻烦",
                        "把欢迎页改成第一个真实工作流",
                        "决定数据是本地优先还是云端优先"
                )
        );
    }

    record WelcomeResponse(
            String title,
            String subtitle,
            List<String> platforms,
            List<String> tags,
            List<IdeaCard> ideas,
            List<String> checklist
    ) {
    }

    record IdeaCard(String title, String summary, String fitFor) {
    }
}

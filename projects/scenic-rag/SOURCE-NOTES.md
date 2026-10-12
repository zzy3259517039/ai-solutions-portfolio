# 来源与使用范围

核对日期：2026-09-10。业务规则、会议样例、中文提示词、精简流程和导出脚本为本次项目编写。第三方平台和模型不属于本项目原创。

| 来源 | 用途与许可说明 |
| --- | --- |
| [Dify](https://github.com/langgenius/dify) | 使用其平台及公开DSL接口；平台采用仓库中的Dify Open Source License（含附加条件），不能将平台代码称为自研。未复制平台代码进本包。 |
| [Dify 节点配置](https://github.com/langgenius/dify/blob/main/api/core/workflow/generator/prompts/builder_prompts.py) | 核对开始、知识检索、LLM、回答节点字段；本包独立生成四节点配置。文件blob SHA b59f3bbae516b5cc299c0759e7a71febd9f0e585。 |
| [Dify DSL](https://github.com/langgenius/dify/tree/main/web/app/components/app) | 参考官方仓库的 DSL 导入结构；本包采用云端实际识别并已成功导入的 0.3.0 格式。 |
| [Awesome-Dify-Workflow](https://github.com/svcvit/Awesome-Dify-Workflow) | 查阅可复用案例；参考其知识库问答模板的场景思路，未复制、再分发第三方模板代码。 |
| [Document_chat_template.yml](https://github.com/svcvit/Awesome-Dify-Workflow/blob/main/DSL/Document_chat_template.yml) | 原示例归属Winson-030/dify-DSL，集合维护者svcvit；模板blob SHA 3e3911b8ef6a7482e144f29fae566767a7b350a5。没有将其旧模型配置或资料ID带入本包。 |
| [WorkBuddy Skill规范](https://open.workbuddy.cn/docs/skill) | 核对SKILL.md、scripts、references、templates结构和技能入口；WorkBuddy客户端为第三方产品。 |
| [阿里云接入Dify](https://www.alibabacloud.com/help/en/model-studio/dify) | 模型供应商配置参考，模型权限和费用以本人账户为准。 |

没有下载、重分发Dify/WorkBuddy客户端或未经确认许可的模板。后续公开发布本作品集时，保留这些来源说明；若另行复制第三方代码，应单独核对相应LICENSE。


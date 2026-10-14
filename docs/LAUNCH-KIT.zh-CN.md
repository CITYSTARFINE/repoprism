# RepoPrism 发布材料

这份材料可以在真实仓库和演示地址上线后使用。`<仓库地址>`、`<演示地址>` 是待替换字段，不是已存在的链接。

## 一句话

中文：**把陌生代码仓库变成一张可探索的地图，再挑出 AI 真正需要的上下文。**

英文：**Turn an unfamiliar repository into an explorable map, then take just the code your AI task needs.**

## 30 秒演示脚本

| 时间     | 操作                         | 说明                                         |
| -------- | ---------------------------- | -------------------------------------------- |
| 0–5 秒   | 拖入一个可公开的仓库 ZIP     | “接手项目时，先找到相关代码。”               |
| 5–12 秒  | 点击目录、再点击一个认证文件 | “面积表示体积，点开就能看源码和导入关系。”   |
| 12–18 秒 | 切换关系图，查看调用方       | “知道改动可能影响谁。”                       |
| 18–24 秒 | 输入任务，推荐文件，手动调整 | “把相关代码放进预算，保持选择可核查。”       |
| 24–30 秒 | 展示遮盖与导出 Markdown      | “分析在本机运行，导出到自己使用的 AI 工具。” |

使用演示仓库时要注明是说明性数据。凭据遮盖展示只能用假 token，不能拿真实秘密做视频。录屏应来自实际功能，不把计划中的能力放进演示。

## 英文发布草稿

> I built RepoPrism to help with the step before asking AI to change an unfamiliar codebase: figuring out which files matter.
>
> Open a local folder or ZIP, explore a file-size map, follow supported static JS/TS and Python imports, and assemble a focused Markdown context. Known credential patterns are masked. Analysis stays in a browser worker; there are no source uploads or model API calls.
>
> This is an early version. Import parsing and token counts are heuristic, and file suggestions are deterministic text matches—not semantic understanding. I'd especially like feedback on repositories where the map or suggestions are misleading.
>
> Demo: <演示地址>
> Source: <仓库地址>

## 中文发布草稿

> 做了 RepoPrism，解决让 AI 修改陌生项目之前的一个问题：到底该给它哪些代码？
>
> 打开本地文件夹或拖入 ZIP，就能浏览代码地图、追踪支持的静态导入、挑选相关文件，导出带常见凭据遮盖的 Markdown。分析在浏览器线程里运行，不上传源码，不用 API Key。
>
> 目前是早期版本，导入解析和 token 计数都是启发式，推荐也不是 AI 语义理解。想找实际使用者试试：哪些仓库看不清，哪些文件推荐错了？有不含秘密的最小复现就更好。
>
> 演示：<演示地址>
> 源码：<仓库地址>

## 第一批反馈应该问什么

- 能否把自己的仓库顺利导入？失败时是哪个格式或文件？
- 地图有没有帮助找到一个原先不知道的模块或关系？
- 做一个具体修改任务时，推荐少了哪些文件，又多了哪些？
- 会不会在下一个仓库再次使用？如果不会，阻碍是什么？

这些问题比“喜欢吗”更能指导实现。不要把愿意点 Star 误认为已经完成了一次真实任务。

## 发布顺序

1. 发布仓库和经过验证的在线示例，补充真实网址。
2. 请少量愿意提供实际问题的开发者试用，先修导入和解析阻塞。
3. 带着真实录屏和明确边界，在允许展示作品的开发者社区分享一次。
4. 根据问题发布修复版本与变更说明，再决定投入哪一项较大功能。

没有代发消息、批量宣传或购买 Star 的步骤。社区、相邻项目和列表仓库的贡献规则应在实际投稿时重新查阅。不要把对方 Issue 区当广告位。

## 下一版候选功能

| 候选                | 什么时候值得做                                   |
| ------------------- | ------------------------------------------------ |
| TypeScript 项目引用 | 单仓库中多个引用配置需要正确应用到不同源码目录。 |
| 可选模型 tokenizer  | 使用者需要精确匹配特定模型的上下文限制。         |
| Python AST 导入解析 | 现有 Python 启发式在真实语法上成为常见阻塞。     |
| Git 改动范围视图    | 审查场景得到验证，用户需要比较明确的提交差异。   |

先选最常阻塞实际使用的一项，不把路线图变成功能堆积。

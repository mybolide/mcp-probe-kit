// css_order 工具实现
export async function cssOrder(_args: any) {
  try {
    const message = `请根据以下规则**书写或重排 CSS**（不是解释规则）。目标是让 CSS 属性顺序更一致、可读、可维护。

如果我提供了 CSS 片段/文件，请直接给出**已按规则整理后的 CSS**；如果没提供，请先让我提供需要处理的 CSS。

---

## 排序逻辑（由外向内，由大到小）

将属性分为五类，按顺序排列：

### 1. 定位属性 (Positioning)
决定元素“在哪里”。
- \`position\` / \`z-index\` / \`top\` / \`right\` / \`bottom\` / \`left\` / \`float\` / \`clear\`

### 2. 盒子模型 (Box Model)
决定元素“占多大空间”。
- \`display\` / \`flex\` / \`grid\` 相关属性
- \`width\` / \`height\` / \`max-width\` / \`min-width\`
- \`margin\` / \`padding\` / \`border\`
- \`box-sizing\` / \`overflow\`

### 3. 文本排版 (Typography)
决定元素内“文字内容”的样式。
- \`font-family\` / \`font-size\` / \`font-weight\` / \`line-height\`
- \`text-align\` / \`text-transform\` / \`text-decoration\` / \`letter-spacing\` / \`white-space\` / \`color\`

### 4. 视觉表现 (Visual/Decoration)
决定元素“皮肤”的外观。
- \`background\` / \`box-shadow\` / \`opacity\` / \`visibility\` / \`cursor\` / \`outline\`

### 5. 其他与交互 (Misc/Transitions)
动效和交互相关。
- \`transition\` / \`animation\` / \`transform\` / \`will-change\`

---

## 处理要求

1. **只调整属性顺序，不改动语义**（除非存在明显重复/冲突属性）。
2. **保留注释与格式风格**（缩进、空行、选择器顺序不变）。
3. **同类属性保持原有相对顺序**，除非有明显更合理的排序。
4. 如果存在 **CSS 变量**（\`--*\`）或自定义属性，放在**当前类的最前**。
5. 如遇 CSS-in-JS、Tailwind 或非标准语法，**只处理可确定的纯 CSS 属性**。

---

## 快速对比表

| 顺序 | 类别 | 常用属性举例 | 核心目的 |
| --- | --- | --- | --- |
| **1** | **定位** | \`position\`, \`z-index\`, \`top\` | 确定位置 |
| **2** | **盒模型** | \`display\`, \`width\`, \`margin\`, \`padding\` | 确定形状和间距 |
| **3** | **排版** | \`font\`, \`line-height\`, \`color\`, \`text-align\` | 确定内容样式 |
| **4** | **视觉** | \`background\`, \`border-radius\`, \`box-shadow\` | 确定外观修饰 |
| **5** | **其他** | \`transition\`, \`transform\`, \`animation\` | 确定动态交互 |
`;

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ CSS 顺序规范生成失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

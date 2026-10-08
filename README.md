# Zotero 批量添加信息

为 Zotero 10 编写的插件。选中多篇文献后，通过右键菜单“添加信息…”打开窗口，上方选择字段，下方输入内容，然后批量追加到字段末尾，保留每篇文献原有的信息。

## 安装

1. 打开 Zotero，进入“工具 → 插件”。
2. 点击插件管理窗口右上方齿轮，选择“Install Plugin From File…”（从文件安装插件）。
3. 选择 `dist/zotero-batch-add-info-1.0.1.xpi`。

## 使用

1. 在文献列表中按 Ctrl / Shift（macOS 用 Command / Shift）选中多篇文献。
2. 右键 → **添加信息…**。
3. 在上方下拉框选择字段，在下方输入要添加的内容。
4. 检查适用数量和第一篇文献的预览，然后点击 **添加到所选文献**。也可按 Ctrl+Enter / Command+Enter。
5. 保存后显示成功和跳过的数量。若要恢复，在 Zotero 中选择 **编辑 → 撤销**；整批追加是一条撤销记录。

默认选择“其他”（Extra）；以后记住上次选择的字段。输入内容不会存入插件偏好设置。

## 追加规则

- 空字段直接填写，有内容的字段保留原内容并追加。
- 默认分隔方式：摘要、其他等多行字段使用换行；其他字段使用空格。也可选空格、换行或直接连接。
- 单行字段不支持实际换行，输入中的换行和换行分隔符会转换为空格。
- 不同文献类型的同类字段按 Zotero 基础字段映射，例如“出版社”可对应学位论文的“大学”。下拉框显示每个字段适用的文献数。
- 附件、笔记、标注、已删除条目、订阅条目、只读文献和不支持所选字段的条目会跳过。不会自动修改附件的父条目。
- 作者等创作者列表、标签、条目类型、添加/修改日期不是文本元数据字段，不在下拉框中。访问日期及 Zotero 定义为整数的字段也不支持追加任意文本。
- 日期等格式化字段仍由 Zotero 按自身规则处理；预览展示追加文本，保存后格式可能被 Zotero 规范化。DOI、URL 等字段追加后可能影响链接或引用格式，请按用途选择字段。
- 选择对象在打开窗口时固定；保存时重新检查权限和字段适用性，并读取当时的字段值。重复执行会再次追加相同内容。
- 所有修改使用同一数据库事务，一篇保存失败则整批回滚。

## 开发与验证

无需安装第三方依赖。

```powershell
node --test tests/core.test.cjs
node --check bootstrap.js
node --check content/dialog.js
python build.py
```

目标版本：Zotero 10.0.x。实现对照本机 Zotero 10.0.5 内置 API，以及官方 [Zotero 10 开发文档](https://www.zotero.org/support/dev/zotero_10_for_developers) 和 [菜单 API 文档](https://www.zotero.org/support/dev/zotero_8_for_developers#custom_menu_items)。


现有检查包括 6 项核心逻辑测试、JavaScript 语法检查和 XPI 打包。Zotero 运行时测试需要独立的测试配置目录。

1.0.1 补齐了 Zotero 10 要求的 `update_url`。当前地址是 HTTPS 占位地址（`.invalid`），尚未提供自动更新服务；升级时请手动安装新版 XPI。

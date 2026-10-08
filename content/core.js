/* global Zotero */
var BatchAddInfoCore = (() => {
  const SEPARATORS = new Set(["auto", "space", "newline", "none"]);

  function isEligible(item) {
    return !!item && item.isRegularItem() && !item.deleted && !item.isFeedItem && item.isEditable();
  }

  function isAppendable(zotero, field) {
    const name = zotero.ItemFields.getName(field);
    // Access dates and integer fields reject arbitrary appended text.
    return !!name && name !== "accessDate" && !zotero.ItemFields.isInteger(field);
  }

  function resolveField(zotero, item, name) {
    const id = zotero.ItemFields.getID(name);
    if (!id) return false;
    const mapped = zotero.ItemFields.getFieldIDFromTypeAndBase(item.itemTypeID, id);
    const actual = mapped || id;
    return zotero.ItemFields.isValidForType(actual, item.itemTypeID)
      && isAppendable(zotero, actual) ? actual : false;
  }

  function getFields(zotero, items) {
    const names = new Set();
    for (const item of items) {
      for (const id of zotero.ItemFields.getItemTypeFields(item.itemTypeID)) {
        if (!isAppendable(zotero, id)) continue;
        const base = zotero.ItemFields.getBaseIDFromTypeAndField(item.itemTypeID, id);
        names.add(zotero.ItemFields.getName(base || id));
      }
    }
    return [...names].map(name => ({
      name,
      label: zotero.ItemFields.getLocalizedString(name),
      count: items.filter(item => resolveField(zotero, item, name)).length
    })).filter(field => field.count).sort((a, b) => {
      const preferred = ["extra", "abstractNote", "title", "shortTitle"];
      const rank = name => preferred.includes(name) ? preferred.indexOf(name) : preferred.length;
      return rank(a.name) - rank(b.name) || a.label.localeCompare(b.label, "zh-CN");
    });
  }

  function append(oldValue, text, separator = "auto", multiline = false) {
    if (!SEPARATORS.has(separator)) throw new Error("未知的分隔方式。");
    let addition = String(text).replace(/\r\n?/g, "\n").trim();
    if (!addition) throw new Error("请输入要添加的内容。");
    if (!multiline) addition = addition.replace(/\n+/g, " ");
    const existing = String(oldValue || "");
    if (!existing) return addition;
    let joiner = separator === "none" ? "" : separator === "space" ? " "
      : separator === "newline" ? "\n" : multiline ? "\n" : " ";
    if (!multiline && joiner === "\n") joiner = " ";
    if (joiner && existing.endsWith(joiner)) joiner = "";
    return existing + joiner + addition;
  }

  async function apply(zotero, ids, name, text, separator = "auto") {
    // Validate input before starting a transaction or changing any cached item.
    append("", text, separator);
    if (!zotero.ItemFields.getID(name)) throw new Error("未知字段。");
    const uniqueIDs = [...new Set(ids)];
    const touched = new Set();
    const result = { updated: 0, unsupported: 0, unavailable: 0, unchanged: 0 };
    try {
      await zotero.DB.executeTransaction(async () => {
        for (const id of uniqueIDs) {
          const item = await zotero.Items.getAsync(id);
          if (!isEligible(item)) {
            result.unavailable++;
            continue;
          }
          const actual = resolveField(zotero, item, name);
          if (!actual) {
            result.unsupported++;
            continue;
          }
          await item.loadDataType("itemData");
          const next = append(item.getField(actual), text, separator,
            zotero.ItemFields.isMultiline(actual));
          touched.add(item);
          if (item.setField(actual, next) === false) {
            result.unchanged++;
            continue;
          }
          await item.save();
          result.updated++;
        }
        if (result.updated) {
          zotero.UndoHistory.stageAction("undo-action-edit-metadata", { count: result.updated });
        }
      });
      return result;
    } catch (error) {
      // SQLite rolls back the transaction; restore Zotero's cached objects too.
      for (const item of touched) {
        try { await item.reload(null, true); }
        catch (reloadError) { zotero.logError(reloadError); }
      }
      throw error;
    }
  }

  return { isEligible, resolveField, getFields, append, apply };
})();

if (typeof module !== "undefined") module.exports = BatchAddInfoCore;

/* global Zotero, Services, Components */
var Cc = Components.classes;
var Ci = Components.interfaces;
var chromeHandle;
var menuID;
var core;
var dialogs = new Set();
var saving = false;
var active = false;

function install() {}
function uninstall() {}

async function startup({ id, rootURI }) {
  const scope = {};
  Services.scriptloader.loadSubScript(rootURI + "content/core.js", scope);
  core = scope.BatchAddInfoCore;
  chromeHandle = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + "manifest.json"), [
      ["content", "batch-add-info", "content/"]
    ]);
  active = true;
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
  menuID = Zotero.MenuManager.registerMenu({
    menuID: "batch-add-info",
    pluginID: id,
    target: "main/library/item",
    menus: [{
      menuType: "menuitem",
      l10nID: "batch-add-info-menu",
      onShowing(event, context) {
        const items = context.items || [];
        context.setVisible(items.some(item => item.isRegularItem()));
        context.setEnabled(!saving && items.some(item => core.isEligible(item)));
      },
      onCommand(event, context) {
        const window = event.target.ownerGlobal || event.target.ownerDocument.defaultView;
        openDialog(window, context.items || []).catch(error => {
          Zotero.logError(error);
          Services.prompt.alert(window, "添加信息", "无法打开窗口：" + error.message);
        });
      }
    }]
  });
  if (!menuID) throw new Error("无法注册添加信息菜单");
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded("batch-add-info.ftl");
}

function onMainWindowUnload({ window }) {
  for (const dialog of dialogs) {
    if (dialog.opener === window) dialog.close();
  }
}

async function openDialog(window, selected) {
  if (!active || saving) return;
  // Freeze the selection, so later selection changes cannot change the targets.
  const ids = [...new Set(selected.map(item => item.id).filter(Boolean))];
  const items = await Zotero.Items.getAsync(ids);
  const eligible = items.filter(item => core.isEligible(item));
  await Promise.all(eligible.map(item => item.loadDataType("itemData")));
  if (!active) return;
  if (!eligible.length) {
    Services.prompt.alert(window, "添加信息", "请选择可编辑的文献条目。");
    return;
  }
  const fields = core.getFields(Zotero, eligible);
  if (!fields.length) return;
  const remembered = Zotero.Prefs.get("extensions.batch-add-info.lastField", true);
  const payload = {
    fields,
    total: ids.length,
    eligibleCount: eligible.length,
    initialField: remembered || "extra",
    preview(field, text, separator, position) {
      const item = eligible.find(item => core.resolveField(Zotero, item, field));
      if (!item) return null;
      const actual = core.resolveField(Zotero, item, field);
      const oldValue = item.getField(actual);
      return {
        title: item.getField("title") || "无标题",
        oldValue,
        newValue: core.append(oldValue, text, separator, Zotero.ItemFields.isMultiline(actual), position)
      };
    },
    async apply(field, text, separator, position) {
      if (!active) throw new Error("插件已停用，请重新启用后操作。");
      if (saving) throw new Error("另一批文献正在保存，请稍后再试。");
      saving = true;
      try {
        const result = await core.apply(Zotero, ids, field, text, separator, position);
        try { Zotero.Prefs.set("extensions.batch-add-info.lastField", field, true); }
        catch (error) { Zotero.logError(error); }
        return result;
      } finally {
        saving = false;
      }
    }
  };
  const dialog = window.openDialog(
    "chrome://batch-add-info/content/dialog.xhtml",
    "", "chrome,centerscreen,resizable,dialog=no", payload
  );
  dialogs.add(dialog);
  dialog.addEventListener("unload", () => dialogs.delete(dialog), { once: true });
}

function shutdown() {
  active = false;
  for (const dialog of dialogs) dialog.close();
  dialogs.clear();
  if (menuID) Zotero.MenuManager.unregisterMenu(menuID);
  menuID = null;
  for (const window of Zotero.getMainWindows()) {
    window.document.querySelector('link[href="batch-add-info.ftl"]')?.remove();
  }
  chromeHandle?.destruct();
  chromeHandle = null;
}

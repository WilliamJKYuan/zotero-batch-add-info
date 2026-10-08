/* This harness runs only in .test-profile with its own empty data directory. */
var started = false;
function install() {}
function uninstall() {}
function shutdown() {}
function startup() {
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}
async function onMainWindowLoad({ window }) {
  if (started) return;
  started = true;
  const checks = [];
  const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  function check(condition, label) {
    if (!condition) throw new Error(label);
    checks.push(label);
  }
  async function waitFor(fn, label) {
    for (let i = 0; i < 200; i++) {
      const result = fn();
      if (result) return result;
      await delay(100);
    }
    throw new Error('Timed out: ' + label);
  }
  let report;
  try {
    check(Zotero.DataDirectory.dir === __DATA_DIR__, 'runtime tests use the isolated data directory');
    const menu = await waitFor(() => Zotero.MenuManager._menuManager.getCustomMenuOptions('main/library/item')
      .find(x => x.pluginID === 'batch-add-info@yuan.local'), 'menu registration');
    check(menu.menus[0].l10nID === 'batch-add-info-menu', 'native context menu registered');
    const scope = {};
    Services.scriptloader.loadSubScript('chrome://batch-add-info/content/core.js', scope);
    const core = scope.BatchAddInfoCore;
    const a = new Zotero.Item('journalArticle');
    a.setField('title', '测试期刊文献');
    a.setField('extra', '原有信息甲');
    await a.saveTx();
    const b = new Zotero.Item('book');
    b.setField('title', '测试图书');
    await b.saveTx();
    const thesis = new Zotero.Item('thesis');
    thesis.setField('title', '测试学位论文');
    thesis.setField('university', '原大学');
    await thesis.saveTx();
    const note = new Zotero.Item('note');
    note.setNote('测试笔记');
    await note.saveTx();
    const fields = core.getFields(Zotero, [a, b, thesis]);
    check(fields.find(x => x.name === 'extra').count === 3, 'real schema field enumeration');
    check(core.resolveField(Zotero, thesis, 'publisher') === Zotero.ItemFields.getID('university'), 'real schema base field mapping');
    Zotero.UndoHistory.clear();
    menu.menus[0].onCommand({ target: window.document.documentElement }, { items: [a, b, note] });
    const dialog = await waitFor(() => Services.wm.getMostRecentWindow('batch-add-info:dialog'), 'dialog window');
    const doc = dialog.document;
    await waitFor(() => doc.getElementById('field')?.options.length, 'dialog initialization');
    check(doc.getElementById('field').value === 'extra', 'field selector defaults to Extra');
    check(doc.getElementById('position').value === 'end', 'position selector defaults to end');
    const input = doc.getElementById('content');
    input.value = '新增信息';
    input.dispatchEvent(new dialog.Event('input', { bubbles: true }));
    check(doc.getElementById('preview').textContent === '原有信息甲\n新增信息', 'dialog preview preserves original content');
    const position = doc.getElementById('position');
    position.value = 'start';
    position.dispatchEvent(new dialog.Event('change', { bubbles: true }));
    check(doc.getElementById('preview').textContent === '新增信息\n原有信息甲', 'position change immediately refreshes prepend preview');
    check(doc.getElementById('field-hint').textContent.includes('开头'), 'field hint reflects prepend position');
    position.value = 'end';
    position.dispatchEvent(new dialog.Event('change', { bubbles: true }));
    check(doc.getElementById('preview').textContent === '原有信息甲\n新增信息', 'switching back restores append preview');
    position.value = 'start';
    position.dispatchEvent(new dialog.Event('change', { bubbles: true }));
    check(!doc.getElementById('apply').disabled, 'save button becomes enabled');
    doc.getElementById('apply').click();
    await waitFor(() => doc.getElementById('apply').textContent === '已完成'
      || doc.getElementById('status').className === 'error', 'save result');
    check(doc.getElementById('status').className === 'success', 'dialog save succeeded: ' + doc.getElementById('status').textContent);
    check(a.getField('extra') === '新增信息\n原有信息甲', 'existing field prepended through dialog');
    check(b.getField('extra') === '新增信息', 'empty field filled');
    check(doc.getElementById('status').textContent.includes('跳过 1'), 'note skipped with result count');
    check(doc.getElementById('apply').disabled, 'repeat click prevented');
    check(position.disabled, 'position changes disabled after saving');
    const action = Zotero.UndoHistory.getUndoAction();
    check(action?.actionArgs?.count === 2, 'batch saved as one undo action');
    await Zotero.UndoHistory.undo();
    check(a.getField('extra') === '原有信息甲' && b.getField('extra') === '', 'native undo restores both items');
    await Zotero.UndoHistory.redo();
    check(a.getField('extra') === '新增信息\n原有信息甲' && b.getField('extra') === '新增信息', 'native redo restores prepend batch');
    dialog.close();
    await core.apply(Zotero, [thesis.id], 'publisher', '追加大学');
    check(thesis.getField('university') === '原大学 追加大学', 'mapped field saved using real API');
    const originalSave = b.save;
    b.save = async () => { throw new Error('intentional rollback check'); };
    let failed = false;
    try { await core.apply(Zotero, [a.id, b.id], 'extra', '不应保存', 'auto', 'start'); }
    catch (error) { failed = error.message.includes('intentional'); }
    finally { b.save = originalSave; }
    check(failed, 'simulated failure surfaced');
    check(a.getField('extra') === '新增信息\n原有信息甲' && b.getField('extra') === '新增信息', 'real prepend transaction rollback restores cache');
    const stored = await Zotero.DB.valueQueryAsync('SELECT value FROM itemData JOIN itemDataValues USING (valueID) WHERE itemID=? AND fieldID=?', [a.id, Zotero.ItemFields.getID('extra')]);
    check(stored === '新增信息\n原有信息甲', 'real prepend transaction rollback restores database');
    report = { ok: true, version: Zotero.version, checks };
  } catch (error) {
    report = { ok: false, checks, error: String(error), stack: error.stack };
  }
  await IOUtils.writeJSON(__REPORT__, report);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}

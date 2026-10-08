const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../content/core.js');

function fixture() {
  const names = ['extra', 'title', 'publisher', 'university', 'abstractNote', 'accessDate', 'numPages', 'date'];
  const id = name => names.indexOf(name) + 1;
  const types = { 1: ['extra', 'title', 'publisher', 'abstractNote', 'date'], 2: ['extra', 'title', 'university', 'numPages', 'accessDate'] };
  const items = new Map();
  const disk = new Map();
  const actions = [];
  let saves = 0;
  let failAt = Infinity;
  const zotero = {
    ItemFields: {
      getID: name => typeof name === 'number' ? name : id(name),
      getName: field => typeof field === 'number' ? names[field - 1] : names.includes(field) && field,
      getItemTypeFields: type => types[type].map(id),
      getBaseIDFromTypeAndField: (type, field) => field === id('university') ? id('publisher') : false,
      getFieldIDFromTypeAndBase: (type, field) => type === 2 && field === id('publisher') ? id('university') : false,
      isValidForType: (field, type) => types[type].includes(names[field - 1]),
      isInteger: field => field === id('numPages'),
      isMultiline: field => ['extra', 'abstractNote'].includes(names[field - 1]),
      getLocalizedString: name => name
    },
    Items: { getAsync: async itemID => items.get(itemID) },
    DB: {
      executeTransaction: async fn => {
        const snapshot = structuredClone(disk);
        const previousActions = structuredClone(actions);
        try { await fn(); }
        catch (error) {
          disk.clear();
          for (const [k, v] of snapshot) disk.set(k, v);
          actions.splice(0, actions.length, ...previousActions);
          throw error;
        }
      }
    },
    UndoHistory: { stageAction: (name, args) => actions.push({ name, args }) },
    logError() {}
  };
  function add(itemID, type, values, properties = {}) {
    const item = {
      id: itemID, itemTypeID: type, deleted: false, isFeedItem: false,
      values: { ...values }, regular: true, editable: true,
      isRegularItem() { return this.regular; },
      isEditable() { return this.editable; },
      async loadDataType() {},
      getField(field) { return this.values[names[field - 1]] || ''; },
      setField(field, value) {
        const name = names[field - 1];
        if (this.values[name] === value) return false;
        this.values[name] = value;
        return true;
      },
      async save() {
        if (++saves === failAt) throw new Error('simulated save failure');
        disk.set(this.id, { ...this.values });
      },
      async reload() { this.values = { ...disk.get(this.id) }; },
      ...properties
    };
    items.set(itemID, item);
    disk.set(itemID, { ...values });
    return item;
  }
  return { zotero, add, disk, actions, setFailure: n => { failAt = n; } };
}

test('append preserves content, fills blanks, and follows field newline rules', () => {
  assert.equal(core.append('原文', '新增', 'auto', true), '原文\n新增');
  assert.equal(core.append('原文', '新增', 'auto', false), '原文 新增');
  assert.equal(core.append('', '新增', 'auto', true), '新增');
  assert.equal(core.append('A', 'B\r\nC', 'newline', false), 'A B C');
  assert.equal(core.append('A', 'B\r\nC', 'none', true), 'AB\nC');
  assert.equal(core.append('A\n', 'B', 'auto', true), 'A\nB');
  assert.throws(() => core.append('A', '   '), /请输入/);
  assert.throws(() => core.append('A', 'B', 'invalid'), /未知/);
});

test('prepend supports all separators and preserves the correct content boundary', () => {
  assert.equal(core.append('原文', '新增', 'auto', true, 'start'), '新增\n原文');
  assert.equal(core.append('原文', '新增', 'auto', false, 'start'), '新增 原文');
  assert.equal(core.append('A', 'B', 'space', true, 'start'), 'B A');
  assert.equal(core.append('A', 'B', 'newline', true, 'start'), 'B\nA');
  assert.equal(core.append('A', 'B', 'none', true, 'start'), 'BA');
  assert.equal(core.append('', ' 新增 ', 'auto', true, 'start'), '新增');
  assert.equal(core.append('A', 'B\r\nC', 'newline', false, 'start'), 'B C A');
  assert.equal(core.append('A', 'B\r\nC', 'auto', true, 'start'), 'B\nC\nA');
  assert.equal(core.append('\nA', 'B', 'auto', true, 'start'), 'B\nA');
  assert.equal(core.append(' A', 'B', 'space', false, 'start'), 'B A');
  assert.equal(core.append('A\n', 'B', 'auto', true, 'start'), 'B\nA\n');
  assert.equal(core.append('A', 'B', 'auto', false, 'end'), 'A B');
  assert.throws(() => core.append('A', 'B', 'auto', false, 'invalid'), /未知的添加位置/);
});

test('field picker combines mapped fields and excludes dates with strict formats and integers', () => {
  const f = fixture();
  const items = [f.add(1, 1, {}), f.add(2, 2, {})];
  const fields = core.getFields(f.zotero, items);
  assert.equal(fields[0].name, 'extra');
  assert.equal(fields.find(x => x.name === 'publisher').count, 2);
  assert.equal(fields.find(x => x.name === 'abstractNote').count, 1);
  assert.ok(!fields.some(x => ['university', 'accessDate', 'numPages'].includes(x.name)));
});

test('batch append maps fields, ignores duplicates and skips unavailable items', async () => {
  const f = fixture();
  f.add(1, 1, { publisher: '出版社' });
  f.add(2, 2, { university: '大学' });
  f.add(3, 1, { publisher: '只读' }, { editable: false });
  f.add(4, 1, { publisher: 'PDF' }, { regular: false });
  f.add(5, 1, { publisher: '已删除' }, { deleted: true });
  f.add(6, 1, { publisher: '订阅' }, { isFeedItem: true });
  const result = await core.apply(f.zotero, [1, 2, 1, 3, 4, 5, 6, 99], 'publisher', '新信息');
  assert.deepEqual(result, { updated: 2, unsupported: 0, unavailable: 5, unchanged: 0 });
  assert.equal(f.disk.get(1).publisher, '出版社 新信息');
  assert.equal(f.disk.get(2).university, '大学 新信息');
  assert.equal(f.disk.get(3).publisher, '只读');
  assert.deepEqual(f.actions, [{ name: 'undo-action-edit-metadata', args: { count: 2 } }]);
});

test('batch prepend uses mapped fields, fills blanks and records one undo action', async () => {
  const f = fixture();
  f.add(1, 1, { publisher: '出版社' });
  f.add(2, 2, { university: '大学' });
  f.add(3, 1, {});
  f.add(4, 1, { publisher: '只读' }, { editable: false });
  const result = await core.apply(f.zotero, [1, 2, 3, 4], 'publisher', '新信息', 'auto', 'start');
  assert.deepEqual(result, { updated: 3, unsupported: 0, unavailable: 1, unchanged: 0 });
  assert.equal(f.disk.get(1).publisher, '新信息 出版社');
  assert.equal(f.disk.get(2).university, '新信息 大学');
  assert.equal(f.disk.get(3).publisher, '新信息');
  assert.equal(f.disk.get(4).publisher, '只读');
  assert.deepEqual(f.actions, [{ name: 'undo-action-edit-metadata', args: { count: 3 } }]);
});

test('mixed types skip unsupported fields without stopping valid edits', async () => {
  const f = fixture();
  f.add(1, 1, { abstractNote: '摘要' });
  f.add(2, 2, { extra: '信息' });
  const result = await core.apply(f.zotero, [1, 2], 'abstractNote', '补充');
  assert.equal(result.updated, 1);
  assert.equal(result.unsupported, 1);
  assert.equal(f.disk.get(1).abstractNote, '摘要\n补充');
  assert.equal(f.disk.get(2).extra, '信息');
});

test('both positions roll back persisted data and cached objects without an undo entry on failure', async () => {
  for (const position of ['start', 'end']) {
    const f = fixture();
    const a = f.add(1, 1, { extra: '甲' });
    const b = f.add(2, 1, { extra: '乙' });
    f.setFailure(2);
    await assert.rejects(core.apply(f.zotero, [1, 2], 'extra', '补充', 'auto', position), /simulated/);
    assert.equal(f.disk.get(1).extra, '甲');
    assert.equal(f.disk.get(2).extra, '乙');
    assert.equal(a.values.extra, '甲');
    assert.equal(b.values.extra, '乙');
    assert.deepEqual(f.actions, []);
  }
});

test('empty input never writes and applying to the same selection twice reads latest values', async () => {
  const f = fixture();
  f.add(1, 1, { extra: '甲' });
  await assert.rejects(core.apply(f.zotero, [1], 'extra', '  '), /请输入/);
  assert.equal(f.disk.get(1).extra, '甲');
  await core.apply(f.zotero, [1], 'extra', '乙');
  await core.apply(f.zotero, [1], 'extra', '丙');
  assert.equal(f.disk.get(1).extra, '甲\n乙\n丙');
});

test('repeated prepend reads the latest values and invalid position fails before a transaction', async () => {
  const f = fixture();
  f.add(1, 1, { extra: '甲' });
  await core.apply(f.zotero, [1], 'extra', '乙', 'auto', 'start');
  await core.apply(f.zotero, [1], 'extra', '丙', 'auto', 'start');
  assert.equal(f.disk.get(1).extra, '丙\n乙\n甲');
  f.zotero.DB.executeTransaction = () => assert.fail('invalid position must not start a transaction');
  await assert.rejects(core.apply(f.zotero, [1], 'extra', '丁', 'auto', 'invalid'), /未知的添加位置/);
  assert.equal(f.disk.get(1).extra, '丙\n乙\n甲');
});

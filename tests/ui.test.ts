import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const MANIFEST = JSON.stringify({ name: 'agent-hero', version: '0.1.0', repository: 'https://github.com/owner/repo' })
const start = async ($: Engine, on: On, latest = '0.1.0') => {
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: latest }) } }))
  on('command.register', () => ({ value: { command: 'agent-hero' } }))
  const files = new Map<string, string>()
  on('store.get', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) || [...files.keys()].some(path => path.startsWith(`${e.path}/`)) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? (e.path.endsWith('/.claude-plugin/plugin.json') ? MANIFEST : '') }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path!.length + 1), kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('session.start', () => ({ cwd: '/tmp' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}
const scroll = { offset: 0, bodyRows: 10 }

test('帯にダンジョンとステータスが描かれる', async ($, on) => {
  await start($, on)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: 'agent-hero',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll, view: {} },
    })
    expect(await band.find({ text: 'PWR 0 ' })).toBeDefined()
    await band.unmount()
  }
})

test('/agent-hero のペインにステータスとインベントリが描かれる', async ($, on) => {
  await start($, on)
  for (const surface of SURFACES) {
    const pane = await $.ui.mount({
      plugin: 'agent-hero',
      surface,
      component: 'Pane',
      requestId: 'agent-hero',
      props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
    })
    expect(await pane.find({ text: '攻撃力     5' })).toBeDefined()
    await pane.press({ key: 'tab-tree' })
    expect(JSON.stringify(await pane.drawn({ in: 'tree-view' }))).toContain('T1 のツリー')
    await pane.press({ key: 'tab-inventory' })
    expect(await pane.find({ text: '1/20' })).toBeDefined()
    await pane.press({ key: 'tab-status' })
    await pane.unmount()
  }
})

test('強化ツリーはページをクリックで切り替え (選択中は反転表示)、矢印キーでノードを移動する', async ($, on) => {
  await start($, on)
  const pane = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-hero',
    props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
  })
  await pane.press({ key: 'tab-tree' })
  const text = async () => JSON.stringify(await pane.drawn({ in: 'tree-view' }))
  expect(await text()).toContain('T1 のツリー')
  // 最上段の ' T1 ' ' T2 ' … のうち T2 (5〜8 列目) をクリックする
  await pane.pointer({ type: 'down', button: 'left', x: 5, y: 0, in: 'tree-view' })
  expect(await text()).toContain('T2 のツリー')
  expect(await text()).toContain('足りない: T1')
  await pane.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: 'tree-view' })
  expect(await text()).not.toContain('T2 のページは')
  // 最初のカーソルは起点の隣の取得できるノード。上下左右で盤面を移動できる
  const before = await text()
  await pane.key({ key: 'down', in: 'tree-view' })
  await pane.key({ key: 'down', in: 'tree-view' })
  expect(await text()).not.toBe(before)
  await pane.key({ key: 'up', in: 'tree-view' })
  await pane.key({ key: 'left', in: 'tree-view' })
  await pane.key({ key: 'right', in: 'tree-view' })
  await pane.unmount()
})

test('スキルの画面も矢印キーでスキルを移動できる', async ($, on) => {
  await start($, on)
  const pane = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-hero',
    props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
  })
  await pane.press({ key: 'tab-skill' })
  const text = async () => JSON.stringify(await pane.drawn({ in: 'skill-view' }))
  expect(await text()).toContain('渾身斬り')
  const first = await text()
  await pane.key({ key: 'up', in: 'skill-view' })
  expect(await text()).not.toBe(first)
  await pane.key({ key: 'down', in: 'skill-view' })
  await pane.key({ key: 'left', in: 'skill-view' })
  await pane.key({ key: 'right', in: 'skill-view' })
  await pane.unmount()
})

test('マップのタブで、今の攻略のしかた (自動攻略・周回) と到達した階が出る', async ($, on) => {
  await start($, on)
  const pane = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-hero',
    props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
  })
  await pane.press({ key: 'tab-map' })
  const text = async () => JSON.stringify(await pane.drawn({ in: 'map-view' }))
  expect(await text()).toContain('自動攻略中')
  expect(await text()).toContain('はじまりのダンジョン')
  await pane.unmount()
})

test('設定のタブで言語のボタンが出る', async ($, on) => {
  await start($, on)
  const pane = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-hero',
    props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
  })
  await pane.press({ key: 'tab-settings' })
  expect(await pane.find({ text: '言語' })).toBeDefined()
  expect(await pane.find({ key: 'lang-en' })).toBeDefined()
  expect(await pane.find({ key: 'lang-ja' })).toBeDefined()
  expect(await pane.find({ text: '  v0.1.0' })).toBeDefined()
  expect(await pane.find({ text: '1. ! claude plugin marketplace update agent-hero' })).toBeDefined()
  expect(await pane.find({ text: '3. /reload-plugins' })).toBeDefined()
  await pane.unmount()
})

test('GitHub に新しい版があれば、帯とペインにアップデートがあると出る', async ($, on) => {
  await start($, on, '0.2.0')
  const band = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll, view: {} },
  })
  expect(await band.find({ text: '⬆ アップデートがあります (v0.1.0 → v0.2.0)' })).toBeDefined()
  await band.unmount()
  const pane = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-hero',
    props: { title: 'Agent Hero', isFocused: true, bodyColumns: 60, placement: 'dock', scroll, view: {} },
  })
  expect(await pane.find({ text: '⬆ アップデートがあります (v0.1.0 → v0.2.0)' })).toBeDefined()
  await pane.unmount()
})

test('最新の版で動いていれば、アップデートの表示は出ない', async ($, on) => {
  await start($, on, '0.1.0')
  const band = await $.ui.mount({
    plugin: 'agent-hero',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll, view: {} },
  })
  expect(await band.find({ text: '⬆ アップデートがあります (v0.1.0 → v0.1.0)' })).toBeUndefined()
  await band.unmount()
})

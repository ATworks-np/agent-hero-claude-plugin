import { expect, test } from 'claude-code/testing'

import { TOKENS_PER_MEMORY, dungeonName, itemName } from '../hooks/game'
import { langOf } from '../hooks/i18n'
import { availableNodes } from '../hooks/tree'
import { DRIVER_STALE_MS, applyInboxes, isDriver, newWorld } from '../hooks/world'

test('複数セッションの受信箱のトークンは合算され、同じ分を二重に足さない', async () => {
  const inbox = (tokens: number) => ({ tokens, cmds: [], workingAt: 0 })
  let world = newWorld()
  world = applyInboxes(world, { a: inbox(1000), b: inbox(2000) }, 0)
  expect(world.save.tokens).toBe(3000)
  expect(world.save.memory).toBe(3000 / TOKENS_PER_MEMORY)
  world = applyInboxes(world, { a: inbox(1000), b: inbox(2000) }, 0)
  expect(world.save.tokens).toBe(3000)
  world = applyInboxes(world, { a: inbox(1010), b: inbox(2000) }, 0)
  expect(world.save.tokens).toBe(3010)
})

test('他のセッションで押したノードの取得も取り込まれる', async () => {
  let world = newWorld()
  world = { ...world, save: { ...world.save, memory: 1000 } }
  const node = availableNodes(world.save)[0]!
  world = applyInboxes(world, { b: { tokens: 0, cmds: [{ seq: 1, allocate: node.id }], workingAt: 0 } }, 0)
  expect(world.save.allocated).toEqual([node.id])
})

test('どれかのセッションが作業中なら作業中とみなす', async () => {
  const world = applyInboxes(newWorld(), { a: { tokens: 0, cmds: [], workingAt: 1000 }, b: { tokens: 0, cmds: [], workingAt: 0 } }, 2000)
  expect(world.isWorking).toBe(true)
})

test('駆動役は 1 セッションだけで、止まったら別のセッションが引き継ぐ', async () => {
  const world = { ...newWorld(), driver: { id: 'a', at: 1000 } }
  expect(isDriver(world, 'a', 1500)).toBe(true)
  expect(isDriver(world, 'b', 1500)).toBe(false)
  expect(isDriver(world, 'b', 1000 + DRIVER_STALE_MS + 1)).toBe(true)
})

test('他のセッションで押した装備の変更も取り込まれ、同じコマンドは一度だけ実行される', async () => {
  let world = newWorld()
  world = { ...world, save: { ...world.save, inventory: [...world.save.inventory, { id: 'x', name: '鉄の剣', kind: 'weapon', power: 9, quality: 0 }] } }
  world = applyInboxes(world, { b: { tokens: 0, cmds: [{ seq: 1, equip: 'x' }], workingAt: 0 } }, 0)
  expect(world.save.weapon).toBe('x')
  world = { ...world, save: { ...world.save, weapon: 'i0' } }
  world = applyInboxes(world, { b: { tokens: 0, cmds: [{ seq: 1, equip: 'x' }], workingAt: 0 } }, 0)
  expect(world.save.weapon).toBe('i0')
})

test('他のセッションで押した鍛錬も取り込まれ、結果が全セッションに通知される', async () => {
  let world = newWorld()
  world = { ...world, save: { ...world.save, memory: 1e9 } }
  world = applyInboxes(world, { b: { tokens: 0, cmds: [{ seq: 1, forge: 'weapon' }], workingAt: 0 } }, 0, () => 0)
  expect(world.save.inventory.find(item => item.id === world.save.weapon)?.quality).toBe(1)
  expect(world.events.at(-1)?.text).toContain('鍛錬')
})

test('マップで階を移ると、その階の 1 部屋目からやり直す', async () => {
  let world = newWorld()
  world = { ...world, save: { ...world.save, maxFloor: 12, floor: 12 }, scene: { ...world.scene, room: 3, x: 10 } }
  world = applyInboxes(world, { b: { tokens: 0, cmds: [{ seq: 1, farm: 5 }], workingAt: 0 } }, 0)
  expect(world.save.floor).toBe(5)
  expect(world.scene.room).toBe(1)
  expect(world.scene.x).toBe(0)
})

test('言語のコマンドで共有のセーブの言語が切り替わり、以後の記録と名前がその言語になる', async () => {
  let world = newWorld()
  world = applyInboxes(world, { a: { tokens: 0, cmds: [{ seq: 1, lang: 'en' }], workingAt: 0 } }, 0)
  expect(world.save.lang).toBe('en')
  world = applyInboxes(world, { a: { tokens: 0, cmds: [{ seq: 1, lang: 'en' }, { seq: 2, farm: 1 }], workingAt: 0 } }, 0)
  expect(world.save.log.at(-1)).toBe('Started farming B1F')
  expect(dungeonName(world.save)).toBe('Dungeon of Beginnings')
  expect(itemName(world.save.inventory[0]!, langOf(world.save))).toBe('Wooden Stick')
  world = applyInboxes(world, { a: { tokens: 0, cmds: [{ seq: 3, lang: 'ja' }], workingAt: 0 } }, 0)
  expect(dungeonName(world.save)).toBe('はじまりのダンジョン')
})

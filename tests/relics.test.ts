import { expect, test } from 'claude-code/testing'

import { gainTokens, newSave, newScene, spawnBoss, step, tokenMultiplier, TOKENS_PER_MEMORY } from '../hooks/game'
import { addRelic, affixCount, equipRelic, makeRelic, unequipRelic } from '../hooks/relics'
import { learnSkill } from '../hooks/skills'
import { TREE_NODES, mods, relicSlots, skillPoints } from '../hooks/tree'
import type { Relic, Save } from '../types'

const keystones = (n: number) =>
  Array.from({ length: n }, (_, i) => [...TREE_NODES.values()].find(node => node.tier === i + 1 && node.size === 'keystone')!.id)

test('遺物の付与の数はボスの Tier が 1 なら 2 つで、Tier ごとに 1 つ増える。値は毎回違う', async () => {
  expect(affixCount(1)).toBe(2)
  expect(affixCount(5)).toBe(6)
  let seed = 1
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const a = makeRelic('a', 3, rng)
  const b = makeRelic('b', 3, rng)
  expect(a.affixes.length).toBe(4)
  expect(new Set(a.affixes.map(one => one.key)).size).toBe(4)
  expect(JSON.stringify(a.affixes)).not.toBe(JSON.stringify(b.affixes))
})

test('遺物はボスがまれに落とす', async () => {
  const boss = { ...spawnBoss(10, 6), hp: 1 }
  const scene = { ...newScene(5), phase: 'fight' as const, x: 5, monster: boss, frame: 1 }
  const save: Save = { ...newSave(), floor: 10 }
  expect(step(save, scene, () => 0.01).save.relics?.length).toBe(1)
  expect(step(save, scene, () => 0.99).save.relics ?? []).toEqual([])
})

test('遺物のスロットは強化ツリーで開いたページの数 − 1。付けた遺物の効果は強化ツリーの効果に足される', async () => {
  const relic: Relic = { id: 'r1', name: 'テスト', tier: 1, affixes: [{ key: 'atkPct', value: 0.5 }, { key: 'tokenMult', value: 0.5 }] }
  let save = addRelic(newSave(), relic)
  expect(relicSlots(save)).toBe(0)
  expect(equipRelic(save, 'r1').equippedRelics ?? []).toEqual([])
  save = equipRelic({ ...save, allocated: keystones(1) }, 'r1')
  expect(relicSlots(save)).toBe(1)
  expect(save.equippedRelics).toEqual(['r1'])
  // 取ったキーストーンの効果にも攻撃力 % があるかもしれないので、遺物を外したときとの差で見る
  const bare = { ...save, equippedRelics: [] }
  expect(Math.round((mods(save).atkPct - mods(bare).atkPct) * 1000) / 1000).toBe(0.5)
  // トークン倍率はページの倍率 (×2) に遺物の +0.5 を足して ×2.5
  expect(tokenMultiplier(save)).toBe(2.5)
  expect(gainTokens(save, 10 * TOKENS_PER_MEMORY).memory - save.memory).toBe(25)
})

test('スキルポイントの付いた遺物は SP が増え、スキルに使っていると外せない', async () => {
  const relic: Relic = { id: 'r1', name: 'テスト', tier: 1, affixes: [{ key: 'spBonus', value: 2 }] }
  let save = equipRelic(addRelic({ ...newSave(), allocated: keystones(1) }, relic), 'r1')
  expect(skillPoints(save)).toBe(2)
  save = learnSkill(save, 'slash', skillPoints(save))
  expect(save.spUsed).toBe(1)
  expect(unequipRelic(save, 'r1')).toBe(save)
})

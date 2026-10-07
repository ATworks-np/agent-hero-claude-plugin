import { expect, test } from 'claude-code/testing'
import { BALANCE } from '../config/balance'

import { allocate, maxHp, newSave, newScene, refund, spawn, step } from '../hooks/game'
import {
  SKILLS,
  SKILL_SLOTS,
  canLearn,
  equipSkill,
  freeSp,
  learnCost,
  learnSkill,
  levelOf,
  unequipSkill,
  upgradeCost,
  skillText,
  upgradeSkill,
  refundSkill,
} from '../hooks/skills'
import type { SkillId } from '../hooks/skills'
import { TREE_NODES, mods, skillPoints } from '../hooks/tree'
import type { Monster, Save, Scene } from '../types'

const SP = 100
const rich = (): Save => ({ ...newSave(), memory: 1e6 })
const learnAll = (save: Save, ids: SkillId[]) => ids.reduce((one, id) => learnSkill(one, id, SP), save)
const withSkills = (ids: SkillId[], base: Save = rich()): Save => ids.reduce(equipSkill, learnAll(base, ids))
const fightScene = (monster: Monster, frame: number, heroHits = 0): Scene => ({ ...newScene(), phase: 'fight', x: monster.x - 1, monster, frame, heroHits })
const dummy = (): Monster => ({ ...spawn(1, 6, () => 0.5), hp: 99999, maxHp: 99999 })

test('スキルはすべて発動型で、通常攻撃の代わりに使う攻撃スキルと、攻撃の前に使う補助スキルがある', async () => {
  expect(SKILLS.size).toBe(24)
  const kinds = new Set([...SKILLS.values()].map(skill => skill.kind))
  expect(kinds).toEqual(new Set(['attack', 'support']))
  expect([...SKILLS.values()].every(skill => skill.cooldown(1) > 0)).toBe(true)
})

test('スキルは起点の隣から順に SP で習得でき、習得するほど次の費用が上がる', async () => {
  const save = rich()
  expect(canLearn(save, 'slash')).toBe(true)
  expect(canLearn(save, 'flurry')).toBe(false)
  const after = learnSkill(save, 'slash', SP)
  expect(after.skills).toEqual(['slash'])
  expect(after.spUsed).toBe(1)
  expect(canLearn(after, 'flurry')).toBe(true)
  const six = learnAll(rich(), ['slash', 'flurry', 'berserk', 'ironwall', 'heal', 'plunder'])
  expect(learnCost(six)).toBe(2)
  expect(learnSkill(rich(), 'slash', 0).skills ?? []).toEqual([])
})

test('習得したスキルは SP で Lv5 まで強化でき、セットできるのは 3 つまで', async () => {
  let save = learnAll(rich(), ['slash'])
  for (let level = 1; level < 5; level++) save = upgradeSkill(save, 'slash', SP)
  expect(levelOf(save, 'slash')).toBe(5)
  expect(save.spUsed).toBe(1 + upgradeCost() + upgradeCost() + upgradeCost() + upgradeCost())
  save = learnAll(save, ['flurry', 'ironwall', 'heal'])
  for (const id of ['slash', 'flurry', 'ironwall', 'heal'] as SkillId[]) save = equipSkill(save, id)
  expect(save.equippedSkills).toEqual(['slash', 'flurry', 'ironwall'])
  expect(SKILL_SLOTS).toBe(3)
  expect(unequipSkill(save, 'flurry').equippedSkills).toEqual(['slash', 'ironwall'])
})

test('攻撃スキルは待ち時間が明けると発動し、そのあと待ち時間の間は使わない', async () => {
  const plain = step(rich(), fightScene(dummy(), 1), () => 0.5)
  const save = withSkills(['slash'])
  const first = step(save, fightScene(dummy(), 1), () => 0.5)
  const dealt = (r: typeof plain) => 99999 - r.scene.monster!.hp
  // 端数の丸めで 1〜2 ずれることがある
  expect(Math.abs(dealt(first) - dealt(plain) * 3) <= 2).toBe(true)
  expect(first.scene.flash).toBe('渾身斬り')
  expect(first.save.cooldowns?.slash).toBe(4)
  const again = step(first.save, fightScene(dummy(), 1), () => 0.5)
  expect(dealt(again)).toBe(dealt(plain))
})

test('補助スキル: 鉄壁は攻撃を防ぎ、ヒールは HP が減ったときだけ使う', async () => {
  const strong = { ...dummy(), atk: 25 }
  const walled = step(withSkills(['ironwall']), fightScene(strong, 1), () => 0.5)
  expect(walled.save.buffs?.shield).toBe(2)
  const hit = step(walled.save, { ...walled.scene, frame: 2 }, () => 0.5)
  expect(hit.save.hp).toBe(walled.save.hp)
  const full = step(withSkills(['heal']), fightScene(dummy(), 1), () => 0.5)
  expect(full.save.cooldowns?.heal ?? 0).toBe(0)
  const hurt = withSkills(['heal'])
  const healed = step({ ...hurt, hp: 5 }, fightScene(dummy(), 1), () => 0.5)
  expect(healed.save.hp).toBe(5 + Math.round(maxHp(hurt) * 0.25))
})

test('探索スキル: 強奪をかけると次に倒した敵が必ず装備を落とす', async () => {
  const save = withSkills(['plunder'])
  const before = save.inventory.length
  const r = step(save, fightScene({ ...spawn(1, 6, () => 0.5), hp: 1 }, 1), () => 0.99)
  expect(r.save.inventory.length).toBe(before + 1)
  expect(r.save.buffs?.plunder).toBeUndefined()
})

test('パッシブ効果は強化ツリーの主要ノードが持つ', async () => {
  const passives = [...TREE_NODES.values()].filter(node => node.size === 'notable' && node.name === '受け流し')
  expect(passives.length > 0).toBe(true)
  const save = { ...newSave(), maxFloor: 999, allocated: [passives[0]!.id] }
  expect(mods(save).parry > 0).toBe(true)
})

test('SP は強化ツリーの SP ノードを取ると増え、ノードの多い系統で 3 つ、T1 の 1 本道では 1 つある', async () => {
  const points = (tier: number, branch: string) =>
    [...TREE_NODES.values()].filter(node => node.tier === tier && node.branch === branch && node.size === 'point').length
  expect(points(1, 'def')).toBe(1)
  expect(points(5, 'loot')).toBe(3)
  const ids = [...TREE_NODES.values()].filter(node => node.tier === 1 && node.size === 'point').map(node => node.id)
  const save = { ...newSave(), allocated: ids }
  expect(skillPoints(save)).toBe(4)
  expect(freeSp({ ...save, spUsed: 1 }, skillPoints(save))).toBe(3)
})

test('スキルに使ってしまった SP の元になる SP ノードは払い戻せない', async () => {
  const target = [...TREE_NODES.values()].find(node => node.tier === 1 && node.size === 'point')!
  let save: Save = { ...newSave(), memory: 1e9 }
  for (let i = 0; i < 20 && !save.allocated.includes(target.id); i++) {
    const next = [...TREE_NODES.values()].filter(
      node => node.tier === 1 && !save.allocated.includes(node.id) && node.links.some(link => link.endsWith(':12,12') || save.allocated.includes(link)),
    )
    save = allocate(save, (next.find(node => node.id === target.id) ?? next[0]!).id)
  }
  const leaf = save.allocated.at(-1)!
  const used = learnSkill(save, 'slash', skillPoints(save))
  expect(refund(used, leaf)).toBe(used)
  expect(refund(save, leaf)).not.toBe(save)
})

test('スキルは Backspace で戻せる。Lv2 以上は Lv を下げ、Lv1 は習得を取り消して SP を戻す。先のスキルが切れる取り消しはできない', async () => {
  let save = withSkills(['slash', 'flurry'])
  save = upgradeSkill(save, 'slash', SP)
  const used = save.spUsed!
  const down = refundSkill(save, 'slash')
  expect(levelOf(down, 'slash')).toBe(1)
  expect(down.spUsed).toBe(used - upgradeCost())
  // 渾身斬りを抜くと乱れ斬りが起点から切れるので、習得は取り消せない
  expect(refundSkill(down, 'slash')).toBe(down)
  const leaf = refundSkill(down, 'flurry')
  expect(leaf.skills).toEqual(['slash'])
  expect(leaf.equippedSkills).toEqual(['slash'])
  expect(leaf.spUsed).toBe(used - upgradeCost() - 1)
})

test('雷撃の説明のボスへの割合は、実際のダメージと同じ v × bossRatio になる', async () => {
  const thunder = SKILLS.get('thunder')!
  const p = BALANCE.skills.list.thunder!
  const v = p.base + p.perLevel! * 1
  expect(skillText(thunder, 1, 'ja')).toContain(`ボスには ${Math.round(v * p.bossRatio! * 1000) / 10}%`)
})

import type { Save } from '../types'
import { BALANCE } from '../config/balance'
import { CONTENT } from '../config/content'
import { contentOf, langOf, t } from './i18n'
import type { Lang } from './i18n'

// スキルツリー。1 ページだけの盤面で、起点 S から、習得済みのスキルに隣り合うスキルだけをスキルポイント (SP) で習得できる。
// SP は強化ツリーの SP ノードを取ると増える (tree.ts)。
// スキルはすべて発動型で、セットした SKILL_SLOTS 個を、戦闘中に待ち時間 (クールダウン) が明けて条件を満たしたとき勇者が自動で使う。
// クールダウンは勇者の攻撃の回数で数える。常に効く効果 (パッシブ) は強化ツリーの主要ノードが持つ。
// 習得したスキルは SP を払って Lv MAX_SKILL_LEVEL まで強化でき、Lv が上がるほど効果が大きい。
// 北は攻撃、西は防御、東は回復、南は探索の系統。
// 盤面・名前・説明文は config/content.ts、効果量・待ち時間・費用は config/balance.ts

export const SKILL_SLOTS = BALANCE.skills.slots
export const MAX_SKILL_LEVEL = BALANCE.skills.maxLevel

export type SkillId =
  | 'slash' | 'flurry' | 'behead' | 'berserk' | 'thunder' | 'dragonslayer'
  | 'ironwall' | 'endure' | 'riposte' | 'shieldbash' | 'mirror' | 'intimidate'
  | 'heal' | 'revive' | 'regen' | 'drain' | 'sanctuary' | 'sacrifice'
  | 'plunder' | 'soulhunt' | 'appraise' | 'goldenhand' | 'scent' | 'windfall'

export type SkillBranch = 'atk' | 'def' | 'hp' | 'loot'

// attack は通常攻撃の代わりに使う (1 回の攻撃で 1 つだけ)。support は通常攻撃の前に使い、いくつ重なってもよい
export type SkillKind = 'attack' | 'support'

type SkillDef = {
  id: SkillId
  name: string
  branch: SkillBranch
  kind: SkillKind
  cooldown: (level: number) => number
  text: (level: number) => string
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`

// 効果量 = base + perLevel × Lv + floor(Lv / every)
export const powerAt = (id: SkillId, level: number): number => {
  const p = BALANCE.skills.list[id]!
  return Math.round((p.base + (p.perLevel ?? 0) * level + (p.every ? Math.floor(level / p.every) : 0)) * 1000) / 1000
}
const cooldownAt = (id: SkillId, level: number): number => {
  const p = BALANCE.skills.list[id]!
  return p.cooldown + (p.cooldownPerLevel ?? 0) * level
}

// 説明文の {v} {v%} {cd} {名前} {名前%} を埋める。{boss} は断頭のボスへの倍率、{bossV} は雷撃のボスへの割合 (v × bossRatio)
const describe = (id: SkillId, template: string, level: number): string => {
  const p = BALANCE.skills.list[id]!
  const values: Record<string, number> = { ...p, v: powerAt(id, level), cd: cooldownAt(id, level) }
  if (p.bossBase !== undefined) values.boss = p.bossBase + (p.bossPerLevel ?? 0) * level
  if (p.bossRatio !== undefined) values.bossV = powerAt(id, level) * p.bossRatio
  return template.replace(/\{(\w+)(%?)\}/g, (_, name: string, percent: string) => {
    const value = values[name] ?? 0
    return percent ? pct(value) : String(Math.round(value * 1000) / 1000)
  })
}

const DEFS: Record<string, SkillDef> = Object.fromEntries(
  Object.entries(CONTENT.skills).map(([ch, one]) => {
    const id = one.id as SkillId
    return [
      ch,
      {
        id,
        name: one.name,
        branch: one.branch as SkillBranch,
        kind: one.kind as SkillKind,
        cooldown: (level: number) => cooldownAt(id, level),
        text: (level: number) => describe(id, one.text, level),
      },
    ]
  }),
)

// 言語ごとの名前と説明文。SkillDef の name / text は日本語
export const skillName = (skill: { ch: string }, lang: Lang): string => contentOf(lang).skills[skill.ch]?.name ?? ''
export const skillText = (skill: { id: SkillId; ch: string }, level: number, lang: Lang): string =>
  describe(skill.id, contentOf(lang).skills[skill.ch]?.text ?? '', level)

// ch は盤面の文字 (config/content.ts の skills のキー)。名前と説明文を言語ごとに引くのに使う
export type SkillNode = SkillDef & { ch: string; x: number; y: number; links: SkillId[]; isRoot: boolean }

const parse = () => {
  const grid = CONTENT.skillBoard.replace(/^\n|\n$/g, '').split('\n')
  const at = (x: number, y: number) => grid[y]?.[x] ?? ' '
  const keyAt = new Map<string, string>()
  grid.forEach((line, y) => [...line].forEach((ch, x) => (DEFS[ch] || ch === 'S') && keyAt.set(`${x},${y}`, ch)))
  const links = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, new Set())
    if (!links.has(b)) links.set(b, new Set())
    links.get(a)!.add(b)
    links.get(b)!.add(a)
  }
  for (const pos of keyAt.keys()) {
    const [x, y] = pos.split(',').map(Number) as [number, number]
    if (at(x + 1, y) === '-' && keyAt.has(`${x + 2},${y}`)) link(pos, `${x + 2},${y}`)
    if (at(x, y + 1) === '|' && keyAt.has(`${x},${y + 2}`)) link(pos, `${x},${y + 2}`)
  }
  const nodes = new Map<SkillId, SkillNode>()
  for (const [pos, ch] of keyAt) {
    const def = DEFS[ch]
    if (!def) continue
    const [x, y] = pos.split(',').map(Number) as [number, number]
    const neighbors = [...(links.get(pos) ?? [])]
    nodes.set(def.id, {
      ch,
      ...def,
      x,
      y,
      links: neighbors.map(n => DEFS[keyAt.get(n)!]?.id).filter((id): id is SkillId => id !== undefined),
      isRoot: neighbors.some(n => keyAt.get(n) === 'S'),
    })
  }
  return { grid, nodes }
}

const BOARD = parse()
export const SKILL_GRID = BOARD.grid
export const SKILLS = BOARD.nodes

export const learned = (save: Save): SkillId[] => (save.skills ?? []) as SkillId[]
export const equipped = (save: Save): SkillId[] => (save.equippedSkills ?? []) as SkillId[]
export const levelOf = (save: Save, id: SkillId): number =>
  learned(save).includes(id) ? Math.max(1, save.skillLevels?.[id] ?? 1) : 0

export const skillPower = (save: Save, id: SkillId): number => powerAt(id, levelOf(save, id))

// 習得の費用 (SP) は、それまでに習得した数で決まる。6 つ習得するごとに 1 SP 上がる
export const learnCost = (save: Save): number => 1 + Math.floor(learned(save).length / BALANCE.skills.learnCostStep)
// 強化の費用 (SP) は今の Lv と同じ (Lv1→2 が 1 SP、Lv4→5 が 4 SP)
export const upgradeCost = (): number => BALANCE.skills.upgradeCost
// 使える SP = 強化ツリーで得た SP − スキルに使った SP。得た SP は呼び出し側 (tree.ts の skillPoints) が渡す
export const freeSp = (save: Save, earned: number): number => earned - (save.spUsed ?? 0)

export const canLearn = (save: Save, id: SkillId): boolean => {
  const skill = SKILLS.get(id)
  if (!skill || learned(save).includes(id)) return false
  return skill.isRoot || skill.links.some(link => learned(save).includes(link))
}
export const canUpgrade = (save: Save, id: SkillId): boolean =>
  learned(save).includes(id) && levelOf(save, id) < MAX_SKILL_LEVEL

const withLog = (save: Save, line: string): Save => ({ ...save, log: [...save.log, line].slice(-30) })

export const learnSkill = (save: Save, id: SkillId, earnedSp: number): Save => {
  const skill = SKILLS.get(id)
  const cost = learnCost(save)
  if (!skill || !canLearn(save, id) || freeSp(save, earnedSp) < cost) return save
  return withLog(
    { ...save, spUsed: (save.spUsed ?? 0) + cost, skills: [...learned(save), id] },
    t(langOf(save), 'log.skillLearned', { name: skillName(skill, langOf(save)), cost }),
  )
}

export const upgradeSkill = (save: Save, id: SkillId, earnedSp: number): Save => {
  const skill = SKILLS.get(id)
  if (!skill || !canUpgrade(save, id)) return save
  const level = levelOf(save, id)
  const cost = upgradeCost()
  if (freeSp(save, earnedSp) < cost) return save
  return withLog(
    { ...save, spUsed: (save.spUsed ?? 0) + cost, skillLevels: { ...save.skillLevels, [id]: level + 1 } },
    t(langOf(save), 'log.skillUpgraded', { name: skillName(skill, langOf(save)), level: level + 1, cost }),
  )
}

export const equipSkill = (save: Save, id: SkillId): Save => {
  if (!learned(save).includes(id) || equipped(save).includes(id) || equipped(save).length >= SKILL_SLOTS) return save
  return { ...save, equippedSkills: [...equipped(save), id] }
}

export const unequipSkill = (save: Save, id: SkillId): Save =>
  equipped(save).includes(id) ? { ...save, equippedSkills: equipped(save).filter(one => one !== id) } : save

// 習得済みのスキルと Lv から、今の費用で払ったことになる SP の合計。習得の費用は習得済みの数だけで決まる
const spentSp = (save: Save): number =>
  learned(save).reduce((sum, id, i) => sum + learnCost({ ...save, skills: learned(save).slice(0, i) }) + upgradeCost() * (levelOf(save, id) - 1), 0)

// 旧版のスキル (今の盤面に無い ID) が残っていたら、スキルを全部外して SP を全額戻す。
// 費用の設定が変わって使った SP が今の費用と合わなければ、今の費用で払った額に直す (Backspace で戻す額と揃えるため)
export const pruneSkills = (save: Save): Save => {
  const known = (id: string) => SKILLS.has(id as SkillId)
  if (!learned(save).every(known) || !equipped(save).every(known)) {
    return { ...save, skills: [], equippedSkills: [], skillLevels: {}, spUsed: 0, cooldowns: {}, buffs: {} }
  }
  const spent = spentSp(save)
  return (save.spUsed ?? 0) === spent ? save : { ...save, spUsed: spent }
}

// Backspace で戻す。Lv2 以上なら Lv を 1 つ下げて強化に使った SP を戻し、Lv1 なら習得を取り消して習得に使った SP を戻す。
// 習得の取り消しは、残りの習得済みスキルがすべて起点からつながっている場合だけできる (途中を抜くと先のスキルが浮くため)
export const refundSkill = (save: Save, id: SkillId): Save => {
  const skill = SKILLS.get(id)
  if (!skill || !learned(save).includes(id)) return save
  const level = levelOf(save, id)
  if (level > 1) {
    const amount = upgradeCost()
    return withLog(
      { ...save, spUsed: Math.max(0, (save.spUsed ?? 0) - amount), skillLevels: { ...save.skillLevels, [id]: level - 1 } },
      t(langOf(save), 'log.skillDowngraded', { name: skillName(skill, langOf(save)), level: level - 1, amount }),
    )
  }
  const rest = learned(save).filter(one => one !== id)
  const reached = new Set<SkillId>()
  const queue = rest.filter(one => SKILLS.get(one)!.isRoot)
  for (const one of queue) reached.add(one)
  while (queue.length > 0) {
    for (const link of SKILLS.get(queue.shift()!)!.links) {
      if (!reached.has(link) && rest.includes(link)) (reached.add(link), queue.push(link))
    }
  }
  if (rest.some(one => !reached.has(one))) return save
  const amount = learnCost({ ...save, skills: rest })
  const { [id]: _removed, ...skillLevels } = save.skillLevels ?? {}
  return withLog(
    {
      ...save,
      skills: rest,
      equippedSkills: equipped(save).filter(one => one !== id),
      skillLevels,
      spUsed: Math.max(0, (save.spUsed ?? 0) - amount),
    },
    t(langOf(save), 'log.skillForgotten', { name: skillName(skill, langOf(save)), amount }),
  )
}

export const canRefundSkill = (save: Save, id: SkillId): boolean => refundSkill(save, id) !== save

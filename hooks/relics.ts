import type { Relic, RelicAffix, Save } from '../types'
import { BALANCE } from '../config/balance'
import { CONTENT } from '../config/content'
import { contentOf, langOf, t } from './i18n'
import type { Lang } from './i18n'
import { describeMods, relicSlots, skillPoints } from './tree'
import type { Mods } from './tree'

// 遺物。ボスがまれに落とし、付与効果がランダムに付く。付与の数は落としたボスの Tier が 1 なら 2 つで、Tier が
// 1 上がるごとに 1 つ増える。付けられる数は強化ツリーで開いているページの数 − 1 (tree.ts の relicSlots)。
// 付与効果は強化ツリーの効果 (Mods) と同じ名前で持ち、付けている間は強化ツリーの効果に足される

// 落とす確率・付与効果の候補と基準値・値の幅は config/balance.ts、名前の組み合わせは config/content.ts
export const RELIC_CAP = BALANCE.relic.cap

type Rng = () => number

// 値の幅も遺物ごとに抽選する。基準値に掛ける倍率の下限と上限をそれぞれの範囲から選び、その間で値を引く
const rollFactor = (rng: Rng): number => {
  const [lowMin, lowMax] = BALANCE.relic.factorLow
  const [highMin, highMax] = BALANCE.relic.factorHigh
  const low = lowMin! + rng() * (lowMax! - lowMin!)
  const high = highMin! + rng() * (highMax! - highMin!)
  return low + rng() * (high - low)
}

export const affixCount = (tier: number): number => BALANCE.relic.affixesAtTier1 + (tier - 1)

export const makeRelic = (id: string, tier: number, rng: Rng): Relic => {
  const pool = Object.entries(BALANCE.relic.affixes)
  const affixes: RelicAffix[] = []
  for (let i = 0; i < Math.min(affixCount(tier), pool.length); i++) {
    const [[key, pick]] = pool.splice(Math.floor(rng() * pool.length), 1) as [[string, (typeof pool)[number][1]]]
    const scale = pick.flat ? tier : 1 + BALANCE.relic.pctPerTier * (tier - 1)
    const value = pick.base * scale * rollFactor(rng)
    affixes.push({ key, value: pick.integer ? Math.max(1, Math.round(value)) : Math.round(value * 1000) / 1000 })
  }
  const nameParts: [number, number] = [Math.floor(rng() * CONTENT.relicAdjectives.length), Math.floor(rng() * CONTENT.relicNouns.length)]
  return { id, name: relicName({ name: '', nameParts }, 'ja'), tier, affixes, nameParts }
}

// 言語ごとの名前。nameParts の無い旧形式の遺物は拾ったときの名前のまま
export const relicName = (relic: Pick<Relic, 'name' | 'nameParts'>, lang: Lang): string => {
  if (!relic.nameParts) return relic.name
  const content = contentOf(lang)
  return `${content.relicAdjectives[relic.nameParts[0]] ?? ''}${content.relicNouns[relic.nameParts[1]] ?? ''}`
}

export const relicLines = (relic: Relic, lang: Lang = 'ja'): string[] =>
  relic.affixes.map(affix => describeMods({ [affix.key]: affix.value } as Partial<Mods>, lang))

export const relics = (save: Save): Relic[] => save.relics ?? []
export const equippedRelics = (save: Save): string[] => save.equippedRelics ?? []

const withLog = (save: Save, line: string): Save => ({ ...save, log: [...save.log, line].slice(-30) })

// 遺物を拾う。持てる数を超えたら、付けていない中で一番古いものを手放す
export const addRelic = (save: Save, relic: Relic): Save => {
  let list = [...relics(save), relic]
  while (list.length > RELIC_CAP) {
    const old = list.find(one => !equippedRelics(save).includes(one.id))
    if (!old) break
    list = list.filter(one => one !== old)
  }
  return withLog({ ...save, relics: list }, t(langOf(save), 'log.relicGot', { name: relicName(relic, langOf(save)) }))
}

export const equipRelic = (save: Save, id: string): Save => {
  const relic = relics(save).find(one => one.id === id)
  if (!relic || equippedRelics(save).includes(id) || equippedRelics(save).length >= relicSlots(save)) return save
  return withLog({ ...save, equippedRelics: [...equippedRelics(save), id] }, t(langOf(save), 'log.relicEquipped', { name: relicName(relic, langOf(save)) }))
}

// スキルポイントの付いた遺物は、外すと使える SP がマイナスになる (スキルに使ってしまっている) なら外せない
const keepsSp = (save: Save, next: Save): boolean => skillPoints(next) >= (save.spUsed ?? 0)

export const unequipRelic = (save: Save, id: string): Save => {
  if (!equippedRelics(save).includes(id)) return save
  const next = { ...save, equippedRelics: equippedRelics(save).filter(one => one !== id) }
  return keepsSp(save, next) ? next : save
}

export const discardRelic = (save: Save, id: string): Save => {
  const relic = relics(save).find(one => one.id === id)
  if (!relic) return save
  const next = { ...save, relics: relics(save).filter(one => one.id !== id), equippedRelics: equippedRelics(save).filter(one => one !== id) }
  return keepsSp(save, next) ? withLog(next, t(langOf(save), 'log.relicDiscarded', { name: relicName(relic, langOf(save)) })) : save
}

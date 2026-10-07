import type { BossTrait, Buffs, Item, Monster, Save, Scene } from '../types'
import { BALANCE } from '../config/balance'
import { CONTENT } from '../config/content'
import { contentOf, langOf, t } from './i18n'
import type { Lang } from './i18n'
import { addRelic, makeRelic, relicName } from './relics'
import { SKILLS, equipped, pruneSkills, skillName, skillPower } from './skills'
import type { SkillId } from './skills'
import { TREE_NODES, availableNodes, nodeName, canLevelUp, costOf, countOnPage, isAllocated, isStart, mods, nodeCost, nodeLevel, skillPoints, unlockedPages } from './tree'

export type Rng = () => number
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// 設定値 (config/balance.ts・config/content.ts) のうち、ほかのファイルからもよく使うものに短い名前を付けておく
export const MEMORY = CONTENT.memoryName
export const TOKENS_PER_MEMORY = BALANCE.economy.tokensPerMemory
export const CORRIDOR = BALANCE.dungeon.corridor
export const ROOMS_PER_FLOOR = BALANCE.dungeon.roomsPerFloor
export const INVENTORY_CAP = BALANCE.hero.inventoryCap
export const FLOORS_PER_TIER = BALANCE.dungeon.floorsPerTier
const LOG_CAP = 30

// 1 つの階は ROOMS_PER_FLOOR 個の部屋が続く。部屋の右端は次の部屋への扉で、最後の部屋だけ下り階段。
// ボスの階はボスのいる部屋だけ
// いるダンジョンの名前
export const dungeonName = (save: Save): string => {
  const dungeons = contentOf(langOf(save)).dungeons
  return (dungeons.find(one => one.id === save.dungeon) ?? dungeons[0]!).name
}

// 記録の文を言語に合わせて引く。memory の呼び名は vars に入れなくても埋まる
const say = (save: Pick<Save, 'lang'>, key: Parameters<typeof t>[1], vars: Record<string, string | number> = {}): string =>
  t(langOf(save), key, { memory: contentOf(langOf(save)).memoryName, ...vars })

export const roomsOn = (floor: number): number => (isBossFloor(floor) ? BALANCE.dungeon.bossFloorRooms : ROOMS_PER_FLOOR)

export const tierOf = (floor: number): number => Math.floor((floor - 1) / FLOORS_PER_TIER)
// その Tier の中で何階目か (1〜10)
const floorInTier = (floor: number): number => ((floor - 1) % FLOORS_PER_TIER) + 1
export const isBossFloor = (floor: number): boolean => floor % FLOORS_PER_TIER === 0

const tiered = (names: readonly string[], tier: number): string =>
  tier < names.length ? names[tier]! : `${names[names.length - 1]}+${tier - names.length + 1}`

// 表示上の Tier は 1 から数える (地下 1〜10 階が T1)
// 英語は名前との間を空ける (T1 Orc)
const tierPrefix = (tier: number, lang: Lang = 'ja'): string => `T${tier + 1}${lang === 'en' ? ' ' : ''}`

// 入力・出力・キャッシュ書き込みはそのまま数える。キャッシュ読み込みは毎ステップ
// 会話全体ぶん計上されて他を桁違いに上回るため 1/10 に割り引く。
export const weightedTokens = (u: Usage): number =>
  u.input_tokens +
  u.output_tokens +
  u.cache_creation_input_tokens +
  Math.floor(u.cache_read_input_tokens / BALANCE.economy.cacheReadDivisor)

export const maxHp = (save: Save): number => {
  const m = mods(save)
  return Math.round((BALANCE.hero.baseHp + m.hpFlat) * (1 + m.hpPct))
}

const find = (save: Save, id: string | null): Item | undefined =>
  save.inventory.find(item => item.id === id)

// 割合の増減の合計を倍率にする。キーストーン (狂戦士の防御 -10% など) は別のページでも取れて足し合わさるので、
// マイナスが積み重なっても元の 1/4 より下げない (0 になると敵の攻撃をそのまま受け、数ページで詰む)
const pctScale = (pct: number): number => Math.max(BALANCE.hero.minPctScale, 1 + pct)

// スキル「鬼神化」の攻撃力の上乗せ
const activeAtkBonus = (save: Save): number => (save.buffs?.berserk ? save.buffs.berserk.mult - 1 : 0)

export const attack = (save: Save): number => {
  const m = mods(save)
  // 背水は HP が半分以下のときだけ効く
  const desperate = save.hp <= maxHp(save) * BALANCE.combat.desperateBelow ? m.desperate : 0
  const pct = m.atkPct + desperate + activeAtkBonus(save)
  return Math.max(1, Math.round((BALANCE.hero.baseAtk + m.atkFlat + (find(save, save.weapon)?.power ?? 0)) * pctScale(pct)))
}
export const defense = (save: Save): number => {
  const m = mods(save)
  const pct = m.defPct
  return Math.max(0, Math.round((BALANCE.hero.baseDef + m.defFlat + (find(save, save.armor)?.power ?? 0)) * pctScale(pct)))
}

export const newSave = (): Save => ({
  tokens: 0,
  memory: 0,
  allocated: [],
  hp: BALANCE.hero.baseHp,
  floor: 1,
  maxFloor: 1,
  kills: 0,
  deaths: 0,
  inventory: [{ id: 'i0', name: CONTENT.starterWeapon, kind: 'weapon', power: BALANCE.hero.starterWeaponPower, starter: true }],
  weapon: 'i0',
  armor: null,
  log: [t('ja', 'log.start')],
  nextId: 1,
})

type LegacySave = Partial<Save> & { level?: number; exp?: number; gold?: number; ranks?: { atk: number; def: number; hp: number } }

// 強化ランク制のときの費用。旧セーブの払い戻し額の計算にだけ使う
const legacyRankCost = (rank: number): number => Math.ceil(35 * rank ** 1.5)

// 旧形式のセーブを今の形にそろえる。レベルと強化ランクは、上げるのに要した memory を払い戻してツリーで取り直させる。
// ポーションと結晶は捨てる
export const migrate = (raw: Save): Save => {
  const legacy = raw as LegacySave
  let save = raw
  if (!legacy.allocated) {
    const level = legacy.level ?? 1
    const ranks = legacy.ranks ?? { atk: level, def: level, hp: level }
    let refund = 0
    for (const rank of Object.values(ranks)) for (let r = 1; r < rank; r += 1) refund += legacyRankCost(r)
    const { level: _level, exp: _exp, gold: _gold, ranks: _ranks, ...rest } = legacy
    save = { ...newSave(), ...rest, allocated: [], memory: (legacy.memory ?? 0) + refund } as Save
    save = { ...save, hp: Math.min(save.hp, maxHp(save)) }
  }
  // 1 ページだった頃のノード ID ("x,y") は T1 のページのものとして読む
  if (save.allocated.some(id => !id.includes(':'))) {
    save = { ...save, allocated: save.allocated.map(id => (id.includes(':') ? id : `1:${id}`)) }
  }
  // 盤面の形が変わって無くなったノードは外し、取得に使った分の memory を払い戻す
  const gone = save.allocated.filter(id => !TREE_NODES.has(id))
  if (gone.length > 0) {
    const kept = save.allocated.filter(id => TREE_NODES.has(id))
    let refund = 0
    for (const id of gone) {
      const tier = Number(id.split(':')[0])
      refund += nodeCost(tier, kept.filter(one => one.startsWith(`${tier}:`)).length)
    }
    save = { ...save, allocated: kept, memory: save.memory + refund }
  }
  save = pruneSkills(save)
  const inventory = save.inventory.filter(one => (one.kind as string) !== 'potion')
  return inventory.length === save.inventory.length ? save : { ...save, inventory }
}

export const newScene = (room = 1): Scene => ({ room, x: 0, phase: 'walk', monster: null, wait: 0, frame: 0, hit: null })

const addLog = (save: Save, line: string): Save => ({ ...save, log: [...save.log, line].slice(-LOG_CAP) })

// トークンから得る memory の倍率。強化ツリーのページが 1 つ開くごとに 2 倍になる (T1 だけなら ×1、T2 が開くと ×2)。
// ツリーの値段もページが 1 つ進むごとに 2 倍になるので、どのページにいてもトークンが同じ重みで効く。遺物の付与効果で加算される
export const tokenMultiplier = (save: Save): number =>
  BALANCE.economy.tokenMultiplierPerPage ** (unlockedPages(save) - 1) + mods(save).tokenMult

export const gainTokens = (save: Save, tokens: number): Save => ({
  ...save,
  tokens: save.tokens + tokens,
  memory: save.memory + (tokens / TOKENS_PER_MEMORY) * tokenMultiplier(save),
})

// 取得済みの小ノードに使うと Lv を上げる
export const allocate = (save: Save, id: string): Save => {
  const node = TREE_NODES.get(id)
  if (node && canLevelUp(save, id)) {
    const cost = costOf(save, node)
    if (save.memory < cost) return save
    const level = nodeLevel(save, id) + 1
    const before = maxHp(save)
    const next: Save = { ...save, memory: save.memory - cost, spent: (save.spent ?? 0) + cost, nodeLevels: { ...save.nodeLevels, [id]: level } }
    return addLog({ ...next, hp: Math.max(1, Math.min(maxHp(next), next.hp + maxHp(next) - before)) }, say(save, 'log.nodeLevelUp', { tier: node.tier, name: nodeName(node, langOf(save)), level }))
  }
  if (!node || isStart(id) || !availableNodes(save, node.tier).some(one => one.id === id)) return save
  const cost = costOf(save, node)
  if (save.memory < cost) return save
  const before = maxHp(save)
  const next: Save = { ...save, memory: save.memory - cost, spent: (save.spent ?? 0) + cost, allocated: [...save.allocated, id] }
  // 最大 HP が増えた分は今の HP にも足す
  return addLog({ ...next, hp: Math.max(1, Math.min(maxHp(next), next.hp + maxHp(next) - before)) }, say(save, 'log.nodeTaken', { tier: node.tier, name: nodeName(node, langOf(save)) }))
}

// 取得済みのノードを外して memory を払い戻す。外したあとも、そのページの取得済みノードがすべて起点から
// つながっている場合だけ外せる (途中のノードを抜くと先のノードが浮くため)。
// 払い戻す額は、外したあとに同じページで次に取るときの費用と同じ (費用は取得数だけで決まるため)
// Lv2 以上の小ノードは、外す代わりに Lv を 1 つ下げて、そのページの最後の 1 回分の値段を戻す
export const refund = (save: Save, id: string): Save => {
  const node = TREE_NODES.get(id)
  if (!node || isStart(id) || !save.allocated.includes(id)) return save
  const level = nodeLevel(save, id)
  if (level > 1) {
    const amount = nodeCost(node.tier, countOnPage(save, node.tier) - 1)
    const nodeLevels = { ...save.nodeLevels, [id]: level - 1 }
    const next: Save = { ...save, nodeLevels, memory: save.memory + amount, spent: Math.max(0, (save.spent ?? 0) - amount) }
    return addLog({ ...next, hp: Math.min(next.hp, maxHp(next)) }, say(save, 'log.nodeLevelDown', { tier: node.tier, name: nodeName(node, langOf(save)), level: level - 1, amount }))
  }
  const rest = save.allocated.filter(one => one !== id)
  const onPage = rest.filter(one => TREE_NODES.get(one)?.tier === node.tier)
  const start = [...TREE_NODES.values()].find(one => one.tier === node.tier && isStart(one.id))!
  const reached = new Set([start.id])
  const queue = [start.id]
  while (queue.length > 0) {
    for (const link of TREE_NODES.get(queue.shift()!)!.links) {
      if (!reached.has(link) && onPage.includes(link)) (reached.add(link), queue.push(link))
    }
  }
  if (onPage.some(one => !reached.has(one))) return save
  // SP ノードは、外すと使える SP がマイナスになる (スキルに使ってしまっている) なら外せない
  if (node.size === 'point' && skillPoints({ ...save, allocated: rest }) < (save.spUsed ?? 0)) return save
  const amount = nodeCost(node.tier, countOnPage(save, node.tier) - 1)
  const { [id]: _removed, ...nodeLevels } = save.nodeLevels ?? {}
  const next: Save = { ...save, allocated: rest, nodeLevels, memory: save.memory + amount, spent: Math.max(0, (save.spent ?? 0) - amount) }
  return addLog({ ...next, hp: Math.min(next.hp, maxHp(next)) }, say(save, 'log.nodeRefund', { tier: node.tier, name: nodeName(node, langOf(save)), amount }))
}

export const canRefund = (save: Save, id: string): boolean => refund(save, id) !== save && isAllocated(save, id)

// 敵の強さの伸び方。式と値の意味は config/balance.ts の monster を参照。
// HP を 3 乗で伸ばすのは、浅い階ではほとんど増やさず、深い階で急に増やすため。攻撃力を大きく伸ばすと、勇者は進めるところ
// まで進んだ先で敵の攻撃 1 回で倒され続けるので、壁は主に HP (倒すのに時間がかかる) で作る
const monsterHpScale = (floor: number): number => 1 + ((floor - 1) / BALANCE.monster.hpGrowth) ** 3
const monsterAtkScale = (floor: number): number => 1 + (floor - 1) / BALANCE.monster.atkGrowth
export const monsterDef = (floor: number): number =>
  Math.round((BALANCE.monster.defBase + floor * BALANCE.monster.defPerFloor) * monsterAtkScale(floor))
const monsterHp = (floor: number, mult: number): number =>
  Math.round((BALANCE.monster.hpBase + floor * BALANCE.monster.hpPerFloor) * mult * monsterHpScale(floor))
const monsterAtk = (floor: number, mult: number): number =>
  Math.round((BALANCE.monster.atkBase + floor * BALANCE.monster.atkPerFloor) * mult * monsterAtkScale(floor))

// ダメージの式。攻撃力と防御力の比で決まり、防御力が攻撃力と同じなら半分、2 倍なら 1/3 になる (0 にはならない)。
// 引き算 (攻撃力 − 防御力) だと、両者が近いところで少しの差がダメージを何倍にも変えてしまうため、この形にしている
export const ratioDamage = (atk: number, def: number): number => (atk * atk) / Math.max(1, atk + def)
// ダメージの揺れ (±10%)
const spread = (rng: Rng): number => 1 - BALANCE.combat.spread + rng() * BALANCE.combat.spread * 2

// 各 Tier の 1 階目は弱い方から数種だけ、階を下りるごとに 1 種ずつ増える
const kindsOn = (floor: number): number => Math.min(CONTENT.monsters.length, BALANCE.dungeon.firstFloorKinds - 1 + floorInTier(floor))

const spawnKind = (floor: number, kindIndex: number, x: number): Monster => {
  const kind = CONTENT.monsters[kindIndex] ?? CONTENT.monsters[0]!
  const mult = BALANCE.monster.kinds[kind.id as keyof typeof BALANCE.monster.kinds]
  const hp = monsterHp(floor, mult.hp)
  return {
    name: `${tierPrefix(tierOf(floor))}${kind.name}`,
    kind: kindIndex in CONTENT.monsters ? kindIndex : 0,
    tier: tierOf(floor),
    ch: kind.ch,
    color: kind.color,
    x,
    hp,
    maxHp: hp,
    atk: monsterAtk(floor, mult.atk),
    def: monsterDef(floor),
    isBoss: false,
  }
}

// その階に出うる敵からランダムに 1 体
export const spawn = (floor: number, x: number, rng: Rng): Monster => spawnKind(floor, Math.floor(rng() * kindsOn(floor)), x)

// 階と部屋の番号から決まる乱数。同じ階・同じ部屋は、いつ来ても同じ顔ぶれになる
const fixedRng = (seed: number): Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// 階の特徴: 主に出る敵と次に多い敵。階ごとに固定
export const floorTheme = (floor: number): { main: number; sub: number } => {
  const rng = fixedRng(floor * 7919 + 101)
  const pool = kindsOn(floor)
  const main = Math.floor(rng() * pool)
  const sub = (main + 1 + Math.floor(rng() * (pool - 1))) % pool
  return { main, sub }
}

// マップに出す階の呼び名。ボスの階はボスの名前、ほかは主に出る敵の住処
export const floorFeature = (floor: number, lang: Lang = 'ja'): string => {
  const content = contentOf(lang)
  if (isBossFloor(floor)) {
    const round = Math.floor(floor / FLOORS_PER_TIER) - 1
    return t(lang, 'map.bossRoom', { boss: content.bosses[round % content.bosses.length]!.name })
  }
  const theme = floorTheme(floor)
  const separator = t(lang, 'note.listSeparator')
  return `${content.monsters[theme.main]!.lair} (${content.monsters[theme.main]!.name}${separator}${content.monsters[theme.sub]!.name})`
}

// 言語ごとの敵の名前。番号の無い旧形式の敵は name をそのまま出す
export const monsterName = (monster: Monster, lang: Lang): string => {
  const content = contentOf(lang)
  if (monster.boss !== undefined) {
    const boss = content.bosses[monster.boss % content.bosses.length]!
    return `${content.bossRepeatPrefix.repeat(Math.floor(monster.boss / content.bosses.length))}${boss.name}`
  }
  if (monster.kind !== undefined && monster.tier !== undefined) return `${tierPrefix(monster.tier, lang)}${content.monsters[monster.kind]!.name}`
  return monster.name
}

export const spawnBoss = (floor: number, x: number): Monster => {
  const round = Math.floor(floor / FLOORS_PER_TIER) - 1
  const boss = CONTENT.bosses[round % CONTENT.bosses.length]!
  const stats = BALANCE.monster.bosses[boss.id as keyof typeof BALANCE.monster.bosses]
  const name = `${CONTENT.bossRepeatPrefix.repeat(Math.floor(round / CONTENT.bosses.length))}${boss.name}`
  const hp = monsterHp(floor, stats.hp)
  return {
    name,
    boss: round,
    ch: boss.ch,
    color: boss.color,
    x,
    hp,
    maxHp: hp,
    atk: monsterAtk(floor, stats.atk),
    def: Math.round(monsterDef(floor) * BALANCE.monster.bossDefMult),
    isBoss: true,
    trait: stats.trait as BossTrait,
  }
}

// 部屋に入ったとき、決まった位置に敵を並べる。勇者より手前 (後ろ) の位置には置かない
// 顔ぶれは階の特徴に沿って偏り、主に出る敵・次に多い敵・それ以外がそれぞれ決まった割合で出る
export const populate = (floor: number, room: number, heroX: number): Monster[] => {
  const points = BALANCE.dungeon.spawnPoints
  const rng = fixedRng(floor * 1000 + room)
  const theme = floorTheme(floor)
  const pick = (): number => {
    const r = rng()
    if (r < BALANCE.dungeon.mainKindShare) return theme.main
    if (r < BALANCE.dungeon.mainKindShare + BALANCE.dungeon.subKindShare) return theme.sub
    return Math.floor(rng() * kindsOn(floor))
  }
  return points
    .map((x, i) => (isBossFloor(floor) && room === roomsOn(floor) && i === points.length - 1 ? spawnBoss(floor, x) : spawnKind(floor, pick(), x)))
    .filter(monster => monster.x > heroX)
}

export const bossTitle = (monster: Monster, lang: Lang = 'ja'): string => {
  const bosses = contentOf(lang).bosses
  if (monster.boss !== undefined) return bosses[monster.boss % bosses.length]!.title
  return CONTENT.bosses.find(boss => monster.name.endsWith(boss.name))?.title ?? ''
}

const roll = (rng: Rng, n: number): number => Math.floor(rng() * n)

// 装備の品質。名前と色は config/content.ts、出やすさの比は config/balance.ts
export const QUALITIES = CONTENT.qualities.map((one, i) => ({ ...one, weight: BALANCE.equipment.qualityWeights[i] ?? 0 }))
export const qualityName = (quality: number, lang: Lang): string => contentOf(lang).qualities[quality]?.name ?? ''
export const NOTABLE_QUALITY = BALANCE.equipment.notableQuality

export const qualityOf = (item: Item) => (item.quality === undefined ? null : QUALITIES[item.quality] ?? null)
// 言語ごとの装備の名前。Tier も初期装備の印も無い旧形式の装備は name をそのまま出す
export const itemName = (item: Item, lang: Lang = 'ja'): string => {
  const content = contentOf(lang)
  if (item.starter) return content.starterWeapon
  if (item.tier === undefined) return item.name
  return tiered(item.kind === 'weapon' ? content.weapons : content.armors, item.tier)
}
export const displayName = (item: Item, lang: Lang = 'ja'): string =>
  item.quality === undefined ? itemName(item, lang) : `[${qualityName(item.quality, lang)}] ${itemName(item, lang)}`

const rollQualityOnce = (rng: Rng, min: number): number => {
  const candidates = QUALITIES.slice(min)
  let r = rng() * candidates.reduce((sum, one) => sum + one.weight, 0)
  for (const [i, one] of candidates.entries()) {
    r -= one.weight
    if (r < 0) return min + i
  }
  return QUALITIES.length - 1
}

// 装備の Tier はダンジョンの Tier と同じ。同じ Tier の中でも深い階ほど性能の下限が上がる。
// ボスは次の Tier のレア以上の装備を必ず落とす。
// luckChance は品質を 2 回抽選する確率 (スキル「幸運の星」)。luck が立っていれば必ず 2 回抽選する
export type QualityBonus = { qualityUp: number; luck: boolean; luckChance?: number }

const rollQuality = (rng: Rng, min: number, bonus: QualityBonus): number => {
  let quality = rollQualityOnce(rng, min)
  const isLucky = bonus.luck || ((bonus.luckChance ?? 0) > 0 && rng() < bonus.luckChance!)
  if (isLucky) quality = Math.max(quality, rollQualityOnce(rng, min))
  if (rng() < bonus.qualityUp) quality = Math.min(QUALITIES.length - 1, quality + 1)
  return quality
}

export const makeEquipment = (
  id: string,
  tier: number,
  depth: number,
  rng: Rng,
  minQuality = 0,
  bonus: QualityBonus = { qualityUp: 0, luck: false },
): Item => {
  const quality = rollQuality(rng, minQuality, bonus)
  const scale = qualityScale(quality)
  const kind = rng() < 0.5 ? 'weapon' : 'armor'
  const p = BALANCE.equipment[kind]
  const base = tier * p.perTier + p.base + Math.floor((depth - 1) / p.depthDivisor) + roll(rng, p.roll)
  return { id, name: tiered(kind === 'weapon' ? CONTENT.weapons : CONTENT.armors, tier), kind, power: Math.round(base * scale), quality, tier }
}

const makeLoot = (save: Save, rng: Rng, isBoss: boolean): Item | null => {
  const id = `i${save.nextId}`
  const tier = tierOf(save.floor)
  const m = mods(save)
  const buffs = save.buffs ?? {}
  const bonus: QualityBonus = {
    qualityUp: m.qualityUp,
    // スキル「鑑定」がかかっていれば必ず 2 回抽選する
    luck: m.luck || buffs.appraise === true,
    luckChance: m.luckChance,
  }
  // スキル「黄金の手」は品質の下限を上げる
  const lift = (item: Item): Item => {
    if (!buffs.goldenhand) return item
    const quality = Math.min(QUALITIES.length - 1, (item.quality ?? 0) + buffs.goldenhand)
    return { ...item, quality, power: Math.round((item.power / qualityScale(item.quality ?? 0)) * qualityScale(quality)) }
  }
  if (isBoss) return lift(makeEquipment(id, tier + 1, 1, rng, BALANCE.equipment.bossMinQuality, bonus))
  const dropRate = BALANCE.equipment.dropRate + m.dropRate + (buffs.scent?.pct ?? 0)
  if (!buffs.plunder && rng() >= dropRate) return null
  return lift(makeEquipment(id, tier, floorInTier(save.floor), rng, 0, bonus))
}

// 鍛錬: memory を払って装備中の武器・防具の品質を 1 段上げる。必ず成功する。
// 費用は「1 回あたりの基本の費用 ÷ 上げた先の品質がドロップで出る確率」。確率で成功させていたときに、成功するまでに
// かかる平均の費用と同じにしている (アンコモンへは 25% なので基本の 4 倍、アルティメットへは 0.2% なので 500 倍)
function qualityScale(quality: number): number {
  return 1 + quality * BALANCE.equipment.qualityStep
}
// 1 回あたりの基本の費用。品質を除いた元の性能と今の品質で決まる。分解でもらえる量もこれを元にする
const forgeBaseCost = (item: Item): number => {
  const quality = item.quality ?? 0
  return Math.ceil(BALANCE.equipment.forgeBase * (item.power / qualityScale(quality)) * BALANCE.equipment.forgeGrowth ** quality)
}
// 上げた先の品質がドロップで出る確率
export const forgeRate = (item: Item): number => {
  const total = QUALITIES.reduce((sum, one) => sum + one.weight, 0)
  return (QUALITIES[(item.quality ?? 0) + 1]?.weight ?? 0) / total
}
// bonus は鍛錬の効率 (強化・遺物の「鍛冶の心得」)。0.2 なら費用が 1/1.2 になる
export const forgeCost = (item: Item, bonus = 0): number => Math.ceil(forgeBaseCost(item) / Math.max(1e-9, forgeRate(item) * (1 + bonus)))
export const canForge = (item: Item): boolean => (item.quality ?? 0) < QUALITIES.length - 1

// 分解: 装備していない武器・防具を memory に変える。もらえる量は鍛錬の 1 回あたりの基本の費用の 1/4 (性能と品質が高いほど多い)。
// bonus はスキル「分解の達人」の上乗せ
export const salvageValue = (item: Item, bonus = 0): number =>
  Math.ceil(forgeBaseCost(item) * BALANCE.economy.salvageRatio * (1 + bonus))
export const salvageable = (save: Save): Item[] =>
  save.inventory.filter(item => item.id !== save.weapon && item.id !== save.armor)

// 分解でもらえる memory。スキル「魂狩り」がかかっていれば倍になり、使い切る
const salvageGain = (save: Save, items: Item[]): { gained: number; buffs: Buffs } => {
  const b = save.buffs ?? {}
  const sum = items.reduce((total, item) => total + salvageValue(item, mods(save).salvager), 0)
  return { gained: Math.round(sum * (b.soulhunt ?? 1)), buffs: { ...b, soulhunt: undefined } }
}

export const salvageAll = (save: Save): Save => {
  const items = salvageable(save)
  if (items.length === 0) return save
  const { gained, buffs } = salvageGain(save, items)
  const inventory = save.inventory.filter(item => !items.includes(item))
  return addLog({ ...save, inventory, buffs, memory: save.memory + gained }, say(save, 'log.salvage', { count: items.length, gain: gained }))
}

export type ForgeResult = { save: Save; result: 'success' | 'none'; item?: Item }

export const forge = (save: Save, kind: Item['kind']): ForgeResult => {
  const item = find(save, kind === 'weapon' ? save.weapon : save.armor)
  if (!item || !canForge(item)) return { save, result: 'none' }
  const cost = forgeCost(item, mods(save).smith)
  if (save.memory < cost) return { save, result: 'none' }
  const paid: Save = { ...save, memory: save.memory - cost }
  const quality = (item.quality ?? 0) + 1
  const forged: Item = { ...item, quality, power: Math.round((item.power / qualityScale(item.quality ?? 0)) * qualityScale(quality)) }
  const inventory = paid.inventory.map(one => (one.id === item.id ? forged : one))
  return { save: addLog({ ...paid, inventory }, say(save, 'log.forged', { item: displayName(forged, langOf(save)), cost })), result: 'success', item: forged }
}

export const equip = (save: Save, id: string): Save => {
  const item = find(save, id)
  if (!item) return save
  return addLog(item.kind === 'weapon' ? { ...save, weapon: id } : { ...save, armor: id }, say(save, 'log.equipped', { item: displayName(item, langOf(save)) }))
}

// マップで選んだ階を周回する。行けるのは到達したことのある階まで。選んだ階の 1 部屋目から始め、HP は全回復する
export const farm = (save: Save, floor: number): Save => {
  if (floor < 1 || floor > save.maxFloor) return save
  return addLog({ ...save, farmFloor: floor, floor, hp: maxHp(save) }, say(save, 'log.farmStart', { floor }))
}

// 自動攻略に戻す。到達した一番深い階から先へ進む
export const autoExplore = (save: Save): Save => {
  const { farmFloor: _farm, ...rest } = save
  return addLog({ ...rest, floor: save.maxFloor, hp: maxHp(save) }, say(save, 'log.autoStart', { floor: save.maxFloor }))
}

// 拾った装備が今の装備より強ければ自動で持ち替え、あふれた分は弱い順に分解して memory にする。
const pickUp = (save: Save, item: Item): Save => {
  let next = addLog({ ...save, inventory: [...save.inventory, item], nextId: save.nextId + 1 }, say(save, 'log.picked', { item: displayName(item, langOf(save)) }))
  const slot = item.kind === 'weapon' ? next.weapon : next.armor
  if ((find(next, slot)?.power ?? -1) < item.power) next = equip(next, item.id)
  while (next.inventory.length > INVENTORY_CAP) {
    const weakest = next.inventory
      .filter(one => one.id !== next.weapon && one.id !== next.armor)
      .sort((a, b) => a.power - b.power)[0]
    if (!weakest) break
    const { gained, buffs } = salvageGain(next, [weakest])
    next = { ...next, buffs, inventory: next.inventory.filter(one => one.id !== weakest.id), memory: next.memory + gained }
  }
  return next
}

export type StepResult = { save: Save; scene: Scene; notes: string[] }

export const step = (save: Save, scene: Scene, rng: Rng): StepResult => {
  const notes: string[] = []
  const frame = scene.frame + 1

  if (scene.phase === 'dead' || scene.phase === 'stairs' || scene.phase === 'door') {
    if (scene.wait > 1) return { save, scene: { ...scene, frame, wait: scene.wait - 1 }, notes }
    if (scene.phase === 'dead') return { save, scene: newScene(), notes }
    if (scene.phase === 'door') return { save, scene: newScene((scene.room ?? 1) + 1), notes }
    // 階段で次の階へ降りると HP は全回復する。周回中は同じ階をもう一度回る
    const floor = save.farmFloor ?? save.floor + 1
    const next = addLog(
      { ...save, floor, maxFloor: Math.max(save.maxFloor, floor), hp: maxHp(save) },
      say(save, save.farmFloor ? 'log.farmAgain' : 'log.descend', { floor }),
    )
    if (floor > save.maxFloor) notes.push(say(save, 'note.reached', { floor }))
    return { save: next, scene: newScene(), notes }
  }

  if (scene.phase === 'walk') {
    const x = scene.x + 1
    const room = scene.room ?? 1
    if (x >= CORRIDOR - 1) {
      const phase = room < roomsOn(save.floor) ? 'door' : 'stairs'
      const wait = phase === 'door' ? BALANCE.dungeon.doorWait : BALANCE.dungeon.stairsWait
      return { save, scene: { ...scene, frame, x: CORRIDOR - 1, phase, wait, hit: null }, notes }
    }
    let queue = scene.queue ?? []
    if (!scene.isPopulated) {
      queue = populate(save.floor, room, scene.x)
      const boss = queue.find(one => one.isBoss)
      if (boss) notes.push(say(save, 'note.bossWaiting', { boss: monsterName(boss, langOf(save)), title: bossTitle(boss, langOf(save)) }))
    }
    let monster = scene.monster
    if (!monster && queue[0] && x + 1 >= queue[0].x) {
      monster = queue[0]
      queue = queue.slice(1)
    }
    const phase = monster && x + 1 >= monster.x ? 'fight' : 'walk'
    const regen = mods(save).regen
    const top = maxHp(save)
    const healed = regen > 0 ? { ...save, hp: Math.min(top, save.hp + Math.ceil(top * regen)) } : save
    const heroHits = monster === scene.monster ? scene.heroHits : 0
    return { save: healed, scene: { ...scene, frame, x, monster, phase, hit: null, queue, isPopulated: true, heroHits, flash: undefined }, notes }
  }

  // fight: 1 tick ごとに勇者とモンスターが交互に攻撃する。勇者の番の前に、使えるスキルを発動する
  const monster = scene.monster!
  if (frame % 2 === 0) return heroTurn(save, scene, monster, frame, rng, notes)
  return monsterTurn(save, scene, monster, frame, rng, notes)
}

const clampHp = (save: Save, hp: number): Save => ({ ...save, hp: Math.max(0, Math.min(maxHp(save), Math.round(hp))) })

// 勇者の 1 回分の攻撃のダメージ。mult はスキルの倍率
const heroDamage = (save: Save, monster: Monster, rng: Rng, mult: number, isPowerTurn: boolean): number => {
  const m = mods(save)
  const isCrit = rng() < m.crit
  const base = Math.max(1, ratioDamage(attack(save), monster.def ?? monsterDef(save.floor)) * spread(rng))
  const isDouble = m.double > 0 && rng() < m.double
  const bossBonus = monster.isBoss ? 1 + m.bossDmg : 1
  const raw = Math.round(base * mult * (isCrit ? BALANCE.combat.critMult : 1) * (isPowerTurn ? 1 + m.powerHit : 1) * (isDouble ? 2 : 1) * bossBonus)
  return (monster.trait === 'armor' ? Math.ceil(raw * BALANCE.monster.traits.armor) : raw) + Math.ceil(monster.maxHp * m.bleed)
}

// 勇者の番の始めに、待ち時間とかかっている効果の残りを 1 つ減らす
const tickTurn = (save: Save): Save => {
  const cooldowns = Object.fromEntries(Object.entries(save.cooldowns ?? {}).map(([id, n]) => [id, Math.max(0, n - 1)]))
  const b = save.buffs ?? {}
  const left = <T extends { turns: number }>(one: T | undefined) => (one && one.turns > 1 ? { ...one, turns: one.turns - 1 } : undefined)
  const buffs: Buffs = {
    ...b,
    berserk: left(b.berserk),
    weaken: left(b.weaken),
    mirror: left(b.mirror),
    regen: left(b.regen),
    endure: b.endure && b.endure > 1 ? b.endure - 1 : undefined,
    invuln: b.invuln && b.invuln > 1 ? b.invuln - 1 : undefined,
  }
  let next: Save = { ...save, cooldowns, buffs }
  if (b.regen) next = clampHp(next, next.hp + maxHp(next) * b.regen.pct)
  return next
}

// スキルごとの値 (config/balance.ts の skills.list)
const sp = (id: SkillId, key: string): number => BALANCE.skills.list[id]?.[key] ?? 0

// 発動する条件。HP の割合などで、今使っても意味が無いときは使わない
const isReady = (id: SkillId, save: Save, monster: Monster): boolean => {
  const ratio = save.hp / maxHp(save)
  const b = save.buffs ?? {}
  switch (id) {
    case 'behead':
      return monster.isBoss || monster.hp <= monster.maxHp * skillPower(save, 'behead')
    case 'dragonslayer':
      return monster.isBoss
    case 'endure':
      return ratio < sp('endure', 'below') && !b.endure
    case 'heal':
      return ratio < sp('heal', 'below')
    case 'revive':
      return ratio < sp('revive', 'below')
    case 'regen':
      return ratio < sp('regen', 'below') && !b.regen
    case 'sanctuary':
      return ratio < sp('sanctuary', 'below')
    case 'sacrifice':
      return ratio > sp('sacrifice', 'above')
    case 'ironwall':
      return !b.shield
    case 'riposte':
      return !b.riposte
    case 'berserk':
      return !b.berserk
    case 'mirror':
      return !b.mirror
    case 'intimidate':
      return !b.weaken
    case 'plunder':
      return !b.plunder
    case 'soulhunt':
      return !b.soulhunt
    case 'appraise':
      return !b.appraise
    case 'goldenhand':
      return !b.goldenhand
    case 'scent':
      return !b.scent
    default:
      return true
  }
}

// 補助スキルの効果をかける
const support = (id: SkillId, save: Save): Save => {
  const v = skillPower(save, id)
  const b = save.buffs ?? {}
  const top = maxHp(save)
  switch (id) {
    case 'berserk':
      return { ...save, buffs: { ...b, berserk: { turns: sp('berserk', 'turns'), mult: v } } }
    case 'ironwall':
      return { ...save, buffs: { ...b, shield: v } }
    case 'endure':
      return { ...save, buffs: { ...b, endure: v } }
    case 'riposte':
      return { ...save, buffs: { ...b, riposte: v } }
    case 'mirror':
      return { ...save, buffs: { ...b, mirror: { turns: sp('mirror', 'turns'), pct: v } } }
    case 'intimidate':
      return { ...save, buffs: { ...b, weaken: { turns: sp('intimidate', 'turns'), pct: v } } }
    case 'heal':
      return clampHp(save, save.hp + top * v)
    case 'revive':
      return clampHp(save, top)
    case 'regen':
      return { ...save, buffs: { ...b, regen: { turns: sp('regen', 'turns'), pct: v } } }
    case 'sanctuary':
      return clampHp({ ...save, buffs: { ...b, invuln: sp('sanctuary', 'turns') } }, save.hp + top * v)
    case 'plunder':
      return { ...save, buffs: { ...b, plunder: true } }
    case 'soulhunt':
      return { ...save, buffs: { ...b, soulhunt: v } }
    case 'appraise':
      return { ...save, buffs: { ...b, appraise: true } }
    case 'goldenhand':
      return { ...save, buffs: { ...b, goldenhand: v } }
    case 'scent':
      return { ...save, buffs: { ...b, scent: { kills: sp('scent', 'kills'), pct: v } } }
    case 'windfall':
      return { ...save, memory: save.memory + save.floor * v }
    default:
      return save
  }
}

const heroTurn = (save: Save, scene: Scene, monster: Monster, frame: number, rng: Rng, notes: string[]): StepResult => {
  let next = tickTurn(save)
  let target = monster
  const cast: string[] = []
  const startCooldown = (id: SkillId) => {
    next = { ...next, cooldowns: { ...next.cooldowns, [id]: SKILLS.get(id)!.cooldown(Math.max(1, next.skillLevels?.[id] ?? 1)) } }
    cast.push(skillName(SKILLS.get(id)!, langOf(save)))
  }
  const ready = (id: SkillId) => (next.cooldowns?.[id] ?? 0) === 0 && isReady(id, next, target)

  for (const id of equipped(next)) {
    if (SKILLS.get(id)?.kind !== 'support' || !ready(id)) continue
    next = support(id, next)
    startCooldown(id)
  }

  const heroHits = (scene.heroHits ?? 0) + 1
  const isPowerTurn = mods(next).powerHit > 0 && heroHits % BALANCE.combat.powerHitEvery === 0
  const attackSkill = equipped(next).find(id => SKILLS.get(id)?.kind === 'attack' && ready(id))
  let damage = 0
  let killed = false
  if (attackSkill) {
    const v = skillPower(next, attackSkill)
    switch (attackSkill) {
      case 'slash':
        damage = heroDamage(next, target, rng, v, isPowerTurn)
        break
      case 'flurry':
        for (let i = 0; i < sp('flurry', 'hits'); i++) damage += heroDamage(next, target, rng, v, isPowerTurn)
        break
      case 'behead':
        if (target.isBoss) damage = heroDamage(next, target, rng, sp('behead', 'bossBase') + sp('behead', 'bossPerLevel') * (next.skillLevels?.behead ?? 1), isPowerTurn)
        else killed = true
        break
      case 'thunder':
        damage = Math.ceil(target.maxHp * v * (target.isBoss ? sp('thunder', 'bossRatio') : 1))
        break
      case 'dragonslayer':
        damage = heroDamage(next, target, rng, v, isPowerTurn)
        break
      case 'shieldbash':
        damage = heroDamage(next, target, rng, 1, isPowerTurn)
        target = { ...target, stun: v }
        break
      case 'drain':
        damage = heroDamage(next, target, rng, v, isPowerTurn)
        next = clampHp(next, next.hp + damage * sp('drain', 'heal'))
        break
      case 'sacrifice':
        next = clampHp(next, next.hp * (1 - sp('sacrifice', 'hpCost')))
        damage = heroDamage(next, target, rng, v, isPowerTurn)
        break
      default:
        break
    }
    startCooldown(attackSkill)
  } else {
    damage = heroDamage(next, target, rng, 1, isPowerTurn)
  }

  const m = mods(next)
  if (m.lifesteal > 0) next = clampHp(next, next.hp + Math.ceil(damage * m.lifesteal))
  let hp = target.hp - damage
  const isExecuted = hp > 0 && !target.isBoss && m.execute > 0 && hp <= target.maxHp * m.execute
  const flash = cast.length > 0 ? cast.join(' ') : undefined
  if (cast.length > 0) next = addLog(next, say(next, 'log.cast', { names: cast.join(say(next, 'note.listSeparator')) }))
  if (killed || hp <= 0 || isExecuted) {
    const r = defeat(next, scene, target, frame, rng, notes)
    return { ...r, scene: { ...r.scene, flash } }
  }
  // 再生するボスは受けたダメージの 2 割を取り戻す。最大 HP の割合で回復させると、勇者の 1 撃がそれを下回ったとき
  // 永久に倒せなくなる (強化しても届くまでその先へ一切進めない) ため
  if (target.trait === 'regen') hp = Math.min(target.maxHp, hp + Math.ceil(damage * BALANCE.monster.traits.regen))
  return { save: next, scene: { ...scene, frame, monster: { ...target, hp }, hit: 'monster', heroHits, flash }, notes }
}

const monsterTurn = (save: Save, scene: Scene, monster: Monster, frame: number, rng: Rng, notes: string[]): StepResult => {
  // 盾打ちで動けない間は攻撃してこない
  if (monster.stun && monster.stun > 0) {
    return { save, scene: { ...scene, frame, monster: { ...monster, stun: monster.stun - 1 }, hit: null, flash: undefined }, notes }
  }
  const b = save.buffs ?? {}
  const pm = mods(save)
  // double はボスの 3 回に 1 回の攻撃が 2 倍、drain は与えたダメージの半分を回復する
  const isHeavy = monster.trait === 'double' && frame % BALANCE.monster.traits.doubleEvery === 1
  const isParried = pm.parry > 0 && rng() < pm.parry
  const isBlocked = (b.invuln ?? 0) > 0 || (b.shield ?? 0) > 0
  const will = save.hp < maxHp(save) * BALANCE.combat.willBelow ? pm.will : 0
  const bulwark = monster.isBoss ? pm.bulwark : 0
  const weaken = b.weaken?.pct ?? 0
  const atk = monster.atk * (1 - weaken)
  const rawDamage = Math.max(1, Math.round(ratioDamage(atk, defense(save)) * spread(rng))) * (isHeavy ? 2 : 1)
  const damage = isParried || isBlocked ? 0 : Math.max(1, Math.ceil(rawDamage * (1 - will) * (1 - bulwark)))
  let next: Save = { ...save, buffs: { ...b, shield: b.shield && !b.invuln ? b.shield - 1 || undefined : b.shield } }
  let hp = save.hp - damage
  // 不屈がかかっている間は HP 1 より減らない
  if (hp <= 0 && b.endure) hp = 1
  if (hp <= 0 && pm.undying && save.undyingFloor !== save.floor) {
    hp = 1
    next = addLog({ ...next, undyingFloor: save.floor }, say(save, 'log.undying'))
  }
  if (hp > 0) {
    let monsterHp = monster.trait === 'drain' ? Math.min(monster.maxHp, monster.hp + Math.ceil(damage * BALANCE.monster.traits.drain)) : monster.hp
    next = { ...next, hp }
    if (isHeavy && damage > 0) next = addLog(next, say(save, 'log.heavy', { monster: monsterName(monster, langOf(save)), damage }))
    if (damage > 0 && pm.counter > 0 && rng() < pm.counter) monsterHp -= Math.ceil(attack(save) * BALANCE.combat.counterRatio)
    monsterHp -= Math.ceil(damage * pm.thorns)
    // 迎撃は次に受けた攻撃のダメージを倍にして返す。反射結界は受けたダメージの一部を返す
    if (damage > 0 && b.riposte) {
      monsterHp -= Math.ceil(damage * b.riposte)
      next = { ...next, buffs: { ...next.buffs, riposte: undefined } }
    }
    if (b.mirror) monsterHp -= Math.ceil(damage * b.mirror.pct)
    if (monsterHp <= 0) return defeat(next, scene, monster, frame, rng, notes)
    return { save: next, scene: { ...scene, frame, monster: { ...monster, hp: monsterHp }, hit: damage > 0 ? 'hero' : null, flash: undefined }, notes }
  }
  // 倒されたら同じ階の 1 部屋目からやり直す (dead の待ちが終わると newScene で 1 部屋目に戻る)。かかっている効果は消える
  next = addLog(
    { ...save, hp: maxHp(save), deaths: save.deaths + 1, buffs: {} },
    say(save, 'log.defeated', { monster: monsterName(monster, langOf(save)), floor: save.floor }),
  )
  notes.push(say(save, 'note.defeated', { monster: monsterName(monster, langOf(save)) }))
  return { save: next, scene: { ...scene, frame, phase: 'dead', wait: BALANCE.dungeon.deathWait, hit: null, flash: undefined }, notes }
}

// 敵を倒したあとの処理: 討伐数とドロップ。倒したときに効くパッシブとスキルの効果もここで使い切る
const defeat = (save: Save, scene: Scene, monster: Monster, frame: number, rng: Rng, notes: string[]): StepResult => {
  const km = mods(save)
  const b = save.buffs ?? {}
  const top = maxHp(save)
  const hp = km.firstaid > 0 ? Math.min(top, save.hp + Math.ceil(top * km.firstaid)) : save.hp
  let next = addLog({ ...save, hp, kills: save.kills + 1 }, say(save, 'log.killed', { monster: monsterName(monster, langOf(save)) }))
  if (monster.isBoss) notes.push(say(save, 'note.bossKilled', { monster: monsterName(monster, langOf(save)) }))
  // ボスはまれに遺物を落とす。付与の数はそのボスの階の Tier で決まる
  if (monster.isBoss && rng() < BALANCE.relic.dropRate) {
    const relic = makeRelic(`r${next.nextId}`, tierOf(save.floor) + 1, rng)
    next = addRelic({ ...next, nextId: next.nextId + 1 }, relic)
    notes.push(say(save, 'log.relicGot', { name: relicName(relic, langOf(save)) }))
  }
  const loot = makeLoot(next, rng, monster.isBoss)
  // 撃破とドロップで使い切る効果を外す。宝の匂いは残りの体数を減らす
  const scent = b.scent && b.scent.kills > 1 ? { ...b.scent, kills: b.scent.kills - 1 } : undefined
  const used: Buffs = { ...next.buffs, plunder: undefined, scent }
  next = { ...next, buffs: loot ? { ...used, appraise: undefined, goldenhand: undefined } : used }
  if (loot) {
    next = pickUp(next, loot)
    if ((loot.quality ?? 0) >= NOTABLE_QUALITY) notes.push(say(next, 'note.got', { item: displayName(loot, langOf(next)) }))
    else if (loot.id === (loot.kind === 'weapon' ? next.weapon : next.armor)) notes.push(say(next, 'note.equipped', { item: displayName(loot, langOf(next)) }))
  }
  return { save: next, scene: { ...scene, frame, monster: null, phase: 'walk', hit: null, heroHits: 0 }, notes }
}

export type Cell = { ch: string; color: string; bold?: boolean }

const FLOOR_COLOR = '#585858'

export const corridorCells = (scene: Scene, floor: number): Cell[] => {
  const cells: Cell[] = Array.from({ length: CORRIDOR }, () => ({ ch: '.', color: FLOOR_COLOR }))
  cells[CORRIDOR - 1] =
    (scene.room ?? 1) < roomsOn(floor) ? { ch: '+', color: '#d7af5f', bold: true } : { ch: '>', color: '#5fd7ff', bold: true }
  for (const waiting of scene.queue ?? []) cells[waiting.x] = { ch: waiting.ch, color: waiting.color, bold: true }
  const m = scene.monster
  if (m) cells[m.x] = { ch: scene.hit === 'monster' ? '*' : m.ch, color: scene.hit === 'monster' ? '#ffffff' : m.color, bold: true }
  if (scene.phase === 'dead') cells[scene.x] = { ch: '+', color: '#8a8a8a', bold: true }
  else cells[scene.x] = { ch: scene.hit === 'hero' ? '*' : '@', color: scene.hit === 'hero' ? '#ff5f5f' : '#ffd700', bold: true }
  return cells
}

// 同じ色が続くセルを 1 つの Text にまとめ、描画する要素数を減らす。
export const runs = (cells: Cell[]): Cell[] =>
  cells.reduce<Cell[]>((out, cell) => {
    const last = out[out.length - 1]
    if (last && last.color === cell.color && !!last.bold === !!cell.bold) last.ch += cell.ch
    else out.push({ ...cell })
    return out
  }, [])

export const bar = (value: number, max: number, width: number): string => {
  const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

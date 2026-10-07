import type { Save } from '../types'
import { BALANCE } from '../config/balance'
import { CONTENT } from '../config/content'
import { contentOf, langOf, t } from './i18n'
import type { Lang } from './i18n'

// 強化ツリーの盤面。起点 S から、取得済みのノードに隣り合うノードだけを memory で取得できる。
// 北は攻撃、西は防御、東は体力と吸収、南は探索とボス討伐の系統で、各系統のいちばん深いノードがキーストーン。
// ツリーは T1〜T10 の 10 ページあり、ページの T が上がるほど効果と費用が大きい。
// 盤面の形はページごとに決まった乱数の種から作るので、ページごとに違い、同じページはいつも同じ形になる。
// どのページも 4 系統あり、T が上がるほど系統が深く (起点から遠く) なり、枝分かれも増える。
// T1 は枝分かれの無い 1 本道。
// ページ Tn で新しくノードを取れるのは、T1〜T(n-1) のすべてのページでキーストーンを取っているときだけ。T1 はいつでも取れる。
// キーストーンを戻すと、それより後のページは取ってあるノードを残したまま、新しくは取れなくなる。

export type Mods = {
  atkFlat: number
  atkPct: number
  defFlat: number
  defPct: number
  hpFlat: number
  hpPct: number
  crit: number
  lifesteal: number
  regen: number
  dropRate: number
  qualityUp: number
  bossDmg: number
  luck: boolean
  noRegen: boolean
  // ここから下は、戦闘中に条件や確率で効くパッシブ効果
  powerHit: number
  double: number
  execute: number
  bleed: number
  parry: number
  will: number
  counter: number
  thorns: number
  bulwark: number
  firstaid: number
  desperate: number
  undying: boolean
  smith: number
  salvager: number
  luckChance: number
  // ここから下は遺物だけが持つ効果。トークン倍率への加算と、スキルポイントの加算
  tokenMult: number
  spBonus: number
}

export type Branch = 'start' | 'atk' | 'def' | 'hp' | 'loot'
export type NodeSize = 'start' | 'small' | 'notable' | 'keystone' | 'point'

type NodeDef = { name: string; branch: Branch; size: NodeSize; mods: Partial<Mods> }

// ノードの名前・系統・種類は config/content.ts、効果は config/balance.ts
const DEFS: Record<string, NodeDef> = Object.fromEntries(
  Object.entries(CONTENT.treeNodes).map(([ch, one]) => [
    ch,
    { name: one.name, branch: one.branch as Branch, size: one.size as NodeSize, mods: (BALANCE.tree.nodes[ch] ?? {}) as Partial<Mods> },
  ]),
)

// ch は盤面の文字 (config/content.ts の treeNodes のキー)。名前を言語ごとに引くのに使う
export type TreeNode = NodeDef & { id: string; ch: string; tier: number; x: number; y: number; links: string[]; text: string }

export const PAGES = BALANCE.tree.pages
const ARM_ORDER: Branch[] = ['def', 'atk', 'hp', 'loot']
export const armsOnPage = (_tier: number): Branch[] => ARM_ORDER

export const nodeId = (tier: number, key: string): string => `${tier}:${key}`

const PCT_KEYS = new Set<keyof Mods>([
  'atkPct', 'defPct', 'hpPct', 'crit', 'lifesteal', 'regen', 'dropRate', 'qualityUp', 'bossDmg',
  'powerHit', 'double', 'execute', 'bleed', 'parry', 'will', 'counter', 'thorns', 'bulwark',
  'firstaid', 'desperate', 'smith', 'salvager', 'luckChance',
])

// 固定値はページの T 倍、割合はページの T が 1 上がるごとに 25% ずつ大きくする。キーストーンはどのページも同じ効果
const scaleMods = (def: NodeDef, tier: number): Partial<Mods> => {
  if (def.size === 'keystone') return def.mods
  const scaled: Partial<Mods> = {}
  for (const [key, value] of Object.entries(def.mods) as [keyof Mods, number | boolean][]) {
    if (typeof value === 'boolean') (scaled[key] as boolean) = value
    else (scaled[key] as number) = PCT_KEYS.has(key) ? Math.round(value * (1 + BALANCE.tree.pctPerTier * (tier - 1)) * 1000) / 1000 : value * tier
  }
  return scaled
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`
const signed = (text: string, value: number) => `${text} ${value >= 0 ? '+' : ''}`

export const describeMods = (m: Partial<Mods>, lang: Lang = 'ja'): string => modLines(m, lang).join(lang === 'en' ? ', ' : '、')

export const modLines = (m: Partial<Mods>, lang: Lang = 'ja'): string[] => {
  const parts: string[] = []
  const line = (key: Parameters<typeof t>[1], v: number | string, extra: Record<string, string | number> = {}) =>
    parts.push(t(lang, key, { v, ...extra }))
  const combat = BALANCE.combat
  if (m.atkFlat) parts.push(`${signed(t(lang, 'mod.atk'), m.atkFlat)}${m.atkFlat}`)
  if (m.atkPct) parts.push(`${signed(t(lang, 'mod.atk'), m.atkPct)}${pct(m.atkPct)}`)
  if (m.defFlat) parts.push(`${signed(t(lang, 'mod.def'), m.defFlat)}${m.defFlat}`)
  if (m.defPct) parts.push(`${signed(t(lang, 'mod.def'), m.defPct)}${pct(m.defPct)}`)
  if (m.hpFlat) parts.push(`${signed(t(lang, 'mod.hp'), m.hpFlat)}${m.hpFlat}`)
  if (m.hpPct) parts.push(`${signed(t(lang, 'mod.hp'), m.hpPct)}${pct(m.hpPct)}`)
  if (m.crit) line('mod.crit', pct(m.crit))
  if (m.lifesteal) line('mod.lifesteal', pct(m.lifesteal))
  if (m.regen) line('mod.regen', pct(m.regen))
  if (m.noRegen) parts.push(t(lang, 'mod.noRegen'))
  if (m.dropRate) line('mod.dropRate', pct(m.dropRate))
  if (m.qualityUp) line('mod.qualityUp', pct(m.qualityUp))
  if (m.luck) parts.push(t(lang, 'mod.luck'))
  if (m.bossDmg) line('mod.bossDmg', pct(m.bossDmg))
  if (m.powerHit) line('mod.powerHit', pct(m.powerHit), { every: combat.powerHitEvery })
  if (m.double) line('mod.double', pct(m.double))
  if (m.execute) line('mod.execute', pct(m.execute))
  if (m.bleed) line('mod.bleed', pct(m.bleed))
  if (m.parry) line('mod.parry', pct(m.parry))
  if (m.will) line('mod.will', pct(m.will), { below: pct(combat.willBelow) })
  if (m.counter) line('mod.counter', pct(m.counter), { ratio: pct(combat.counterRatio) })
  if (m.thorns) line('mod.thorns', pct(m.thorns))
  if (m.bulwark) line('mod.bulwark', pct(m.bulwark))
  if (m.firstaid) line('mod.firstaid', pct(m.firstaid))
  if (m.desperate) line('mod.desperate', pct(m.desperate), { below: pct(combat.desperateBelow) })
  if (m.undying) parts.push(t(lang, 'mod.undying'))
  if (m.smith) line('mod.smith', pct(m.smith))
  if (m.salvager) line('mod.salvager', pct(m.salvager))
  if (m.luckChance) line('mod.luckChance', pct(m.luckChance))
  if (m.tokenMult) line('mod.tokenMult', Math.round(m.tokenMult * 100) / 100)
  if (m.spBonus) line('mod.spBonus', m.spBonus)
  return parts
}

// 盤面はノードを置くマス目 (GRID_W × GRID_H) の上に作る。1 マスは横 X_STEP 文字・縦 Y_STEP 行で描き、
// マスの間の文字に `-` と `|` を置いてつながりを描く。
const GRID_W = 13
const GRID_H = 13
const CENTER = 6
// 斜めのつながりを使うか。使うときは斜め線が隣のノードとのちょうど中間に来るよう、横の間隔を 2 文字にする
const ALLOW_DIAGONAL = true
const X_STEP = ALLOW_DIAGONAL ? 2 : 3
const Y_STEP = 2
const START_KEY = `${CENTER * X_STEP},${CENTER * Y_STEP}`
export const isStart = (id: string): boolean => id.endsWith(`:${START_KEY}`)

const ARM_STEPS: Record<string, [number, number]> = { atk: [0, -1], def: [-1, 0], hp: [1, 0], loot: [0, 1] }
const NEIGHBORS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const DIAGONALS: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]]
const STEPS: [number, number][] = ALLOW_DIAGONAL ? [...NEIGHBORS, ...DIAGONALS] : NEIGHBORS
// 線の文字。斜めは右下がりが `\`、右上がりが `/`
const LINE_CHARS = new Set(['-', '|', '\\', '/'])

// 起点から見て、その系統の向きの三角形の範囲だけを使う。斜めの境目はどの系統も使わない
const inArm = (arm: Branch, gx: number, gy: number): boolean => {
  const dx = gx - CENTER
  const dy = gy - CENTER
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false
  if (arm === 'atk') return dy < 0 && Math.abs(dx) < -dy
  if (arm === 'loot') return dy > 0 && Math.abs(dx) < dy
  if (arm === 'def') return dx < 0 && Math.abs(dy) < -dx
  return dx > 0 && Math.abs(dy) < dx
}

// ページごとに同じ形を作るための乱数 (mulberry32)
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// 系統ごとの、小ノード・主要ノード・キーストーンの候補 (DEFS の文字)
const ARM_KINDS = CONTENT.treeArms

// 1 系統の幹の長さ (起点からの深さ) と、幹から生やす枝のノード数。T1 は枝なしの 1 本道で、
// T が上がるほど幹が伸び、枝のノードも増える (T2 で幹の 2 割、T10 で幹と同じ数ほど)
export const armDepth = (tier: number): number => BALANCE.tree.trunkBase + tier
export const armBranches = (tier: number): number =>
  tier === 1 ? 0 : Math.round(armDepth(tier) * Math.min(1, BALANCE.tree.branchPerTier * tier))
export const armSize = (tier: number): number => armDepth(tier) + armBranches(tier)

type GridNode = { gx: number; gy: number; depth: number; parent: string | null; ch: string }

// 2 つのマスをつなぐ線の、真ん中の文字の位置 (盤面の文字座標)
const midpoint = (ax: number, ay: number, bx: number, by: number) => `${(ax + bx) * X_STEP / 2},${(ay + by) * Y_STEP / 2}`

// 系統の根 (起点の隣) から、まず幹を最も深いノードから伸ばして深さの目安まで育て、そのあと途中のノードから枝を生やす。
// 新しいノードは、つなぐ相手以外のノードと縦横に隣り合わない場所にだけ置く (線の無い隣り合わせで見間違えないように)。
// 斜め隣は許す (斜め隣まで禁じると置ける場所が足りず、T10 で目安の半分ほどしか置けない)。
// 線の真ん中の文字が他の線と重なる場所 (斜め線同士の交差) にはつながない
const growArm = (arm: Branch, tier: number, rng: () => number, taken: Map<string, GridNode>, lines: Set<string>) => {
  const [sx, sy] = ARM_STEPS[arm]!
  const key = (gx: number, gy: number) => `${gx},${gy}`
  const root: GridNode = { gx: CENTER + sx, gy: CENTER + sy, depth: 1, parent: key(CENTER, CENTER), ch: '' }
  const nodes = [root]
  taken.set(key(root.gx, root.gy), root)
  lines.add(midpoint(CENTER, CENTER, root.gx, root.gy))
  const isFree = (gx: number, gy: number, from: GridNode) =>
    inArm(arm, gx, gy) &&
    !taken.has(key(gx, gy)) &&
    !lines.has(midpoint(from.gx, from.gy, gx, gy)) &&
    NEIGHBORS.every(([nx, ny]) => {
      const other = taken.get(key(gx + nx, gy + ny))
      return other === undefined || other === from
    })
  for (let guard = 0; nodes.length < armSize(tier) && guard < 2000; guard += 1) {
    const maxDepth = Math.max(...nodes.map(node => node.depth))
    const deepest = nodes.filter(node => node.depth === maxDepth)
    // 幹が目安の深さに届くまでは必ず先端から伸ばす。幹の先端が行き止まりになったら、そこで幹を打ち切って枝に移る
    const isTrunk = maxDepth < armDepth(tier) && guard < 200
    const base = isTrunk ? deepest[Math.floor(rng() * deepest.length)]! : nodes[Math.floor(rng() * nodes.length)]!
    const options = STEPS.map(([nx, ny]) => [base.gx + nx, base.gy + ny] as const).filter(([gx, gy]) => isFree(gx, gy, base))
    if (options.length === 0) continue
    const [gx, gy] = options[Math.floor(rng() * options.length)]!
    const node: GridNode = { gx, gy, depth: base.depth + 1, parent: key(base.gx, base.gy), ch: '' }
    nodes.push(node)
    taken.set(key(gx, gy), node)
    lines.add(midpoint(base.gx, base.gy, gx, gy))
  }

  // いちばん深いノードをキーストーン、深さ 4 ごとのノードと、深さ 4 以上の行き止まりの半分ほどを主要ノードにする
  const kinds = ARM_KINDS[arm]!
  const maxDepth = Math.max(...nodes.map(node => node.depth))
  const keystone = nodes.filter(node => node.depth === maxDepth)[0]!
  const parents = new Set(nodes.map(node => node.parent))
  for (const node of nodes) {
    const isLeaf = !parents.has(key(node.gx, node.gy))
    if (node === keystone) node.ch = kinds.keystone
    else if (node.depth % 4 === 0 || (isLeaf && node.depth >= 4 && rng() < 0.5)) node.ch = kinds.notable[Math.floor(rng() * kinds.notable.length)]!
    else node.ch = kinds.small[Math.floor(rng() * kinds.small.length)]!
  }
  // 根とキーストーンを除いたノードを浅い順に並べ、均等な間隔で SP ノードにする。1 系統に 3 つまで、
  // ノードが少ない系統 (T1 など) では 3 つに 1 つの割合にして、能力の上がるノードを残す
  const candidates = nodes.filter(node => node !== keystone && node.depth > 1).sort((a, b) => a.depth - b.depth)
  const count = Math.max(1, Math.min(BALANCE.tree.spNodesPerArm, Math.floor(candidates.length / 3)))
  const picks = new Set(Array.from({ length: count }, (_, i) => Math.floor((candidates.length * (i + 1)) / (count + 1))))
  for (const i of picks) {
    const node = candidates[Math.min(i, candidates.length - 1)]
    if (node) node.ch = kinds.point
  }
}

// ページの盤面を文字の行として作る。文字の読み方は parseBoard が決める
const drawBoard = (tier: number): string[] => {
  const rng = seeded(tier * 7919 + 17)
  const taken = new Map<string, GridNode>()
  taken.set(`${CENTER},${CENTER}`, { gx: CENTER, gy: CENTER, depth: 0, parent: null, ch: 'S' })
  const lines = new Set<string>()
  for (const arm of armsOnPage(tier)) growArm(arm, tier, rng, taken, lines)
  const grid = Array.from({ length: (GRID_H - 1) * Y_STEP + 1 }, () => Array.from({ length: (GRID_W - 1) * X_STEP + 1 }, () => ' '))
  for (const node of taken.values()) {
    grid[node.gy * Y_STEP]![node.gx * X_STEP] = node.ch
    if (node.parent === null) continue
    const [px, py] = node.parent.split(',').map(Number) as [number, number]
    if (py === node.gy) {
      for (let x = Math.min(px, node.gx) * X_STEP + 1; x < Math.max(px, node.gx) * X_STEP; x += 1) grid[node.gy * Y_STEP]![x] = '-'
    } else if (px === node.gx) {
      for (let y = Math.min(py, node.gy) * Y_STEP + 1; y < Math.max(py, node.gy) * Y_STEP; y += 1) grid[y]![node.gx * X_STEP] = '|'
    } else {
      // 斜めは真ん中の 1 文字だけ。左上と右下を結ぶ線が `\`
      const [mx, my] = midpoint(px, py, node.gx, node.gy).split(',').map(Number) as [number, number]
      grid[my]![mx] = (node.gx - px) * (node.gy - py) > 0 ? '\\' : '/'
    }
  }
  return grid.map(row => row.join(''))
}

// 文字 1 つが 1 ノードで、`-` `|` `\\` `/` がノード同士のつながり
const parseBoard = (grid: string[]) => {
  const at = (x: number, y: number) => grid[y]?.[x] ?? ' '
  const cells = new Map<string, NodeDef & { ch: string; key: string; x: number; y: number; links: string[] }>()
  grid.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      const def = DEFS[ch]
      if (def) cells.set(`${x},${y}`, { ...def, ch, key: `${x},${y}`, x, y, links: [] })
    }),
  )
  const link = (a: string, b: string) => {
    cells.get(a)?.links.push(b)
    cells.get(b)?.links.push(a)
  }
  for (const cell of cells.values()) {
    let x = cell.x + 1
    while (at(x, cell.y) === '-') x += 1
    if (x > cell.x + 1 && cells.has(`${x},${cell.y}`)) link(cell.key, `${x},${cell.y}`)
    let y = cell.y + 1
    while (at(cell.x, y) === '|') y += 1
    if (y > cell.y + 1 && cells.has(`${cell.x},${y}`)) link(cell.key, `${cell.x},${y}`)
    if (at(cell.x + 1, cell.y + 1) === '\\' && cells.has(`${cell.x + 2},${cell.y + 2}`)) link(cell.key, `${cell.x + 2},${cell.y + 2}`)
    if (at(cell.x - 1, cell.y + 1) === '/' && cells.has(`${cell.x - 2},${cell.y + 2}`)) link(cell.key, `${cell.x - 2},${cell.y + 2}`)
  }
  return cells
}

const TREE_GRIDS = new Map<number, string[]>()

const buildNodes = () => {
  const nodes = new Map<string, TreeNode>()
  for (let tier = 1; tier <= PAGES; tier += 1) {
    const grid = drawBoard(tier)
    TREE_GRIDS.set(tier, grid)
    for (const cell of parseBoard(grid).values()) {
      const mods = scaleMods(cell, tier)
      nodes.set(nodeId(tier, cell.key), {
        ch: cell.ch,
        name: cell.name,
        branch: cell.branch,
        size: cell.size,
        mods,
        id: nodeId(tier, cell.key),
        tier,
        x: cell.x,
        y: cell.y,
        links: cell.links.map(key => nodeId(tier, key)),
        text: cell.size === 'point' ? t('ja', 'tree.spNode') : describeMods(mods),
      })
    }
  }
  return nodes
}

export const TREE_NODES = buildNodes()
export const treeGrid = (tier: number): string[] => TREE_GRIDS.get(tier) ?? []

export const isPageUnlocked = (save: Save, tier: number): boolean => {
  if (tier < 1 || tier > PAGES) return false
  for (let before = 1; before < tier; before += 1) if (!hasKeystone(save, before)) return false
  return true
}
export const unlockedPages = (save: Save): number => {
  let tier = 1
  while (tier < PAGES && isPageUnlocked(save, tier + 1)) tier += 1
  return tier
}
// 遺物を付けられるスロットの数 = 開いているページの数 − 1 (T1 だけなら 0)
export const relicSlots = (save: Save): number => unlockedPages(save) - 1

// まだ開いていないページの、開く条件の説明
export const unlockText = (save: Save, tier: number): string => {
  const missing = Array.from({ length: tier - 1 }, (_, i) => i + 1).filter(before => !hasKeystone(save, before))
  const lang = langOf(save)
  return t(lang, 'tree.locked', { tier, missing: missing.map(one => `T${one}`).join(t(lang, 'note.listSeparator')) })
}

// そのページで何回目の買い物かで費用が決まる。取るほど次が高くなり、ページの T が 1 上がるごとに 2 倍になる
export const nodeCost = (tier: number, countOnPage: number): number =>
  Math.ceil(BALANCE.tree.baseCost * BALANCE.tree.pageCostMult ** (tier - 1) * (countOnPage + 1) ** BALANCE.tree.costExponent)
// そのページで買った回数。小ノードの Lv 上げも 1 回と数える (Lv 上げで値段が上がらないと、同じ値段で効果を 5 倍にできてしまう)
export const countOnPage = (save: Save, tier: number): number =>
  save.allocated.filter(id => id.startsWith(`${tier}:`)).reduce((sum, id) => sum + Math.max(1, save.nodeLevels?.[id] ?? 1), 0)
export const costOf = (save: Save, node: TreeNode): number => nodeCost(node.tier, countOnPage(save, node.tier))

export const isAllocated = (save: Save, id: string): boolean => isStart(id) || save.allocated.includes(id)

// キーストーンは 1 ページに 1 つまで。すでに取っているページでは、ほかのキーストーンは取れない
export const hasKeystone = (save: Save, tier: number): boolean =>
  save.allocated.some(id => {
    const node = TREE_NODES.get(id)
    return node?.tier === tier && node.size === 'keystone'
  })

export const availableNodes = (save: Save, tier?: number): TreeNode[] =>
  [...TREE_NODES.values()].filter(
    node =>
      (tier === undefined || node.tier === tier) &&
      isPageUnlocked(save, node.tier) &&
      !isAllocated(save, node.id) &&
      !(node.size === 'keystone' && hasKeystone(save, node.tier)) &&
      node.links.some(link => isAllocated(save, link)),
  )

// 小ノードは取得後に Lv MAX_NODE_LEVEL まで上げられ、効果が Lv 倍になる。費用は同じページで次に取るノードと同じ
export const MAX_NODE_LEVEL = BALANCE.tree.maxNodeLevel
export const nodeLevel = (save: Save, id: string): number =>
  save.allocated.includes(id) ? Math.max(1, save.nodeLevels?.[id] ?? 1) : 0
// Lv をかけた効果の説明
export const nodeText = (node: TreeNode, level: number, lang: Lang = 'ja'): string => {
  if (node.size === 'point') return t(lang, 'tree.spNode')
  const times = node.size === 'small' ? Math.max(1, level) : 1
  const scaled: Partial<Mods> = {}
  for (const [key, value] of Object.entries(node.mods) as [keyof Mods, number | boolean][]) {
    ;(scaled[key] as number | boolean) = typeof value === 'number' ? Math.round(value * times * 1000) / 1000 : value
  }
  return describeMods(scaled, lang)
}

export const nodeName = (node: TreeNode, lang: Lang): string => contentOf(lang).treeNodes[node.ch]?.name ?? node.name

export const canLevelUp = (save: Save, id: string): boolean =>
  TREE_NODES.get(id)?.size === 'small' && nodeLevel(save, id) >= 1 && nodeLevel(save, id) < MAX_NODE_LEVEL

export const pageNodes = (tier: number): TreeNode[] => [...TREE_NODES.values()].filter(node => node.tier === tier)

// 強化ツリーで得たスキルポイント (取得済みの SP ノードの数)
// SP ノードの数に、付けている遺物のスキルポイントを足す
export const skillPoints = (save: Save): number =>
  save.allocated.filter(id => TREE_NODES.get(id)?.size === 'point').length + Math.floor(mods(save).spBonus)


// 効果の合計は取得済みノードの配列とノードの Lv だけで決まるので、どちらも同じあいだは計算し直さない。
// 戦闘中は 1 歩ごとに何度も呼ばれるため。返す値は呼び出し側で書き換えない
// 付けている遺物の効果も含める。遺物の付け外しと入手で配列が変わるので、それも見る
type ModsKey = { levels: Save['nodeLevels']; relics: Save['relics']; equipped: Save['equippedRelics']; mods: Mods }
const modsCache = new WeakMap<readonly string[], ModsKey>()

export const mods = (save: Save): Mods => {
  const cached = modsCache.get(save.allocated)
  if (cached && cached.levels === save.nodeLevels && cached.relics === save.relics && cached.equipped === save.equippedRelics) {
    return cached.mods
  }
  const total = computeMods(save)
  modsCache.set(save.allocated, { levels: save.nodeLevels, relics: save.relics, equipped: save.equippedRelics, mods: total })
  return total
}

const computeMods = (save: Save): Mods => {
  const total: Mods = {
    atkFlat: 0, atkPct: 0, defFlat: 0, defPct: 0, hpFlat: 0, hpPct: 0, crit: 0,
    lifesteal: 0, regen: 0, dropRate: 0, qualityUp: 0, bossDmg: 0, luck: false, noRegen: false,
    powerHit: 0, double: 0, execute: 0, bleed: 0, parry: 0, will: 0, counter: 0, thorns: 0, bulwark: 0,
    firstaid: 0, desperate: 0, undying: false, smith: 0, salvager: 0, luckChance: 0,
    tokenMult: 0, spBonus: 0,
  }
  for (const id of save.allocated) {
    const node = TREE_NODES.get(id)
    if (!node) continue
    const level = nodeLevel(save, id)
    for (const [key, value] of Object.entries(node.mods) as [keyof Mods, number | boolean][]) {
      if (typeof value === 'boolean') (total[key] as boolean) ||= value
      else (total[key] as number) += value * level
    }
  }
  // スロットが減った (キーストーンを戻した) ときは、先に付けたものからスロットの数だけ効く
  const active = (save.equippedRelics ?? []).slice(0, relicSlots(save))
  for (const relic of save.relics ?? []) {
    if (!active.includes(relic.id)) continue
    for (const affix of relic.affixes) (total[affix.key as keyof Mods] as number) += affix.value
  }
  if (total.noRegen) total.regen = 0
  const caps = BALANCE.caps
  total.crit = Math.min(caps.crit, total.crit)
  // 確率と軽減は上限を設ける (積み重ねると 100% を超えて敵の攻撃を一切受けなくなるため)
  total.double = Math.min(caps.double, total.double)
  total.execute = Math.min(caps.execute, total.execute)
  total.parry = Math.min(caps.parry, total.parry)
  total.will = Math.min(caps.will, total.will)
  total.counter = Math.min(caps.counter, total.counter)
  total.bulwark = Math.min(caps.bulwark, total.bulwark)
  total.firstaid = Math.min(caps.firstaid, total.firstaid)
  total.luckChance = Math.min(caps.luckChance, total.luckChance)
  return total
}

// 1 K = 1,000。memory は桁が大きくなるので K / M / G で縮めて表示する
export const formatAmount = (value: number): string => {
  const n = Math.floor(value)
  for (const [unit, size] of [['G', 1e9], ['M', 1e6], ['K', 1e3]] as const) {
    // 四捨五入すると 9,999 が 10.0K になるため切り捨てる
    if (n >= size) return n < size * 10 ? `${Math.floor((n / size) * 10) / 10}${unit}` : `${Math.floor(n / size)}${unit}`
  }
  return String(n)
}

export type TreeCell = { ch: string; color: string; bold?: boolean }

const BRANCH_COLORS: Record<Branch, string> = {
  start: '#ffd700',
  atk: '#ff8787',
  def: '#87afff',
  hp: '#87d787',
  loot: '#ffd75f',
}
const GLYPHS: Record<NodeSize, string> = { start: 'S', small: 'o', notable: 'O', keystone: 'X', point: '+' }
const LOCKED = '#4e4e4e'

// 線の文字がつないでいる両端のノード。両方取得済みなら線も明るく描く
const edgeEnds = (tier: number, x: number, y: number, ch: string): [string, string] | null => {
  const grid = treeGrid(tier)
  const [dx, dy] = ch === '-' ? [1, 0] : ch === '|' ? [0, 1] : ch === '\\' ? [1, 1] : [-1, 1]
  const walk = (sign: number) => {
    let cx = x
    let cy = y
    while (grid[cy]?.[cx] === ch) {
      cx += dx * sign
      cy += dy * sign
    }
    return nodeId(tier, `${cx},${cy}`)
  }
  const a = walk(-1)
  const b = walk(1)
  return TREE_NODES.has(a) && TREE_NODES.has(b) ? [a, b] : null
}

export const treeCells = (save: Save, tier: number): TreeCell[][] => {
  const available = new Set(availableNodes(save, tier).map(node => node.id))
  return treeGrid(tier).map((line, y) =>
    [...line].map((ch, x): TreeCell => {
      const node = TREE_NODES.get(nodeId(tier, `${x},${y}`))
      if (node) {
        const color = isAllocated(save, node.id) ? BRANCH_COLORS[node.branch] : available.has(node.id) ? '#ffffff' : LOCKED
        return { ch: GLYPHS[node.size], color, bold: isAllocated(save, node.id) || available.has(node.id) }
      }
      if (LINE_CHARS.has(ch)) {
        const ends = edgeEnds(tier, x, y, ch)
        // そのページに無い系統へつながる線は描かない
        if (ends === null) return { ch: ' ', color: LOCKED }
        const isLit = ends.every(id => isAllocated(save, id))
        return { ch, color: isLit ? '#bcbcbc' : LOCKED }
      }
      return { ch: ' ', color: LOCKED }
    }),
  )
}

export const branchColor = (branch: Branch): string => BRANCH_COLORS[branch]

// そのページに無い系統の分だけ空いた行を詰める。rowOf は盤面の行番号から詰めたあとの行番号への対応
export const compactTreeCells = (save: Save, tier: number): { rows: TreeCell[][]; rowOf: Map<number, number> } => {
  const rowOf = new Map<number, number>()
  const rows: TreeCell[][] = []
  treeCells(save, tier).forEach((row, y) => {
    if (row.every(cell => cell.ch === ' ')) return
    rowOf.set(y, rows.length)
    rows.push(row)
  })
  return { rows, rowOf }
}

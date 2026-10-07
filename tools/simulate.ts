// ゲームの進み方のシミュレーション。平均的なトークン使用量で遊び続けたとき、何日でどこまで届くかを見る。
//
// 実行: tools/simulate.sh --tokens 13000000 --hours 8 --days 60
//
// 前提 (引数で変えられる):
//   --tokens  作業する日 1 日あたりの使用トークン (キャッシュ読み込みを 1/10 にした値)。既定は直近の実績の中央値
//   --hours   作業する日にセッションを開いている時間 (既定 6)。勇者はセッションが開いている間だけ進む
//   --days    何日分 (暦日) 回すか。土日は作業しない (トークンも使わず、勇者も止まる)
//   --seed    乱数の種
//   --set     config/balance.ts の値を書き換えて試す。何度でも指定できる (例: --set monster.hpGrowth=14 --set equipment.minibossDropRate=0.6)
// 遊び方 (このスクリプトが自動で行う):
//   - memory が貯まり次第、強化ツリーの開いているページで一番安いものから取る。同じ値段ならキーストーン (次のページが開く)、
//     新しいノード、小ノードの Lv 上げの順
//   - SP が貯まり次第、スキルを決めた順で習得し、渾身斬り・ヒール・鉄壁をセットして強化する
//   - インベントリが埋まったら装備していない装備を一括分解する。鍛錬はしない
//   - 遺物はスロットが空いていれば手に入れた順に付ける

// node で動かすので process はある (型定義を入れずに済むようここで宣言する)
declare const process: { argv: string[] }

import { INVENTORY_CAP, TOKENS_PER_MEMORY, allocate, attack, defense, gainTokens, maxHp, newSave, newScene, salvageAll, step } from '../hooks/game'
import type { Rng } from '../hooks/game'
import { canUpgrade, equipSkill, equipped, freeSp, learnCost, learnSkill, learned, levelOf, upgradeCost, upgradeSkill } from '../hooks/skills'
import type { SkillId } from '../hooks/skills'
import { equipRelic } from '../hooks/relics'
import { TREE_NODES, availableNodes, canLevelUp, costOf, countOnPage, mods, skillPoints, unlockedPages } from '../hooks/tree'
import { BALANCE } from '../config/balance'
import type { Save, Scene } from '../types'

const arg = (name: string, fallback: number): number => {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? Number(process.argv[at + 1]) : fallback
}

const TOKENS_PER_DAY = arg('tokens', 13_000_000)
const HOURS_PER_DAY = arg('hours', 6)
const DAYS = arg('days', 60)
const STEP_SECONDS = 0.5
const STEPS_PER_DAY = Math.round((HOURS_PER_DAY * 3600) / STEP_SECONDS)

const seeded = (seed: number): Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rng = seeded(arg('seed', 1))
// --set a.b.c=値 で BALANCE の値を書き換える。書き換えた値は最初に表示する
const overrides: string[] = []
process.argv.forEach((one, i) => {
  if (one !== '--set') return
  const [path, raw] = (process.argv[i + 1] ?? '').split('=')
  const keys = (path ?? '').split('.')
  let target = BALANCE as unknown as Record<string, unknown>
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>
  const last = keys.at(-1)!
  if (target === undefined || !(last in target)) throw new Error(`config/balance.ts に ${path} はない`)
  target[last] = JSON.parse(raw ?? '')
  overrides.push(`${path}=${raw}`)
})

const SKILL_ORDER: SkillId[] = ['slash', 'heal', 'ironwall', 'flurry', 'regen', 'riposte', 'plunder', 'soulhunt']
const EQUIP: SkillId[] = ['slash', 'heal', 'ironwall']

const buyNodes = (save: Save): Save => {
  for (;;) {
    const rank = (id: string) => (TREE_NODES.get(id)?.size === 'keystone' ? 0 : save.allocated.includes(id) ? 2 : 1)
    const candidates = [...availableNodes(save), ...save.allocated.filter(id => canLevelUp(save, id)).map(id => TREE_NODES.get(id)!)]
    const pick = candidates
      .map(node => ({ node, cost: costOf(save, node) }))
      .sort((a, b) => a.cost - b.cost || rank(a.node.id) - rank(b.node.id))[0]
    if (!pick || save.memory < pick.cost) return save
    const next = allocate(save, pick.node.id)
    if (next === save) return save
    save = next
  }
}

const useSp = (save: Save): Save => {
  const earned = skillPoints(save)
  for (;;) {
    const sp = freeSp(save, earned)
    const upgrade = EQUIP.find(id => learned(save).includes(id) && canUpgrade(save, id) && upgradeCost() <= sp)
    const learn = SKILL_ORDER.find(id => !learned(save).includes(id))
    let next = save
    if (learn && learnCost(save) <= sp && (EQUIP.includes(learn) || EQUIP.every(id => levelOf(save, id) >= 5))) {
      next = learnSkill(save, learn, earned)
    } else if (upgrade) {
      next = upgradeSkill(save, upgrade, earned)
    }
    for (const id of EQUIP) if (!equipped(next).includes(id)) next = equipSkill(next, id)
    if (next === save) return save
    save = next
  }
}

// memory の出どころの累計 (トークン・分解・それ以外 = 敵を倒した分)
const income = { tokens: 0, salvage: 0 }
let save: Save = newSave()
// HP が満タンの状態から、敵の 1 回の攻撃で倒された回数 (その日の分)
let oneShots = 0
let scene: Scene = newScene()
const milestones: string[] = []
const seen = new Set<string>()
const mark = (key: string, text: string, day: number) => {
  if (seen.has(key)) return
  seen.add(key)
  milestones.push(`${String(day).padStart(3)} 日目  ${text}`)
}

console.log(`config/balance.ts から変えた値: ${overrides.length > 0 ? overrides.join(' ') : 'なし'}`)
console.log(`前提: 作業日 1 日 ${(TOKENS_PER_DAY / 1e6).toFixed(1)}M トークン (= ${Math.round(TOKENS_PER_DAY / TOKENS_PER_MEMORY).toLocaleString()} memory)、セッション ${HOURS_PER_DAY} 時間 (${STEPS_PER_DAY.toLocaleString()} 歩)、土日休み`)
console.log('日数  階   最深  T頁 ノード SP スキルLv          攻撃  防御  最大HP 武器              memory   撃破   死亡  1撃死')

for (let day = 1; day <= DAYS; day++) {
  const isWeekend = day % 7 === 6 || day % 7 === 0
  if (!isWeekend) {
    // トークンは作業時間にならして入る。100 歩ごとにまとめて足す
    const perChunk = (TOKENS_PER_DAY / STEPS_PER_DAY) * 100
    for (let i = 0; i < STEPS_PER_DAY; i++) {
      if (i % 100 === 0) {
        const before = save.memory
        save = gainTokens(save, perChunk)
        income.tokens += save.memory - before
        save = useSp(buyNodes(save))
        for (const relic of save.relics ?? []) save = equipRelic(save, relic.id)
      }
      const wasFull = save.hp >= maxHp(save)
      const r = step(save, scene, rng)
      if (wasFull && r.scene.phase === 'dead' && scene.phase === 'fight') oneShots += 1
      save = r.save
      scene = r.scene
      if (save.inventory.length >= INVENTORY_CAP) {
        const before = save.memory
        save = salvageAll(save)
        income.salvage += save.memory - before
      }
      const tier = Math.floor((save.maxFloor - 1) / 10) + 1
      mark(`floor-${tier}`, `地下 ${(tier - 1) * 10 + 1} 階 (ダンジョン T${tier}) に到達`, day)
      if (save.maxFloor % 10 === 0 && save.floor > save.maxFloor - 1) mark(`boss-${save.maxFloor}`, `地下 ${save.maxFloor} 階のボス部屋に到達`, day)
      mark(`page-${unlockedPages(save)}`, `強化ツリー T${unlockedPages(save)} のページが開く`, day)
    }
  }
  const weapon = save.inventory.find(item => item.id === save.weapon)
  const dayOneShots = oneShots
  const skills = EQUIP.map(id => levelOf(save, id)).join('/')
  console.log(
    [
      String(day).padStart(3),
      String(save.floor).padStart(5),
      String(save.maxFloor).padStart(5),
      String(unlockedPages(save)).padStart(4),
      String(save.allocated.length).padStart(5),
      String(freeSp(save, skillPoints(save))).padStart(3),
      `  ${skills.padEnd(16)}`,
      String(attack(save)).padStart(5),
      String(defense(save)).padStart(5),
      String(maxHp(save)).padStart(7),
      ` ${(weapon?.name ?? '').padEnd(10)}q${weapon?.quality ?? 0}`.padEnd(18),
      String(Math.floor(save.memory)).padStart(8),
      String(save.kills).padStart(6),
      String(save.deaths).padStart(6),
      String(dayOneShots).padStart(6),
      isWeekend ? ' (休み)' : '',
    ].join(' '),
  )
  oneShots = 0
  if (process.argv.includes('--detail')) {
    const m = mods(save)
    const armor = save.inventory.find(item => item.id === save.armor)
    const earned = (save.spent ?? 0) + save.memory
    const pages = Array.from({ length: unlockedPages(save) }, (_, i) => `T${i + 1}:${countOnPage(save, i + 1)}`).join(' ')
    console.log(
      `      内訳: 武器 ${weapon?.name} q${weapon?.quality ?? 0} 性能${weapon?.power}  防具 ${armor?.name ?? 'なし'} 性能${armor?.power ?? 0}  ` +
        `ツリー 攻撃+${m.atkFlat} 攻撃${Math.round(m.atkPct * 100)}% 防御+${m.defFlat} 防御${Math.round(m.defPct * 100)}% 体力+${m.hpFlat}  ` +
        `ページ別の購入回数 ${pages}  memory 累計 ${Math.round(earned)} (トークン ${Math.round(income.tokens)} / 分解 ${Math.round(income.salvage)} / 撃破 ${Math.round(earned - income.tokens - income.salvage)})`,
    )
  }
}

console.log('\n到達の記録')
for (const line of milestones) console.log(line)

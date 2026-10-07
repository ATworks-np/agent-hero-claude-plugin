import type { Inbox, Note, World } from '../types'
import { allocate, autoExplore, displayName, equip, farm, forge, refund, salvageAll, gainTokens, migrate, newSave, newScene, step } from './game'
import type { Rng } from './game'
import { equipSkill, learnSkill, refundSkill, unequipSkill, upgradeSkill } from './skills'
import { skillPoints } from './tree'
import { langOf, t } from './i18n'
import { discardRelic, equipRelic, unequipRelic } from './relics'
import type { SkillId } from './skills'

// 全セッションで 1 人の勇者を共有する。
//
// world.json を書くのは「駆動役」の 1 セッションだけで、ほかのセッションは読んで描くだけにする。
// 各セッションは自分の受信箱 (inbox/<セッションID>.json) にだけ書き、駆動役がそれを取り込む。
// 1 つのファイルを複数セッションが読み書きすると、後から書いた側が他の進行を上書きして消すため。
// 受信箱のトークン数とコマンド番号は累計で持ち、駆動役は取り込み済みの値 (applied) との差分だけを足す。

// 駆動役の書き込みがこれより古ければ、そのセッションは終了したとみなして別のセッションが引き継ぐ
export const DRIVER_STALE_MS = 2000
// 受信箱の作業中の印がこれより新しいセッションがあれば、帯に「探索中」と出す
export const WORKING_STALE_MS = 3000
const EVENT_CAP = 20

export const newWorld = (save = newSave()): World => ({
  save: migrate(save),
  scene: newScene(),
  driver: null,
  applied: {},
  isWorking: false,
  events: [],
  eventSeq: 0,
})

export const isDriver = (world: World, me: string, now: number): boolean =>
  !world.driver || world.driver.id === me || now - world.driver.at > DRIVER_STALE_MS

const pushEvents = (world: World, notes: Note[]): World => {
  if (notes.length === 0) return world
  let seq = world.eventSeq
  const events = [...world.events, ...notes.map(note => ({ seq: ++seq, text: note.text, kind: note.kind }))].slice(-EVENT_CAP)
  return { ...world, events, eventSeq: seq }
}

export const applyInboxes = (world: World, inboxes: Record<string, Inbox>, now: number, rng: Rng = Math.random): World => {
  let save = migrate(world.save)
  const texts: Note[] = []
  const applied: World['applied'] = {}
  let resetRequested = false
  for (const [id, inbox] of Object.entries(inboxes)) {
    const total = inbox.tokens ?? 0
    // 旧形式の取り込み記録 (tokens の無いもの) は取り込み済みとみなす
    const done = world.applied[id] ?? { tokens: 0, cmd: 0 }
    const doneTokens = done.tokens ?? total
    if (total > doneTokens) save = gainTokens(save, total - doneTokens)
    for (const cmd of inbox.cmds) {
      if (cmd.seq <= done.cmd) continue
      if (cmd.reset) resetRequested = true
      if (cmd.lang) save = { ...save, lang: cmd.lang }
      if (cmd.notify) save = { ...save, notify: { ...save.notify, [cmd.notify.kind]: cmd.notify.on } }
      if (cmd.equip) save = equip(save, cmd.equip)
      if (cmd.allocate) save = allocate(save, cmd.allocate)
      if (cmd.refund) save = refund(save, cmd.refund)
      if (cmd.salvageAll) save = salvageAll(save)
      if (cmd.learnSkill) save = learnSkill(save, cmd.learnSkill as SkillId, skillPoints(save))
      if (cmd.equipSkill) save = equipSkill(save, cmd.equipSkill as SkillId)
      if (cmd.unequipSkill) save = unequipSkill(save, cmd.unequipSkill as SkillId)
      if (cmd.farm !== undefined) save = farm(save, cmd.farm)
      if (cmd.auto) save = autoExplore(save)
      if (cmd.equipRelic) save = equipRelic(save, cmd.equipRelic)
      if (cmd.unequipRelic) save = unequipRelic(save, cmd.unequipRelic)
      if (cmd.discardRelic) save = discardRelic(save, cmd.discardRelic)
      if (cmd.refundSkill) save = refundSkill(save, cmd.refundSkill as SkillId)
      if (cmd.upgradeSkill) save = upgradeSkill(save, cmd.upgradeSkill as SkillId, skillPoints(save))
      if (cmd.forge) {
        const r = forge(save, cmd.forge)
        save = r.save
        if (r.result === 'success' && r.item) texts.push({ kind: 'forge', text: t(langOf(save), 'note.forged', { item: displayName(r.item, langOf(save)) }) })
      }
    }
    applied[id] = { tokens: Math.max(doneTokens, total), cmd: Math.max(done.cmd, ...inbox.cmds.map(cmd => cmd.seq)) }
  }
  const isWorking = Object.values(inboxes).some(inbox => now - inbox.workingAt < WORKING_STALE_MS)
  // マップで階を移ったら、その階の 1 部屋目からやり直す
  const scene = save.floor !== world.save.floor || save.farmFloor !== world.save.farmFloor ? newScene() : world.scene
  return pushEvents({ ...world, save, scene, applied, isWorking, resetRequested }, texts)
}

export const advance = (world: World, rng: Rng): World => {
  const r = step(world.save, world.scene, rng)
  return pushEvents({ ...world, save: r.save, scene: r.scene }, r.notes.map(note => ({ ...note, text: `⚔ ${note.text}` })))
}

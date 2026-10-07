import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { BALANCE } from '../config/balance'

import type { Command, Inbox, Item, Save, Tab, World } from '../types'
import {
  attack,
  canForge,
  dungeonName,
  floorFeature,
  tokenMultiplier,
  canRefund,
  forgeCost,
  salvageable,
  salvageValue,
  bar,
  corridorCells,
  defense,
  maxHp,
  INVENTORY_CAP,
  itemName,
  monsterName,
  qualityName,
  roomsOn,
  qualityOf,
  runs,
  TOKENS_PER_MEMORY,
  weightedTokens,
} from './game'
import { RELIC_CAP, affixCount, equippedRelics, relicLines, relicName, relics } from './relics'
import { contentOf, langOf, t } from './i18n'
import type { Lang } from './i18n'
import { LANGUAGES } from '../config/text'
import { relicSlots, nodeName, MAX_NODE_LEVEL, PAGES, canLevelUp, nodeLevel, nodeText, skillPoints, availableNodes, compactTreeCells, modLines, mods, branchColor, countOnPage, formatAmount, isAllocated, isPageUnlocked, nodeCost, pageNodes, unlockText, unlockedPages } from './tree'
import type { TreeViewMessage, TreeViewProps } from './tree-view'
import {
  MAX_SKILL_LEVEL,
  SKILL_GRID,
  SKILL_SLOTS,
  SKILLS,
  canLearn,
  canRefundSkill,
  canUpgrade,
  equipped,
  freeSp,
  learnCost,
  learned,
  levelOf,
  skillName,
  skillText,
  upgradeCost,
} from './skills'
import type { SkillBranch, SkillNode } from './skills'
import type { SkillViewMessage, SkillViewProps } from './skill-view'
import type { MapViewMessage, MapViewProps } from './map-view'
import { advance, applyInboxes, isDriver, newWorld } from './world'
import { isNewer, manifestUrl } from './update'

const PANE = 'agent-hero'
const TREE_VIEW = 'tree-view'
const SKILL_VIEW = 'skill-view'
const MAP_VIEW = 'map-view'
const STORE_KEY = 'save'
// 勇者が 1 歩進む間隔 (config/balance.ts)。作業中かどうかに関わらず一定
const TICK_MS = BALANCE.dungeon.stepMs
// 作業中の印を受信箱に書き直す間隔
const HEARTBEAT_MS = 1000
// 更新がこれより古い受信箱は、取り込み済みとして読まない
const INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CMD_CAP = 20
// 新しい版が出ているかを GitHub に確かめる間隔。結果は共有データに置き、全セッションで使い回す
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000
// 確かめた結果を読み直す間隔 (通信はしない)
const UPDATE_READ_MS = 10 * 60 * 1000

const saveAtom = atom({ plugin: 'agent-hero', key: 'save' } as const, null)
const sceneAtom = atom({ plugin: 'agent-hero', key: 'scene' } as const, null)
const tabAtom = atom({ plugin: 'agent-hero', key: 'tab' } as const, 'status')
const pageAtom = atom({ plugin: 'agent-hero', key: 'treePage' } as const, 1)
const workingAtom = atom({ plugin: 'agent-hero', key: 'isWorking' } as const, false)
const versionAtom = atom({ plugin: 'agent-hero', key: 'version' } as const, null)
const updateAtom = atom({ plugin: 'agent-hero', key: 'update' } as const, null)

// 並び順がそのまま数字キー (1〜9) の割り当てになる
const TABS: Tab[] = ['status', 'tree', 'skill', 'relic', 'equipment', 'inventory', 'log', 'map', 'settings']
// タブを 2 段に並べるときの 1 段目の数
const TABS_FIRST_ROW = 5

// 共有データはプラグインの外 (設定フォルダの agent-hero/。既定では ~/.claude/agent-hero/) に置き、
// プラグインを入れ直したり更新したりしても消えないようにする。マーケットプレイスから入れたプラグインは
// <設定フォルダ>/plugins/cache/ などの下、スキル置き場に直接置いたものは <設定フォルダ>/skills/ の下にある。
// どちらでもない (手元のフォルダから読み込んだ) ときは、ホームの ~/.claude/agent-hero/ に置く
const dataDir = (root: string): string => {
  const installed = /^(.*)\/(?:plugins\/(?:cache|marketplaces)|skills)\//.exec(root)
  if (installed) return `${installed[1]}/agent-hero`
  const home = /^\/(?:Users|home)\/[^/]+/.exec(root)
  return home ? `${home[0]}/.claude/agent-hero` : `${root}/data`
}

type UpdateCache = { checkedAt: number; latest: string }

// 動いている版と、公開している最新の版を比べる。GitHub に確かめるのは前回から UPDATE_CHECK_MS 経ったときだけ。
// 新しい版を見つけたセッションだけがトーストを出す (全セッションで同時に出さないため)
async function checkUpdate($: EngineInterface) {
  const manifest = parse<{ version?: string; repository?: string }>(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  const current = manifest?.version
  if (current && (await read($, versionAtom)) !== current) await update($, versionAtom, () => current)
  const url = manifestUrl(manifest?.repository)
  if (!current || !url) return
  const path = `${dataDir($.plugin.root)}/update.json`
  const now = await $.clock.now()
  let cache = (await $.fs.exists(path)) ? parse<UpdateCache>(await $.fs.read(path)) : null
  if (!cache || now - cache.checkedAt >= UPDATE_CHECK_MS) {
    const response = await $.http.fetch(url).catch(() => null)
    const fetched = response?.ok ? parse<{ version?: string }>(response.text)?.version : undefined
    // 取れなかったときも確かめた時刻は進め、次の確認まで通信しない
    const next: UpdateCache = { checkedAt: now, latest: fetched ?? cache?.latest ?? current }
    if (fetched && fetched !== cache?.latest && isNewer(fetched, current)) {
      $.ui.toast(t(langOf(await read($, saveAtom)), 'update.available', { current, latest: fetched }))
    }
    cache = next
    await $.fs.write(path, JSON.stringify(cache))
  }
  const info = isNewer(cache.latest, current) ? { current, latest: cache.latest } : null
  if (JSON.stringify(await read($, updateAtom)) !== JSON.stringify(info)) await update($, updateAtom, () => info)
}

const parse = <T,>(text: string): T | null => {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

type Ctx = {
  me: string
  isWorking: boolean
  lastHeartbeat: number
  lastEvent: number | null
  lastSave: string
  lastScene: string
  inbox: Inbox
  inboxCache: Map<string, { mtimeMs: number; inbox: Inbox }>
}

const paths = (root: string, me: string) => {
  const dir = dataDir(root)
  return { world: `${dir}/world.json`, inboxDir: `${dir}/inbox`, inbox: `${dir}/inbox/${me}.json` }
}

// 装備の変更や強化も受信箱経由で駆動役に渡し、共有の進行に反映させる
async function sendCommand($: EngineInterface, ctx: Ctx, cmd: Omit<Command, 'seq'>) {
  ctx.inbox.cmds = [...ctx.inbox.cmds, { ...cmd, seq: (ctx.inbox.cmds.at(-1)?.seq ?? 0) + 1 }].slice(-CMD_CAP)
  await writeInbox($, ctx)
}

async function writeInbox($: EngineInterface, ctx: Ctx) {
  await $.fs.write(paths($.plugin.root, ctx.me).inbox, JSON.stringify(ctx.inbox))
}

// world.json が無いときだけ作る。読めない (書き込み途中など) ときは作り直さず、その回を見送る。
async function readWorld($: EngineInterface, ctx: Ctx): Promise<World | null> {
  const path = paths($.plugin.root, ctx.me).world
  if (!(await $.fs.exists(path))) {
    const stored = (await $.store.get(STORE_KEY)) as Save | undefined
    const world = newWorld(stored)
    await $.fs.write(path, JSON.stringify(world))
    return world
  }
  return parse<World>(await $.fs.read(path))
}

async function readInboxes($: EngineInterface, ctx: Ctx, now: number): Promise<Record<string, Inbox>> {
  const { inboxDir } = paths($.plugin.root, ctx.me)
  if (!(await $.fs.exists(inboxDir))) return {}
  const result: Record<string, Inbox> = {}
  for (const entry of await $.fs.list(inboxDir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json') || now - entry.mtimeMs > INBOX_TTL_MS) continue
    const id = entry.name.slice(0, -'.json'.length)
    let cached = ctx.inboxCache.get(id)
    if (!cached || cached.mtimeMs !== entry.mtimeMs) {
      const parsed = parse<Inbox>(await $.fs.read(`${inboxDir}/${entry.name}`))
      if (!parsed) continue
      cached = { mtimeMs: entry.mtimeMs, inbox: parsed }
      ctx.inboxCache.set(id, cached)
    }
    result[id] = cached.inbox
  }
  return result
}

async function tick($: EngineInterface, ctx: Ctx) {
  const now = await $.clock.now()
  if (ctx.isWorking && now - ctx.lastHeartbeat >= HEARTBEAT_MS) {
    ctx.lastHeartbeat = now
    ctx.inbox.workingAt = now
    await writeInbox($, ctx)
  }

  let world = await readWorld($, ctx)
  if (!world) return
  if (isDriver(world, ctx.me, now)) {
    world = applyInboxes(world, await readInboxes($, ctx, now), now)
    world = advance(world, Math.random)
    world = { ...world, driver: { id: ctx.me, at: now } }
    await $.fs.write(paths($.plugin.root, ctx.me).world, JSON.stringify(world))
  }

  const shown = world
  const saveText = JSON.stringify(shown.save)
  const sceneText = JSON.stringify(shown.scene)
  if (saveText !== ctx.lastSave) await update($, saveAtom, () => shown.save)
  if (sceneText !== ctx.lastScene) await update($, sceneAtom, () => shown.scene)
  ctx.lastSave = saveText
  ctx.lastScene = sceneText
  if ((await read($, workingAtom)) !== shown.isWorking) await update($, workingAtom, () => shown.isWorking)

  // 起動時点までの出来事は通知せず、それ以降に起きた出来事だけを全セッションでトーストする
  if (ctx.lastEvent !== null) {
    for (const event of shown.events) if (event.seq > ctx.lastEvent) $.ui.toast(event.text)
  }
  ctx.lastEvent = shown.eventSeq
}

// Client にキーが届くのはフォーカスが Client にあるときだけなので、強化ツリーを開いたらフォーカスを移す
async function focusTreeView($: EngineInterface) {
  await $.ui.focus({ requestId: PANE, key: TREE_VIEW }).catch(() => undefined)
}

async function focusSkillView($: EngineInterface) {
  await $.ui.focus({ requestId: PANE, key: SKILL_VIEW }).catch(() => undefined)
}

async function selectTab($: EngineInterface, tab: Tab) {
  await update($, tabAtom, () => tab)
  if (tab === 'tree') await focusTreeView($)
  if (tab === 'skill') await focusSkillView($)
  if (tab === 'map') await $.ui.focus({ requestId: PANE, key: MAP_VIEW }).catch(() => undefined)
}

const SKILL_COLORS: Record<SkillBranch, string> = { atk: '#ff8787', def: '#87afff', hp: '#87d787', loot: '#ffd75f' }

// スキルツリーの盤面。セット中は @、習得済みは系統の色、習得できるものは白、まだのものは暗い灰色
const skillCells = (save: Save) =>
  SKILL_GRID.map((line, y) =>
    [...line].map((ch, x) => {
      if (ch === 'S') return { ch: 'S', color: '#ffd700', bold: true, inverse: false }
      const skill = [...SKILLS.values()].find(one => one.x === x && one.y === y)
      if (!skill) return { ch, color: '#6c6c6c', bold: false, inverse: false }
      const isEquipped = equipped(save).includes(skill.id)
      const isLearned = learned(save).includes(skill.id)
      const color = isLearned ? SKILL_COLORS[skill.branch] : canLearn(save, skill.id) ? '#ffffff' : '#4e4e4e'
      return { ch: isEquipped ? '@' : 'o', color, bold: isLearned || canLearn(save, skill.id), inverse: false }
    }),
  )

const skillState = (save: Save, skill: SkillNode) =>
  equipped(save).includes(skill.id)
    ? 'equipped'
    : learned(save).includes(skill.id)
      ? 'learned'
      : canLearn(save, skill.id)
        ? 'available'
        : 'locked'

const skillViewProps = (save: Save): SkillViewProps => {
  const sp = freeSp(save, skillPoints(save))
  const lang = langOf(save)
  return {
    lang,
    rows: skillCells(save),
    nodes: [...SKILLS.values()].map(skill => {
      const level = levelOf(save, skill.id)
      return {
        id: skill.id,
        x: skill.x,
        y: skill.y,
        name: skillName(skill, lang),
        level,
        text: skillText(skill, Math.max(1, level), lang),
        nextText: canUpgrade(save, skill.id) ? skillText(skill, level + 1, lang) : null,
        color: SKILL_COLORS[skill.branch],
        state: skillState(save, skill),
        learnCost: learnCost(save),
        upgradeCost: canUpgrade(save, skill.id) ? upgradeCost() : null,
        canRefund: canRefundSkill(save, skill.id),
      }
    }),
    sp,
    earnedSp: skillPoints(save),
    maxLevel: MAX_SKILL_LEVEL,
    slots: SKILL_SLOTS,
    equippedCount: equipped(save).length,
    learnedCount: learned(save).length,
    equippedNames: equipped(save).map(id => `${SKILLS.get(id) ? skillName(SKILLS.get(id)!, lang) : id} Lv${levelOf(save, id)}`),
  }
}

const treeViewProps = (save: Save, tier: number): TreeViewProps => {
  const cost = nodeCost(tier, countOnPage(save, tier))
  const available = new Set(availableNodes(save, tier).map(node => node.id))
  const { rows, rowOf } = compactTreeCells(save, tier)
  const lang = langOf(save)
  return {
    lang,
    tier,
    pages: PAGES,
    unlocked: unlockedPages(save),
    isUnlocked: isPageUnlocked(save, tier),
    lockedText: isPageUnlocked(save, tier) ? '' : unlockText(save, tier),
    rows,
    nodes: pageNodes(tier)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(node => ({
        id: node.id,
        x: node.x,
        y: rowOf.get(node.y) ?? node.y,
        name: nodeName(node, lang),
        text: nodeText(node, nodeLevel(save, node.id), lang),
        color: branchColor(node.branch),
        size: node.size,
        state: isAllocated(save, node.id) ? 'allocated' : available.has(node.id) ? 'available' : 'locked',
        canRefund: canRefund(save, node.id),
        level: nodeLevel(save, node.id),
        maxLevel: MAX_NODE_LEVEL,
        canLevelUp: canLevelUp(save, node.id),
        nextText: canLevelUp(save, node.id) ? nodeText(node, nodeLevel(save, node.id) + 1, lang) : null,
      })),
    memory: formatAmount(save.memory),
    cost: formatAmount(cost),
    canAfford: save.memory >= cost,
  }
}

// 表示上の幅 (全角は 2) で揃えた項目名。ステータスの値の列を言語によらず揃えるため
const LABEL_WIDTH: Record<Lang, number> = { ja: 11, en: 18 }
const displayWidth = (text: string): number => [...text].reduce((sum, ch) => sum + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
const labelIn = (lang: Lang) => (text: string): string => text + ' '.repeat(Math.max(1, LABEL_WIDTH[lang] - displayWidth(text)))

export const register: Register = on => {
  const ctx: Ctx = {
    me: crypto.randomUUID(),
    isWorking: false,
    lastHeartbeat: 0,
    lastEvent: null,
    lastSave: '',
    lastScene: '',
    inbox: { tokens: 0, cmds: [], workingAt: 0 },
    inboxCache: new Map(),
  }

  on('session.start', async ($, e, next) => {
    await writeInbox($, ctx)
    await tick($, ctx)
    // 説明文の言語は起動時のセーブの言語で決める
    await $.command.register({
      name: 'agent-hero',
      description: t(langOf(await read($, saveAtom)), 'command.description'),
    })
    $.clock.every(TICK_MS, () => void tick($, ctx))
    await checkUpdate($).catch(() => undefined)
    $.clock.every(UPDATE_READ_MS, () => void checkUpdate($).catch(() => undefined))

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    ctx.isWorking = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      ctx.isWorking = false
      ctx.inbox.workingAt = 0
      await writeInbox($, ctx)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.usage) {
      ctx.inbox.tokens += weightedTokens(result.usage)
      await writeInbox($, ctx)
    }
    return result
  })

  // tree-view.tsx での操作 (ページの切り替え・取得・払い戻し・タブ切り替え) を受け取る
  on('ui.message', { element: TREE_VIEW }, async ($, e) => {
    const message = e.data as TreeViewMessage
    if ('page' in message) await update($, pageAtom, () => Math.min(PAGES, Math.max(1, message.page)))
    if ('allocate' in message) await sendCommand($, ctx, { allocate: message.allocate })
    if ('refund' in message) await sendCommand($, ctx, { refund: message.refund })
    if ('tab' in message) {
      const tab = TABS[message.tab - 1]
      if (tab) await selectTab($, tab)
    }
    return {}
  })

  // map-view.tsx での操作 (周回する階の選択・自動攻略・タブ切り替え) を受け取る
  on('ui.message', { element: MAP_VIEW }, async ($, e) => {
    const message = e.data as MapViewMessage
    if ('farm' in message) await sendCommand($, ctx, { farm: message.farm })
    if ('auto' in message) await sendCommand($, ctx, { auto: true })
    if ('tab' in message) {
      const tab = TABS[message.tab - 1]
      if (tab) await selectTab($, tab)
    }
    return {}
  })

  // skill-view.tsx での操作 (習得・強化・戻す・セット・外す・タブ切り替え) を受け取る
  on('ui.message', { element: SKILL_VIEW }, async ($, e) => {
    const message = e.data as SkillViewMessage
    if ('learn' in message) await sendCommand($, ctx, { learnSkill: message.learn })
    if ('equip' in message) await sendCommand($, ctx, { equipSkill: message.equip })
    if ('unequip' in message) await sendCommand($, ctx, { unequipSkill: message.unequip })
    if ('upgrade' in message) await sendCommand($, ctx, { upgradeSkill: message.upgrade })
    if ('refund' in message) await sendCommand($, ctx, { refundSkill: message.refund })
    if ('tab' in message) {
      const tab = TABS[message.tab - 1]
      if (tab) await selectTab($, tab)
    }
    return {}
  })

  on('command.run', { command: 'agent-hero' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent Hero', focus: true })
    const opened = await read($, tabAtom)
    if (opened === 'tree') await focusTreeView($)
    if (opened === 'skill') await focusSkillView($)
    if (opened === 'map') await $.ui.focus({ requestId: PANE, key: MAP_VIEW }).catch(() => undefined)
    return { text: t(langOf(await read($, saveAtom)), 'command.opened') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const save = await read($, saveAtom)
    const scene = await read($, sceneAtom)
    if (!save || !scene) return next(e)
    const isWorking = await read($, workingAtom)
    const newVersion = await read($, updateAtom)

    const { Box, Text } = $.ui.resolve(e)
    const top = maxHp(save)
    const lang = langOf(save)
    // スキルを発動した回は、敵の HP の代わりにスキル名を出す
    const status =
      scene.flash
        ? `✦ ${scene.flash}`
        : scene.phase === 'dead'
        ? t(lang, 'band.reviving')
        : scene.monster && scene.phase === 'fight'
          ? `${monsterName(scene.monster, lang)} ${scene.monster.hp}/${scene.monster.maxHp}`
          : scene.phase === 'stairs'
            ? t(lang, 'band.stairs')
            : scene.phase === 'door'
              ? t(lang, 'band.door')
            : isWorking
              ? t(lang, 'band.working')
              : t(lang, 'band.resting')

    return (
      <Box flexDirection="column" alignItems="flex-end" width={e.props.bodyColumns}>
        <Box flexDirection="row">
          {/* セット枠 3 つ分の待ち時間を 5 マスのバーで出す。満タンで使える状態。枠が空いていれば空のバー */}
          {Array.from({ length: SKILL_SLOTS }, (_, slot) => {
            const id = equipped(save)[slot]
            if (!id) return <Text color="#3a3a3a">{bar(0, 1, 5)} </Text>
            const total = SKILLS.get(id)?.cooldown(levelOf(save, id)) ?? 1
            const left = save.cooldowns?.[id] ?? 0
            return (
              <Text color={left === 0 ? '#d787ff' : '#6c6c6c'}>
                {bar(total - left, total, 5)}{' '}
              </Text>
            )
          })}
          <Text color="#8a8a8a">
            {save.farmFloor ? ` ${t(lang, 'band.farming')}` : ''}{' '}B{save.floor}F {scene.room ?? 1}/{roomsOn(save.floor)}{' '}
          </Text>
          {runs(corridorCells(scene, save.floor)).map(run => (
            <Text color={run.color} bold={run.bold}>
              {run.ch}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row">
          <Text dimColor={!scene.flash} bold={!!scene.flash} color={scene.flash ? '#d787ff' : undefined}>
            {status}{'  '}
          </Text>
          {/* PWR は強化ツリーに使った memory の累計 */}
          <Text bold color="#ffaf5f">{`${t(lang, 'band.power')} ${formatAmount(save.spent ?? 0)} `}</Text>
          <Text color="#ff5f5f">HP {bar(save.hp, top, 6)} </Text>
          <Text color="#afffaf">{`${formatAmount(save.memory)} ${contentOf(lang).memoryName}`}</Text>
        </Box>
        {/* 新しい版が出ているときだけ 3 行目に、更新のしかたと一緒に出す */}
        {newVersion && (
          <Text color="#ffd700">
            <Text bold>{`⬆ ${t(lang, 'update.available', newVersion)}`}</Text>
            {`  ${t(lang, 'update.how')}`}
          </Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const save = await read($, saveAtom)
    if (!save) return <Text dimColor>{t('ja', 'pane.loading')}</Text>
    const top = maxHp(save)
    const lang = langOf(save)
    const MEMORY = contentOf(lang).memoryName
    const label = labelIn(lang)
    const weapon = save.inventory.find(one => one.id === save.weapon)
    const armor = save.inventory.find(one => one.id === save.armor)
    const width = Math.max(10, Math.min(20, e.props.bodyColumns - 22))

    const describe = (item: Item) => `${t(lang, item.kind === 'weapon' ? 'equip.atk' : 'equip.def')} +${item.power}`

    const itemLabel = (item: Item) => {
      const quality = qualityOf(item)
      return quality ? (
        <Text>
          <Text color={quality.color} bold>[{qualityName(item.quality!, lang)}]</Text> {itemName(item, lang)}
        </Text>
      ) : (
        <Text>{itemName(item, lang)}</Text>
      )
    }

    const act = (item: Item) => () => sendCommand($, ctx, { equip: item.id })
    const memory = Math.floor(save.memory)
    const page = Math.min(PAGES, Math.max(1, await read($, pageAtom)))
    const totals = modLines(mods(save), lang)
    const cost = nodeCost(page, countOnPage(save, page))
    const available = availableNodes(save, page)

    const tab = await read($, tabAtom)
    const newVersion = await read($, updateAtom)
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 6)

    // タブは 2 段に並べる
    const tabs = (
      <Box flexDirection="column">
        {[TABS.slice(0, TABS_FIRST_ROW), TABS.slice(TABS_FIRST_ROW)].map((row, r) => (
          <Box flexDirection="row" gap={2}>
            {row.map((one, i) => (
              <Button
                key={`tab-${one}`}
                label={t(lang, `tab.${one}`)}
                hotkey={String(r * TABS_FIRST_ROW + i + 1)}
                // [ ] の枠なしで描く。選んでいないタブは薄く表示して、選んでいるタブと見分ける
                plain
                dimColor={one !== tab}
                onPress={() => selectTab($, one)}
              />
            ))}
          </Box>
        ))}
      </Box>
    )

    const body =
      tab === 'status' ? (
        <Box flexDirection="column">
          <Text>
            {label(t(lang, 'status.hp'))}<Text color="#ff5f5f">{bar(save.hp, top, width)}</Text> {save.hp}/{top}
          </Text>
          <Text>{label(t(lang, 'status.atk'))}{attack(save)}</Text>
          <Text>{label(t(lang, 'status.def'))}{defense(save)}</Text>
          <Text>
            {label(MEMORY)}<Text color="#afffaf">{formatAmount(memory)}</Text>
          </Text>
          <Text>
            {label(t(lang, 'status.tokenMultiplier'))}<Text bold color="#afffaf">×{tokenMultiplier(save)}</Text>{'  '}
            <Text dimColor>{t(lang, 'status.tokenMultiplierNote', { mult: BALANCE.economy.tokenMultiplierPerPage })}</Text>
          </Text>
          <Text>
            {label(t(lang, 'status.power'))}<Text bold color="#ffaf5f">{formatAmount(save.spent ?? 0)}</Text>  <Text dimColor>{t(lang, 'status.powerNote')}</Text>
          </Text>
          <Text>
            {label(t(lang, 'status.skills'))}
            {equipped(save).length === 0 ? <Text dimColor>{t(lang, 'status.noSkills')}</Text> : equipped(save).map(id => skillName(SKILLS.get(id)!, lang)).join(' / ')}
          </Text>
          <Text>{label(t(lang, 'status.location'))}{t(lang, 'status.floor', { dungeon: dungeonName(save), floor: save.floor, max: save.maxFloor })}</Text>
          <Text>{label(t(lang, 'status.kills'))}{t(lang, 'status.killsDeaths', { kills: save.kills, deaths: save.deaths })}</Text>
          <Text dimColor>
            {t(lang, 'status.tokens', { tokens: formatAmount(save.tokens), per: TOKENS_PER_MEMORY, memory: MEMORY, mult: tokenMultiplier(save) })}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{t(lang, 'status.totals', { count: save.allocated.length })}</Text>
            {totals.length === 0 ? <Text dimColor>{t(lang, 'status.noTotals')}</Text> : totals.map(line => <Text>  {line}</Text>)}
          </Box>
        </Box>
      ) : tab === 'tree' ? (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text dimColor>{t(lang, 'tree.allocatedCount', { count: save.allocated.length })}</Text>
          </Box>
          {'Client' in elements ? (
            <elements.Client key={TREE_VIEW} module="./tree-view.tsx" props={treeViewProps(save, page)} />
          ) : (
            // Client の無い画面では、ページのボタンと取得ボタンの一覧で操作する
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                {Array.from({ length: PAGES }, (_, i) => i + 1).map(tier => (
                  <Button
                    key={`page-${tier}`}
                    // plain のボタンは variant で色が変わらないため、選んでいるページは [ ] で囲んで示す
                    label={tier === page ? `[T${tier}]` : ` T${tier} `}
                    plain
                    dimColor={tier !== page && tier > unlockedPages(save)}
                    onPress={() => update($, pageAtom, () => tier)}
                  />
                ))}
              </Box>
              <Box flexDirection="row" gap={1}>
                <Text>
                  {MEMORY} <Text color="#afffaf">{formatAmount(memory)}</Text>{`  ${t(lang, 'tree.nextCost')} ${formatAmount(cost)}`}
                </Text>
              </Box>
              {!isPageUnlocked(save, page) && <Text color="#ff8787">{unlockText(save, page)}</Text>}
              <Box flexDirection="column" marginTop={1}>
                {compactTreeCells(save, page).rows.map(row => (
                  <Box flexDirection="row">
                    {runs(row).map(run => (
                      <Text color={run.color} bold={run.bold}>
                        {run.ch}
                      </Text>
                    ))}
                  </Box>
                ))}
              </Box>
              <Text dimColor>{t(lang, 'tree.legend')}</Text>
              <Box flexDirection="column" marginTop={1}>
                {available.map(node => (
                  <Box flexDirection="row" gap={1}>
                    <Button key={`allocate-${node.id}`} label={t(lang, 'tree.take')} dimColor={memory < cost} onPress={() => sendCommand($, ctx, { allocate: node.id })} />
                    <Text>
                      <Text color={branchColor(node.branch)} bold>
                        {node.size === 'keystone' ? t(lang, 'tree.keystoneMark') : ''}{nodeName(node, lang)}
                      </Text>{' '}
                      <Text dimColor>{nodeText(node, nodeLevel(save, node.id), lang)}</Text>
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      ) : tab === 'skill' && 'Client' in elements ? (
        <elements.Client key={SKILL_VIEW} module="./skill-view.tsx" props={skillViewProps(save)} />
      ) : tab === 'skill' ? (
        // Client の無い画面では、ボタン付きの一覧で操作する
        <Box flexDirection="column">
          <Text>
            SP <Text color="#d787ff">{freeSp(save, skillPoints(save))}</Text>
            {`  ${t(lang, 'skill.header', { equipped: equipped(save).length, slots: SKILL_SLOTS, learned: learned(save).length, total: SKILLS.size })}`}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {skillCells(save).map(row => (
              <Box flexDirection="row">
                {row.map(cell => (
                  <Text color={cell.color} bold={cell.bold} inverse={cell.inverse}>
                    {cell.ch}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
          <Text dimColor>{t(lang, 'skill.legend')}</Text>
          <Box flexDirection="column" marginTop={1}>
            {[...SKILLS.values()]
              .sort((a, b) => a.branch.localeCompare(b.branch) || a.y - b.y || a.x - b.x)
              .map((skill: SkillNode) => {
                const isLearned = learned(save).includes(skill.id)
                const isEquipped = equipped(save).includes(skill.id)
                const sp = freeSp(save, skillPoints(save))
                const cost = learnCost(save)
                return (
                  <Box flexDirection="row" gap={1}>
                    {isEquipped ? (
                      <Button key={`skill-${skill.id}`} label={t(lang, 'skill.unequip')} onPress={() => sendCommand($, ctx, { unequipSkill: skill.id })} />
                    ) : isLearned ? (
                      <Button
                        key={`skill-${skill.id}`}
                        label={t(lang, 'skill.equip')}
                        dimColor={equipped(save).length >= SKILL_SLOTS}
                        onPress={() => sendCommand($, ctx, { equipSkill: skill.id })}
                      />
                    ) : canLearn(save, skill.id) ? (
                      <Button
                        key={`skill-${skill.id}`}
                        label={t(lang, 'skill.learnCost', { cost })}
                        dimColor={sp < cost}
                        onPress={() => sendCommand($, ctx, { learnSkill: skill.id })}
                      />
                    ) : (
                      <Text dimColor>{t(lang, 'skill.notYet')}</Text>
                    )}
                    <Text>
                      <Text color={isLearned ? SKILL_COLORS[skill.branch] : canLearn(save, skill.id) ? undefined : '#6c6c6c'} bold={isEquipped}>
                        {skillName(skill, lang)}{isLearned ? ` Lv${levelOf(save, skill.id)}` : ''}
                      </Text>{' '}
                      <Text dimColor>{skillText(skill, Math.max(1, levelOf(save, skill.id)), lang)}</Text>
                    </Text>
                    {canUpgrade(save, skill.id) && (
                      <Button
                        key={`upgrade-skill-${skill.id}`}
                        label={t(lang, 'skill.upgrade', { cost: upgradeCost() })}
                        dimColor={sp < upgradeCost()}
                        onPress={() => sendCommand($, ctx, { upgradeSkill: skill.id })}
                      />
                    )}
                  </Box>
                )
              })}
          </Box>
          <Text dimColor>{t(lang, 'skill.slotsNote', { slots: SKILL_SLOTS })}</Text>
        </Box>
      ) : tab === 'relic' ? (
        <Box flexDirection="column">
          <Text>
            {t(lang, 'relic.header', { used: Math.min(equippedRelics(save).length, relicSlots(save)), slots: relicSlots(save), count: relics(save).length, cap: RELIC_CAP })}
          </Text>
          <Text dimColor>{t(lang, 'relic.note', { first: affixCount(1) })}</Text>
          {relics(save).length === 0 && <Text dimColor>{t(lang, 'relic.none')}</Text>}
          {relics(save).map(relic => {
            const slot = equippedRelics(save).indexOf(relic.id)
            const isActive = slot >= 0 && slot < relicSlots(save)
            return (
              <Box flexDirection="column" marginTop={1}>
                <Box flexDirection="row" gap={1}>
                  {slot >= 0 ? (
                    <Button key={`relic-off-${relic.id}`} label={t(lang, 'relic.unequip')} onPress={() => sendCommand($, ctx, { unequipRelic: relic.id })} />
                  ) : (
                    <Button
                      key={`relic-on-${relic.id}`}
                      label={t(lang, 'relic.equip')}
                      dimColor={equippedRelics(save).length >= relicSlots(save)}
                      onPress={() => sendCommand($, ctx, { equipRelic: relic.id })}
                    />
                  )}
                  <Text bold color={isActive ? '#d7af5f' : undefined}>
                    {`T${relic.tier} ${relicName(relic, lang)}`}
                  </Text>
                  <Text dimColor>{`${t(lang, 'relic.affixes', { count: relic.affixes.length, max: affixCount(relic.tier) })}${slot >= 0 && !isActive ? t(lang, 'relic.inactive') : ''}`}</Text>
                  {slot < 0 && <Button key={`relic-drop-${relic.id}`} label={t(lang, 'relic.discard')} dimColor onPress={() => sendCommand($, ctx, { discardRelic: relic.id })} />}
                </Box>
                {relicLines(relic, lang).map(line => (
                  <Text dimColor={!isActive}>{`    ${line}`}</Text>
                ))}
              </Box>
            )
          })}
        </Box>
      ) : tab === 'map' ? (
        'Client' in elements ? (
          <elements.Client
            key={MAP_VIEW}
            module="./map-view.tsx"
            props={
              {
                lang,
                dungeon: dungeonName(save),
                floor: save.floor,
                maxFloor: save.maxFloor,
                farmFloor: save.farmFloor ?? null,
                features: Array.from({ length: save.maxFloor }, (_, i) => floorFeature(i + 1, lang)),
              } satisfies MapViewProps
            }
          />
        ) : (
          // Client の無い画面では、自動攻略のボタンと、Tier ごとの階のボタンで選ぶ
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text bold>{`${dungeonName(save)}  `}{save.farmFloor ? t(lang, 'map.farming', { floor: save.farmFloor }) : t(lang, 'map.auto', { floor: save.floor })}</Text>
              {save.farmFloor && <Button key="map-auto" label={t(lang, 'map.backToAuto')} onPress={() => sendCommand($, ctx, { auto: true })} />}
            </Box>
            {Array.from({ length: Math.ceil(save.maxFloor / 10) }, (_, row) => (
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{`T${row + 1}`}</Text>
                {Array.from({ length: 10 }, (_, col) => row * 10 + col + 1)
                  .filter(floor => floor <= save.maxFloor)
                  .map(floor => (
                    <Button key={`map-${floor}`} label={String(floor)} plain dimColor={floor !== save.floor} onPress={() => sendCommand($, ctx, { farm: floor })} />
                  ))}
              </Box>
            ))}
          </Box>
        )
      ) : tab === 'equipment' ? (
        <Box flexDirection="column">
          {(['weapon', 'armor'] as const).map(kind => {
            const item = kind === 'weapon' ? weapon : armor
            const slotName = t(lang, kind === 'weapon' ? 'equip.weapon' : 'equip.armor')
            if (!item) return <Text>{`${slotName}  ${t(lang, 'equip.none')}`}</Text>
            const cost = forgeCost(item, mods(save).smith)
            return (
              <Box flexDirection="column" marginBottom={1}>
                <Text>
                  {slotName}  {itemLabel(item)}  {describe(item)}
                </Text>
                {canForge(item) ? (
                  <Box flexDirection="row" gap={1}>
                    <Button
                      key={`forge-${kind}`}
                      label={t(lang, 'equip.forge', { cost: formatAmount(cost), memory: MEMORY })}
                      dimColor={memory < cost}
                      onPress={() => sendCommand($, ctx, { forge: kind })}
                    />
                    <Text dimColor>{t(lang, 'equip.forgeNote')}</Text>
                  </Box>
                ) : (
                  <Text dimColor>{t(lang, 'equip.forgeMax')}</Text>
                )}
              </Box>
            )
          })}
        </Box>
      ) : tab === 'inventory' ? (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text dimColor>{save.inventory.length}/{INVENTORY_CAP}</Text>
            {salvageable(save).length > 0 && (
              <Button
                key="salvage-all"
                label={t(lang, 'inventory.salvageAll', {
                  count: salvageable(save).length,
                  gain: formatAmount(salvageable(save).reduce((sum, item) => sum + salvageValue(item), 0)),
                  memory: MEMORY,
                })}
                onPress={() => sendCommand($, ctx, { salvageAll: true })}
              />
            )}
          </Box>
          <Text dimColor>{t(lang, 'inventory.salvageNote')}</Text>
          {save.inventory.map(item => {
            const isEquipped = item.id === save.weapon || item.id === save.armor
            return (
              <Box flexDirection="row" gap={1}>
                <Text>
                  {isEquipped ? 'E' : ' '} {itemLabel(item)}  <Text dimColor>{describe(item)}</Text>
                </Text>
                {!isEquipped && (
                  <Button key={`use-${item.id}`} label={t(lang, 'inventory.equip')} onPress={act(item)} />
                )}
              </Box>
            )
          })}
        </Box>
      ) : tab === 'settings' ? (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            <Text bold>{t(lang, 'settings.language')}</Text>
            {LANGUAGES.map(one => (
              <Button
                key={`lang-${one.id}`}
                label={one.id === lang ? `[${one.name}]` : ` ${one.name} `}
                plain
                dimColor={one.id !== lang}
                onPress={() => sendCommand($, ctx, { lang: one.id })}
              />
            ))}
          </Box>
          <Text dimColor>{t(lang, 'settings.languageNote')}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text bold>{t(lang, 'settings.version')}</Text>
              {`  v${(await read($, versionAtom)) ?? '?'}`}
              {newVersion ? <Text color="#ffd700">{`  (${t(lang, 'settings.latest', { latest: newVersion.latest })})`}</Text> : <Text dimColor>{`  (${t(lang, 'settings.upToDate')})`}</Text>}
            </Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{t(lang, 'settings.updateSteps')}</Text>
            {(['1', '2', '3'] as const).map(n => (
              <Box flexDirection="column">
                <Text color={newVersion ? '#ffd700' : undefined}>{t(lang, `settings.step${n}`)}</Text>
                <Text dimColor>{t(lang, `settings.step${n}Note`)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          {save.log.slice(-room).map(line => (
            <Text dimColor>{line}</Text>
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1}>
        {newVersion && (
          <Box flexDirection="column">
            <Text bold color="#ffd700">{`⬆ ${t(lang, 'update.available', newVersion)}`}</Text>
            <Text dimColor>{t(lang, 'update.how')}</Text>
          </Box>
        )}
        {tabs}
        {body}
      </Box>
    )
  })
}

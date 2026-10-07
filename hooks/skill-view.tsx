import type { ClientModule, ClientSurface } from 'claude-code'

import { isDirection, move } from './cursor'
import { t } from './i18n'
import type { Lang } from './i18n'

// スキルツリーの盤面。強化ツリー (tree-view.tsx) と同じく、矢印キーを受け取れる Client で描く。
//   ↑ ↓ ← → 盤面の上でスキルを移動する
//   Enter 習得できるスキルは習得、習得済みならセット、セット中なら外す
//   + (または u) 習得済みのスキルを強化する
//   Backspace Lv を 1 つ下げる。Lv1 なら習得を取り消す (先のスキルが起点から切れる場合はできない)。使った SP は戻る
// 習得・強化・セットは post でフック側 (register.tsx の ui.message) に渡す。

export type SkillViewCell = { ch: string; color: string; bold: boolean; inverse: boolean }
export type SkillViewNode = {
  id: string
  x: number
  y: number
  name: string
  level: number
  text: string
  nextText: string | null
  color: string
  state: 'equipped' | 'learned' | 'available' | 'locked'
  // 待ち時間 (勇者の攻撃の回数)。次の Lv で変わるなら nextCooldown に入る
  cooldown: number
  nextCooldown: number | null
  upgradeCost: number | null
  canRefund: boolean
}
export type SkillViewProps = {
  lang: Lang
  rows: SkillViewCell[][]
  nodes: SkillViewNode[]
  sp: number
  earnedSp: number
  maxLevel: number
  slots: number
  equippedCount: number
  learnedCount: number
  equippedNames: string[]
}
export type SkillViewMessage = { learn: string } | { upgrade: string } | { refund: string } | { equip: string } | { unequip: string }

type State = { x: number; y: number }

const latestProps = new WeakMap<ClientSurface<State>, SkillViewProps>()

const onKey = (surface: ClientSurface<State>, key: string) => {
  const props = latestProps.get(surface)
  if (props === undefined) return
  const state = surface.state ?? { x: 0, y: 0 }
  const post = (message: SkillViewMessage) => surface.post(message)

  if (isDirection(key)) surface.setState(move(props.nodes, state, key))
  else if (key === 'return') {
    const node = props.nodes.find(one => one.x === state.x && one.y === state.y)
    if (node?.state === 'available') post({ learn: node.id })
    else if (node?.state === 'learned') post({ equip: node.id })
    else if (node?.state === 'equipped') post({ unequip: node.id })
  } else if (key === 'backspace' || key === 'delete') {
    const node = props.nodes.find(one => one.x === state.x && one.y === state.y)
    if (node?.canRefund) post({ refund: node.id })
  } else if (key === 'u') {
    const node = props.nodes.find(one => one.x === state.x && one.y === state.y)
    if (node && node.upgradeCost !== null) post({ upgrade: node.id })
  }
}


const SkillView: ClientModule<SkillViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps.set(surface, props)
  if (surface.state === undefined) {
    const first = props.nodes.find(node => node.state === 'available') ?? props.nodes[0]
    surface.setState({ x: first?.x ?? 0, y: first?.y ?? 0 })
    surface.onKey(event => onKey(surface, event.key))
  }
  const cursor = surface.state
  const selected = props.nodes.find(node => node.x === cursor?.x && node.y === cursor?.y)
  const isFull = props.equippedCount >= props.slots

  return (
    <Box flexDirection="column">
      <Text>
        SP <Text color="#d787ff" bold>{props.sp}</Text>
        <Text dimColor>{t(props.lang, 'skill.earned', { sp: props.earnedSp })}</Text>
        {`  ${t(props.lang, 'skill.header', { equipped: props.equippedCount, slots: props.slots, learned: props.learnedCount, total: props.nodes.length })}`}
      </Text>
      <Text dimColor>{props.equippedNames.length === 0 ? t(props.lang, 'skill.none') : t(props.lang, 'skill.equippedList', { names: props.equippedNames.join(' / ') })}</Text>
      <Box flexDirection="column" marginTop={1}>
        {props.rows.map((row, y) => (
          <Box flexDirection="row">
            {row.map((cell, x) => {
              const isCursor = selected !== undefined && selected.x === x && selected.y === y
              return (
                <Text color={cell.color} bold={cell.bold || isCursor} inverse={cell.inverse !== isCursor}>
                  {cell.ch}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
      {selected && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={selected.color} bold>
              {selected.name}
            </Text>
            {selected.level > 0 && <Text bold>{` Lv${selected.level}/${props.maxLevel}`}</Text>}
            <Text dimColor>{`  ${t(props.lang, `skill.state.${selected.state}`)}`}</Text>
          </Text>
          <Text>{selected.text}</Text>
          <Text color="#d787ff">
            {t(props.lang, 'skill.cooldown', { count: selected.cooldown })}
            {selected.nextCooldown !== null && <Text dimColor>{t(props.lang, 'skill.nextCooldown', { count: selected.nextCooldown })}</Text>}
          </Text>
          {selected.nextText !== null && selected.upgradeCost !== null && (
            <Text dimColor>
              {t(props.lang, 'skill.nextLevel', { text: selected.nextText })}
              <Text color={props.sp >= selected.upgradeCost ? '#afffaf' : '#ff8787'}>{t(props.lang, 'skill.upgradeCost', { cost: selected.upgradeCost })}</Text>
            </Text>
          )}
          <Text dimColor>
            {selected.state === 'learned' && isFull ? t(props.lang, 'skill.full', { slots: props.slots }) : t(props.lang, `skill.action.${selected.state}`)}
          </Text>
        </Box>
      )}
      <Text dimColor>{t(props.lang, 'skill.help')}</Text>
    </Box>
  )
}

export default SkillView

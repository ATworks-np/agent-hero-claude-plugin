import type { ClientModule, ClientSurface } from 'claude-code'

import { isDirection, move } from './cursor'
import { t } from './i18n'
import type { Lang } from './i18n'

// 強化ツリーの盤面。矢印キーを受け取れるのは Client の onKey だけなので、ここで描く。
//   ↑ ↓ ← → 盤面の上でノードを移動する
//   Enter 選んだノードを取得する。取得済みの小ノードなら Lv を上げる (Lv5 まで)
//   Backspace 小ノードの Lv を 1 つ下げる。Lv1 ならノードを外す (外すと先のノードが起点から切れる場合は外せない)。memory は戻る
//   クリック 最上段の T1〜T10 でページを切り替える (選んでいるページは反転表示)
// 取得とページの切り替えは post でフック側 (register.tsx の ui.message) に渡す。

export type TreeViewCell = { ch: string; color: string; bold?: boolean }
export type TreeViewNode = {
  id: string
  x: number
  y: number
  name: string
  text: string
  color: string
  size: 'start' | 'small' | 'notable' | 'keystone' | 'point'
  state: 'allocated' | 'available' | 'locked'
  canRefund: boolean
  level: number
  maxLevel: number
  canLevelUp: boolean
  // 次の Lv の効果。上げられないときは null
  nextText: string | null
}
export type TreeViewProps = {
  lang: Lang
  tier: number
  pages: number
  unlocked: number
  isUnlocked: boolean
  // まだ開いていないページの、開く条件の説明
  lockedText: string
  rows: TreeViewCell[][]
  nodes: TreeViewNode[]
  memory: string
  cost: string
  canAfford: boolean
}
export type TreeViewMessage = { allocate: string } | { refund: string } | { page: number }

// カーソルは盤面上の位置で持つ。どのページも同じ盤面なので、ページを替えても同じ位置に残る
type State = { x: number; y: number }

const stateLabel = (node: TreeViewNode, lang: Lang) =>
  node.state === 'allocated' && !node.canRefund && node.size !== 'start' ? t(lang, 'tree.state.blocked') : t(lang, `tree.state.${node.state}`)

// onKey は最初の 1 回だけ登録するので、最新の props を描画のたびにここへ置いておく
const latestProps = new WeakMap<ClientSurface<State>, TreeViewProps>()

const onKey = (surface: ClientSurface<State>, key: string) => {
  const props = latestProps.get(surface)
  if (props === undefined) return
  const state = surface.state ?? { x: 0, y: 0 }

  if (isDirection(key)) surface.setState(move(props.nodes, state, key))
  else if (key === 'return') {
    const node = props.nodes.find(one => one.x === state.x && one.y === state.y)
    if (node?.state === 'available' || node?.canLevelUp) surface.post({ allocate: node.id } satisfies TreeViewMessage)
  } else if (key === 'backspace' || key === 'delete') {
    const node = props.nodes.find(one => one.x === state.x && one.y === state.y)
    if (node?.canRefund) surface.post({ refund: node.id } satisfies TreeViewMessage)
  }
}

// 最上段に並べるページの見出し。クリックされた列からページを割り出せるよう、幅もここで決める
const pageLabel = (tier: number) => ` T${tier} `

const pageAt = (props: TreeViewProps, x: number): number | null => {
  let left = 0
  for (let tier = 1; tier <= props.pages; tier += 1) {
    const width = pageLabel(tier).length
    if (x >= left && x < left + width) return tier
    left += width
  }
  return null
}

const TreeView: ClientModule<TreeViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps.set(surface, props)
  if (surface.state === undefined) {
    // 最初は取得できるノード (無ければ起点) にカーソルを置く
    const first = props.nodes.find(node => node.state === 'available') ?? props.nodes.find(node => node.size === 'start')
    surface.setState({ x: first?.x ?? 0, y: first?.y ?? 0 })
    surface.onKey(event => onKey(surface, event.key))
    surface.onPointer(event => {
      const current = latestProps.get(surface)
      if (current === undefined || event.type !== 'down' || event.button !== 'left' || event.y !== 0) return
      const tier = pageAt(current, event.x)
      if (tier !== null && tier !== current.tier) surface.post({ page: tier } satisfies TreeViewMessage)
    })
  }
  const cursor = surface.state
  const selected = props.nodes.find(node => node.x === cursor?.x && node.y === cursor?.y)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {Array.from({ length: props.pages }, (_, i) => i + 1).map(tier =>
          tier === props.tier ? (
            <Text bold inverse color="#ffd700">
              {pageLabel(tier)}
            </Text>
          ) : (
            <Text color={tier <= props.unlocked ? '#bcbcbc' : '#4e4e4e'}>{pageLabel(tier)}</Text>
          ),
        )}
      </Box>
      <Text bold color="#ffd700">{t(props.lang, 'tree.title', { tier: props.tier })}</Text>
      <Text>
        {`${props.memory} memory  ${t(props.lang, 'tree.nextCost')} `}<Text color={props.canAfford ? '#afffaf' : '#ff8787'}>{props.cost}</Text>
      </Text>
      {!props.isUnlocked && <Text color="#ff8787">{props.lockedText}</Text>}
      <Box flexDirection="column" marginTop={1}>
        {props.rows.map((row, y) => (
          <Box flexDirection="row">
            {row.map((cell, x) => {
              const isCursor = selected !== undefined && selected.x === x && selected.y === y
              return (
                <Text color={cell.color} bold={cell.bold || isCursor} inverse={isCursor}>
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
              {`T${props.tier} ${selected.name}`}
            </Text>
            {selected.level > 0 && selected.size === 'small' && <Text bold>{` Lv${selected.level}/${selected.maxLevel}`}</Text>}
            <Text dimColor>{`  ${t(props.lang, `tree.size.${selected.size}`)} / ${stateLabel(selected, props.lang)}`}</Text>
          </Text>
          <Text>{selected.text === '' ? t(props.lang, 'tree.origin') : selected.text}</Text>
          {selected.nextText !== null && <Text dimColor>{t(props.lang, 'tree.nextLevel', { text: selected.nextText, cost: props.cost })}</Text>}
        </Box>
      )}
      <Text dimColor>{t(props.lang, 'tree.help')}</Text>
    </Box>
  )
}

export default TreeView

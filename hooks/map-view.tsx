import type { ClientModule, ClientSurface } from 'claude-code'
import { t } from './i18n'
import type { Lang } from './i18n'

// マップ。到達した階を Tier ごとに 1 行 10 階で並べ、矢印キーで選ぶ。強化・スキルと同じく Client で描く。
//   ↑ ↓ ← → 階を選ぶ (到達した階まで)
//   Enter 選んだ階を周回する (その階を何度も回る)
//   a 自動攻略に戻す (到達した一番深い階から先へ進む)
// 周回と自動攻略の切り替えは post でフック側 (register.tsx の ui.message) に渡す。

// features は到達した階ごとの特徴 (features[0] が地下 1 階)
export type MapViewProps = { lang: Lang; dungeon: string; floor: number; maxFloor: number; farmFloor: number | null; features: string[] }
export type MapViewMessage = { farm: number } | { auto: true }

const FLOORS_PER_ROW = 10
type State = { floor: number }

const latestProps = new WeakMap<ClientSurface<State>, MapViewProps>()

const onKey = (surface: ClientSurface<State>, key: string) => {
  const props = latestProps.get(surface)
  if (props === undefined) return
  const floor = surface.state?.floor ?? props.floor
  const moveTo = (next: number) => surface.setState({ floor: Math.max(1, Math.min(props.maxFloor, next)) })
  if (key === 'left') moveTo(floor - 1)
  else if (key === 'right') moveTo(floor + 1)
  else if (key === 'up') moveTo(floor - FLOORS_PER_ROW)
  else if (key === 'down') moveTo(floor + FLOORS_PER_ROW)
  else if (key === 'return') surface.post({ farm: floor } satisfies MapViewMessage)
  else if (key === 'a') surface.post({ auto: true } satisfies MapViewMessage)
}

const MapView: ClientModule<MapViewProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  latestProps.set(surface, props)
  if (surface.state === undefined) {
    surface.setState({ floor: props.floor })
    surface.onKey(event => onKey(surface, event.key))
  }
  const cursor = Math.min(surface.state?.floor ?? props.floor, props.maxFloor)
  const rows = Math.ceil(props.maxFloor / FLOORS_PER_ROW)

  return (
    <Box flexDirection="column">
      <Text bold color="#ffd700">{props.dungeon}</Text>
      <Text bold color={props.farmFloor ? '#5fd7ff' : '#afffaf'}>
        {props.farmFloor ? t(props.lang, 'map.farming', { floor: props.farmFloor }) : t(props.lang, 'map.auto', { floor: props.floor })}
      </Text>
      <Text dimColor>{t(props.lang, 'map.deepest', { floor: props.maxFloor })}</Text>
      <Text>
        {t(props.lang, 'map.selected', { floor: cursor })}
        <Text color="#d7af5f">{props.features[cursor - 1] ?? ''}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {Array.from({ length: rows }, (_, row) => (
          <Box flexDirection="row">
            <Text dimColor>{`T${row + 1}`.padEnd(4)}</Text>
            {Array.from({ length: FLOORS_PER_ROW }, (_, col) => {
              const floor = row * FLOORS_PER_ROW + col + 1
              if (floor > props.maxFloor) return <Text color="#3a3a3a">{'   .'}</Text>
              const isBoss = floor % FLOORS_PER_ROW === 0
              const isHere = floor === props.floor
              return (
                <Text
                  inverse={floor === cursor}
                  bold={isHere || floor === cursor}
                  color={isHere ? '#ffd700' : isBoss ? '#ff5f5f' : '#bcbcbc'}
                >
                  {String(floor).padStart(4)}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
      <Text dimColor>{t(props.lang, 'map.legend')}</Text>
      <Text dimColor>{t(props.lang, 'map.help')}</Text>
    </Box>
  )
}

export default MapView

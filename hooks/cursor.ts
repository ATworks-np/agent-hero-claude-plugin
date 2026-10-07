// 盤面 (強化ツリー・スキルツリー) の上でカーソルを矢印キーで動かす処理。tree-view.tsx と skill-view.tsx が使う

export type Point = { x: number; y: number }
export type Direction = 'up' | 'down' | 'left' | 'right'

const STEPS: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export const isDirection = (key: string): key is Direction => key in STEPS

// 押した向きにあるノードのうち、その向きへの距離が近く、横 (縦) のずれが小さいものへ移る
export const move = (nodes: Point[], from: Point, direction: Direction): Point => {
  const [dx, dy] = STEPS[direction]
  const scored = nodes
    .map(node => {
      const along = (node.x - from.x) * dx + (node.y - from.y) * dy
      const across = Math.abs((node.x - from.x) * dy) + Math.abs((node.y - from.y) * dx)
      return { node, along, across }
    })
    .filter(one => one.along > 0 && one.across <= one.along * 2)
    .sort((a, b) => a.along + a.across * 2 - (b.along + b.across * 2))
  const next = scored[0]?.node
  return next ? { x: next.x, y: next.y } : from
}

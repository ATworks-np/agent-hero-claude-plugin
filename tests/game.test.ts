import { expect, test } from 'claude-code/testing'

import { CORRIDOR, QUALITIES, TOKENS_PER_MEMORY, floorFeature, floorTheme, roomsOn, autoExplore, farm, tokenMultiplier, allocate, ratioDamage, defense, salvageAll, salvageValue, forge, forgeCost, forgeRate, refund, populate, attack, displayName, itemName, monsterName, gainTokens, makeEquipment, maxHp, migrate, newSave, newScene, spawn, spawnBoss, spawnMiniBoss, killMemory, step, tierOf, weightedTokens } from '../hooks/game'
import { makeRelic, relicName } from '../hooks/relics'
import { PAGES, TREE_NODES, canAffordUpgrade, nodeText, availableNodes, formatAmount, isStart, modLines, mods, nodeCost, unlockedPages } from '../hooks/tree'
import type { Save } from '../types'

const usage = (input: number, output: number, cacheRead = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: 0,
})

test('使用トークンが memory になり、memory を払って起点の隣のノードから取得する', async () => {
  expect(weightedTokens(usage(100, 50, 1000))).toBe(250)
  let save = gainTokens(newSave(), nodeCost(1, 0) * TOKENS_PER_MEMORY)
  expect(save.memory).toBe(nodeCost(1, 0))
  const far = [...TREE_NODES.values()].find(node => node.tier === 1 && node.size === 'keystone')!
  expect(allocate(save, far.id)).toBe(save)
  const near = availableNodes(save).find(node => node.text === '防御力 +2')!
  expect(near.links.some(isStart)).toBe(true)
  const before = defense(save)
  save = allocate(save, near.id)
  expect(save.allocated).toEqual([near.id])
  expect(save.spent).toBe(nodeCost(1, 0))
  expect(defense(save)).toBe(before + 2)
  expect(save.memory).toBe(0)
})

test('レベルや強化ランクのある旧セーブは、上げた分の memory を払い戻す', async () => {
  const legacy = { ...newSave(), allocated: undefined, level: 3, exp: 5, gold: 300 } as unknown as Save
  const save = migrate(legacy)
  expect(save.allocated).toEqual([])
  expect(save.memory).toBe((35 + Math.ceil(35 * 2 ** 1.5)) * 3)
  expect('gold' in save).toBe(false)
  expect('level' in save).toBe(false)
})

test('ツリーは T1〜T10 の 10 ページで、前のページのキーストーンを取ると次のページが開き、効果と費用が大きくなる', async () => {
  expect(PAGES).toBe(10)
  // 前のページのキーストーンを取ると次のページが開く。ダンジョンの階には関係しない
  expect(unlockedPages(newSave())).toBe(1)
  expect(unlockedPages({ ...newSave(), maxFloor: 999 })).toBe(1)
  const keystone = (tier: number) => [...TREE_NODES.values()].find(node => node.tier === tier && node.size === 'keystone')!.id
  const others = [...TREE_NODES.values()].filter(node => node.tier === 1 && node.size !== 'keystone' && !isStart(node.id)).map(node => node.id)
  expect(unlockedPages({ ...newSave(), allocated: others })).toBe(1)
  expect(unlockedPages({ ...newSave(), allocated: [keystone(1)] })).toBe(2)
  expect(unlockedPages({ ...newSave(), allocated: [keystone(1), keystone(2)] })).toBe(3)
  // 前のどれかのページのキーストーンが欠けていると、その先のページでは新しく取れない
  expect(unlockedPages({ ...newSave(), allocated: [keystone(2)] })).toBe(1)
  const half = (_tier: number) => [keystone(1)]
  const atkNode = (tier: number) => [...TREE_NODES.values()].find(node => node.tier === tier && node.name === '剛力')!
  expect(atkNode(2).text).toBe('攻撃力 +6')
  expect(atkNode(3).text).toBe('攻撃力 +9')
  expect(nodeCost(3, 0)).toBe(nodeCost(1, 0) * 4)
  const save = { ...newSave(), memory: 1e9 }
  expect(availableNodes(save, 2)).toEqual([])
  expect(availableNodes({ ...save, allocated: half(1) }, 2).length).toBe(4)
})

test('1 ページだった頃のノード ID は T1 のものとして読み直し、盤面から無くなったノードは払い戻す', async () => {
  const root = [...TREE_NODES.values()].find(node => node.tier === 1 && node.links.some(isStart))!
  const key = root.id.slice(2)
  const save = migrate({ ...newSave(), allocated: [key, '999,999'] })
  expect(save.allocated).toEqual([root.id])
  expect(save.memory).toBe(nodeCost(1, 1))
})

test('盤面の形はページごとに違い、T が上がるほど深くなる', async () => {
  const depthOf = (tier: number) => {
    const nodes = [...TREE_NODES.values()].filter(node => node.tier === tier)
    const start = nodes.find(node => isStart(node.id))!
    const depth = new Map([[start.id, 0]])
    const queue = [start.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      for (const link of TREE_NODES.get(id)!.links) if (!depth.has(link)) (depth.set(link, depth.get(id)! + 1), queue.push(link))
    }
    // 盤面のノードはすべて起点からたどれる
    expect(depth.size).toBe(nodes.length)
    return Math.max(...depth.values())
  }
  expect(depthOf(1) < depthOf(5)).toBe(true)
  expect(depthOf(5) < depthOf(10)).toBe(true)
  const shape = (tier: number) => [...TREE_NODES.values()].filter(node => node.tier === tier && node.branch === 'atk').map(node => `${node.x},${node.y}`).sort().join(' ')
  expect(shape(5)).not.toBe(shape(6))
})

test('どのページも 4 系統で、T1 は枝分かれの無い 1 本道、T が上がるほど深く枝分かれも増える', async () => {
  const branches = (tier: number) => new Set([...TREE_NODES.values()].filter(node => node.tier === tier && node.branch !== 'start').map(node => node.branch))
  for (const tier of [1, 2, 3, 10]) expect(branches(tier)).toEqual(new Set(['atk', 'def', 'hp', 'loot']))
  // 1 本道は、起点以外のどのノードもつながりが 2 本以下 (行き止まりは 1 本)
  const t1 = [...TREE_NODES.values()].filter(node => node.tier === 1 && !isStart(node.id))
  expect(t1.every(node => node.links.length <= 2)).toBe(true)
  const forks = (tier: number) => [...TREE_NODES.values()].filter(node => node.tier === tier && !isStart(node.id) && node.links.length >= 3).length
  expect(forks(5) > forks(2)).toBe(true)
})

test('memory は K / M / G で省略して表示する', async () => {
  expect(formatAmount(999)).toBe('999')
  expect(formatAmount(1234)).toBe('1.2K')
  expect(formatAmount(9999)).toBe('9.9K')
  expect(formatAmount(12_345)).toBe('12K')
  expect(formatAmount(3_400_000)).toBe('3.4M')
  expect(formatAmount(5_000_000_000)).toBe('5G')
})

test('階は 5 部屋あり、敵は各部屋の決まった位置に並び、勇者は順に倒しながら最後の部屋の階段で次の階へ降りる', async () => {
  expect(populate(3, 1, 0).map(monster => monster.x)).toEqual([6, 11, 16, 21])
  expect(populate(3, 1, 12).map(monster => monster.x)).toEqual([16, 21])
  let save: Save = { ...newSave(), inventory: [{ id: 'i0', name: '木の棒', kind: 'weapon', power: 999 }, { id: 'i1', name: '布の服', kind: 'armor', power: 999 }], armor: 'i1' }
  let scene = newScene()
  const rooms = new Set<number>()
  for (let i = 0; i < 2000 && save.floor === 1; i++) {
    const r = step(save, scene, () => 0.99)
    save = r.save
    scene = r.scene
    rooms.add(scene.room ?? 1)
  }
  expect([...rooms].sort()).toEqual([1, 2, 3, 4, 5])
  expect(save.floor).toBe(2)
  expect(save.maxFloor).toBe(2)
  expect(save.kills).toBe(20)
  // 階段で降りると全回復する
  expect(save.hp).toBe(maxHp(save))
})

test('敵と遭遇すると戦闘し、倒すと討伐数が増え、少し memory が手に入る', async () => {
  let save = newSave()
  let scene = newScene()
  let calls = 0
  const rng = () => (calls++ === 0 ? 0 : 0.5)
  for (let i = 0; i < 40 && save.kills === 0; i++) {
    const r = step(save, scene, rng)
    save = r.save
    scene = r.scene
  }
  expect(save.kills).toBe(1)
  expect(save.memory).toBe(killMemory(1, { isBoss: false }))
  expect(save.memory > 0).toBe(true)
})

test('敵は 10 階ごとに Tier が上がり、名前の T 番号が上がる', async () => {
  expect(tierOf(10)).toBe(0)
  expect(tierOf(11)).toBe(1)
  expect(spawn(5, 3, () => 0).name).toBe('T1スライム')
  expect(spawn(15, 3, () => 0).name).toBe('T2スライム')
  expect(spawn(25, 3, () => 0).name).toBe('T3スライム')
})

test('10 階ごとのボスの階は部屋 1 つだけで、階段の手前にユニークボスがいて、倒すと次の Tier の装備を落とす', async () => {
  let save: Save = { ...newSave(), floor: 10, inventory: [{ id: 'i0', name: '木の棒', kind: 'weapon', power: 999 }, { id: 'i1', name: '布の服', kind: 'armor', power: 999 }], armor: 'i1', hp: 30 }
  let scene = newScene()
  const names: string[] = []
  for (let i = 0; i < 2000 && save.floor === 10; i++) {
    const r = step(save, scene, () => 0.99)
    if (r.scene.monster) names.push(r.scene.monster.name)
    save = r.save
    scene = r.scene
  }
  // ボスは最後の位置 (階段の手前) で待っている
  expect(names.at(-1)).toBe('キングスライム')
  // ボスの階は部屋が 1 つだけで、その部屋の最後の位置にボスがいる
  expect(roomsOn(10)).toBe(1)
  expect(roomsOn(11)).toBe(5)
  expect(populate(10, 1, 0).at(-1)?.isBoss).toBe(true)
  expect(populate(11, 5, 0).some(monster => monster.isBoss)).toBe(false)
  // ボスの階以外は、最後の部屋の最後にミニボスがいる。同じ Tier の階は同じミニボス
  expect(populate(11, 5, 0).at(-1)?.isMiniBoss).toBe(true)
  expect(populate(12, 5, 0).at(-1)?.name).toBe(populate(19, 5, 0).at(-1)?.name)
  expect(populate(11, 1, 0).some(monster => monster.isMiniBoss)).toBe(false)
  expect(save.floor).toBe(11)
  expect(save.inventory.some(item => item.name === '銅の剣' || item.name === '革の鎧')).toBe(true)
  expect(spawnBoss(20, 0).name).toBe('ヴァンパイアロード')
  expect(spawnBoss(110, 0).name).toBe('真・キングスライム')
})

test('装備には 10 段階の品質があり、品質が高いほど性能が上がる', async () => {
  const common = makeEquipment('a', 1, 1, () => 0)
  const ultimate = makeEquipment('b', 1, 1, (() => { let n = 0; return () => (n++ === 0 ? 0.9999 : 0) })())
  expect(QUALITIES.length).toBe(10)
  expect(common.quality).toBe(0)
  expect(ultimate.quality).toBe(9)
  expect(ultimate.power > common.power * 2).toBe(true)
  expect(displayName(ultimate)).toBe('[アルティメット] 銅の剣')
})

test('取得したノードの効果は全ページ分を合算して一覧にできる', async () => {
  const pick = (tier: number, name: string) => [...TREE_NODES.values()].find(node => node.tier === tier && node.name === name)!.id
  const save = { ...newSave(), maxFloor: 11, allocated: [pick(2, '剛力'), pick(3, '剛力'), pick(1, '堅守')] }
  // T1 の起点の効果 (最大 HP +50、攻撃力 +5、防御力 +5) も合算に入る
  expect(modLines(mods(save))).toEqual(['攻撃力 +20', '防御力 +7', '最大 HP +50'])
})

test('インベントリがあふれたら一番弱い装備を分解して memory にする', async () => {
  const items = Array.from({ length: 20 }, (_, i) => makeEquipment(`x${i}`, 1, 1, () => 0.3))
  const save: Save = { ...newSave(), memory: 0, inventory: [...newSave().inventory, ...items.slice(0, 19)] }
  const monster = { ...spawnMiniBoss(1, 6), hp: 1 }
  // ミニボスに強奪をかけて必ず落とさせ、21 個目で一番弱い 1 個を分解させる
  const r = step({ ...save, buffs: { plunder: true } }, { ...newScene(), phase: 'fight', x: 5, monster, frame: 1 }, () => 0.5)
  expect(r.save.inventory.length).toBe(20)
  expect(r.save.memory > 0).toBe(true)
})

test('扉を抜けて次の部屋へ入っても HP は回復しない', async () => {
  const save = { ...newSave(), hp: 10 }
  const r = step(save, { ...newScene(2), phase: 'door', wait: 1, x: CORRIDOR - 1 }, () => 0.5)
  expect(r.scene.room).toBe(3)
  expect(r.save.hp).toBe(10)
})

test('倒されたら同じ階の 1 部屋目から、HP 全快でやり直す', async () => {
  const monster = { ...spawn(5, 6, () => 0.5), atk: 9999 }
  const save = { ...newSave(), floor: 5, maxFloor: 5, hp: 1 }
  let r = step(save, { ...newScene(3), phase: 'fight', x: 5, monster, frame: 0 }, () => 0.5)
  expect(r.scene.phase).toBe('dead')
  expect(r.save.floor).toBe(5)
  expect(r.save.hp).toBe(maxHp(save))
  for (let i = 0; i < 10 && r.scene.phase === 'dead'; i++) r = step(r.save, r.scene, () => 0.5)
  expect(r.scene.room).toBe(1)
  expect(r.save.floor).toBe(5)
})

test('取得済みのノードは、起点からのつながりが切れない末端だけ払い戻せる', async () => {
  let save: Save = { ...newSave(), memory: 1e6 }
  const first = availableNodes(save, 1)[0]!
  save = allocate(save, first.id)
  const second = availableNodes(save, 1).find(node => node.links.includes(first.id))!
  save = allocate(save, second.id)
  const memory = save.memory
  // 途中のノードは外せない
  expect(refund(save, first.id)).toBe(save)
  // 末端は外せて、外したあとに次に取るときの費用と同じ額が戻る
  const after = refund(save, second.id)
  expect(after.allocated).toEqual([first.id])
  expect(after.memory).toBe(memory + nodeCost(1, 1))
  expect(after.spent).toBe(nodeCost(1, 0))
})

test('鍛錬は必ず成功して品質が 1 段上がる。費用は「基本の費用 ÷ 上げた先の品質の出現確率」', async () => {
  const sword = makeEquipment('w', 1, 1, () => 0)
  const save: Save = { ...newSave(), memory: 1e9, inventory: [sword], weapon: 'w' }
  expect(forgeRate(sword)).toBe(0.25)
  expect(forgeRate({ ...sword, quality: 8 })).toBe(0.002)
  const cost = forgeCost(sword)
  const ok = forge(save, 'weapon')
  expect(ok.result).toBe('success')
  const forged = ok.save.inventory[0]!
  expect(forged.quality).toBe(1)
  expect(forged.power > sword.power).toBe(true)
  expect(ok.save.memory).toBe(1e9 - cost)
  // 成功率 25% のときの平均の費用と同じなので、確率 15% (レアへ) に上げる次の鍛錬は 1 回あたりの費用以上に高くなる
  expect(forgeCost(forged) > cost).toBe(true)
  // 効率が上がると安くなる
  expect(forgeCost(sword, 0.25) < cost).toBe(true)
  expect(forge({ ...save, memory: 0 }, 'weapon').result).toBe('none')
})

test('一括分解は装備中以外の武器・防具をすべて memory に変える', async () => {
  const a = makeEquipment('a', 1, 1, () => 0)
  const b = makeEquipment('b', 2, 1, () => 0.9)
  const save: Save = { ...newSave(), memory: 0, inventory: [...newSave().inventory, a, b] }
  const after = salvageAll(save)
  expect(after.inventory.map(item => item.id)).toEqual(['i0'])
  expect(after.memory).toBe(salvageValue(a) + salvageValue(b))
  expect(salvageAll(after)).toBe(after)
})

test('盤面には斜めのつながりもあり、線を読み直したつながりと一致する', async () => {
  const diagonal = [...TREE_NODES.values()].some(node =>
    node.links.some(link => {
      const other = TREE_NODES.get(link)!
      return other.x !== node.x && other.y !== node.y
    }),
  )
  expect(diagonal).toBe(true)
  // つながりは双方向
  for (const node of TREE_NODES.values()) for (const link of node.links) expect(TREE_NODES.get(link)!.links).toContain(node.id)
})

test('小ノードは取得後に Lv5 まで上げられ、効果が Lv 倍になる。Backspace で 1 Lv ずつ戻せる', async () => {
  let save: Save = { ...newSave(), memory: 1e9 }
  const small = availableNodes(save, 1).find(node => node.size === 'small')!
  save = allocate(save, small.id)
  const once = mods(save)
  for (let i = 0; i < 6; i++) save = allocate(save, small.id)
  expect(save.nodeLevels?.[small.id]).toBe(5)
  const key = (Object.keys(small.mods) as (keyof typeof once)[])[0]!
  // 起点の効果が同じ種類に入っていることがあるので、それを除いて比べる
  const base = mods(newSave())[key] as number
  expect((mods(save)[key] as number) - base).toBe(((once[key] as number) - base) * 5)
  const memory = save.memory
  const down = refund(save, small.id)
  expect(down.nodeLevels?.[small.id]).toBe(4)
  expect(down.allocated).toContain(small.id)
  expect(down.memory > memory).toBe(true)
})

test('キーストーンは 1 ページに 1 つまでしか取れない', async () => {
  let save: Save = { ...newSave(), memory: 1e12 }
  for (let i = 0; i < 200; i++) {
    const next = availableNodes(save, 1)[0]
    if (!next) break
    save = allocate(save, next.id)
  }
  const keystones = save.allocated.filter(id => TREE_NODES.get(id)?.size === 'keystone')
  expect(keystones.length).toBe(1)
  expect([...TREE_NODES.values()].filter(node => node.tier === 1 && node.size === 'keystone').length).toBe(4)
})

test('キーストーンは次のページでノードを取っていても戻せ、戻すとその先のページでは新しく取れなくなる', async () => {
  let save: Save = { ...newSave(), memory: 1e12 }
  const keystone = [...TREE_NODES.values()].find(node => node.tier === 1 && node.size === 'keystone')!
  for (let i = 0; i < 50 && !save.allocated.includes(keystone.id); i++) {
    const next = availableNodes(save, 1)
    save = allocate(save, (next.find(node => node.id === keystone.id) ?? next.find(node => node.size !== 'keystone') ?? next[0]!).id)
  }
  const t2 = availableNodes(save, 2)[0]!
  save = allocate(save, t2.id)
  expect(save.allocated).toContain(t2.id)
  const back = refund(save, keystone.id)
  expect(back.allocated).not.toContain(keystone.id)
  expect(back.allocated).toContain(t2.id)
  expect(availableNodes(back, 2)).toEqual([])
})

test('ダメージは攻撃力と防御力の比で決まり、防御力が少し変わっただけでは急に変わらない', async () => {
  expect(ratioDamage(20, 20)).toBe(10)
  expect(Math.abs(ratioDamage(20, 40) - 20 / 3) < 1e-9).toBe(true)
  // 防御 13 → 21 で、引き算なら 8 → 1 (最低値) に落ちるところが、比の式ではなだらかに減る
  const before = ratioDamage(21, 13)
  const after = ratioDamage(21, 21)
  expect(after / before > 0.75).toBe(true)
  expect(ratioDamage(10, 1000) > 0).toBe(true)
})

test('トークンから得る memory は、強化ツリーのページが 1 つ開くごとに 2 倍になる', async () => {
  const keystone = (tier: number) => [...TREE_NODES.values()].find(node => node.tier === tier && node.size === 'keystone')!.id
  expect(tokenMultiplier(newSave())).toBe(1)
  expect(tokenMultiplier({ ...newSave(), allocated: [keystone(1)] })).toBe(2)
  expect(tokenMultiplier({ ...newSave(), allocated: [keystone(1), keystone(2)] })).toBe(4)
  const save = gainTokens({ ...newSave(), allocated: [keystone(1), keystone(2)] }, 10 * TOKENS_PER_MEMORY)
  expect(save.memory).toBe(40)
})

test('マップで選んだ階を周回すると、階段を降りても同じ階をもう一周する。自動攻略に戻すと一番深い階から進む', async () => {
  const strong: Save = { ...newSave(), maxFloor: 7, floor: 7, inventory: [{ id: 'i0', name: '木の棒', kind: 'weapon', power: 999 }, { id: 'i1', name: '布の服', kind: 'armor', power: 999 }], armor: 'i1' }
  expect(farm(strong, 9)).toBe(strong)
  let save = farm(strong, 3)
  expect(save.floor).toBe(3)
  expect(save.farmFloor).toBe(3)
  const r = step(save, { ...newScene(5), phase: 'stairs', wait: 1, x: CORRIDOR - 1 }, () => 0.5)
  expect(r.save.floor).toBe(3)
  save = autoExplore(r.save)
  expect(save.farmFloor).toBeUndefined()
  expect(save.floor).toBe(7)
  const next = step(save, { ...newScene(5), phase: 'stairs', wait: 1, x: CORRIDOR - 1 }, () => 0.5)
  expect(next.save.floor).toBe(8)
})

test('敵の顔ぶれは階ごとに固定で、主に出る敵に偏る', async () => {
  const kinds = (floor: number) => [1, 2, 3, 4, 5].flatMap(room => populate(floor, room, 0)).map(monster => monster.ch)
  // 同じ階は何度来ても同じ顔ぶれ
  expect(kinds(17)).toEqual(kinds(17))
  const counts = new Map<string, number>()
  for (const ch of kinds(17)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const top = Math.max(...counts.values())
  // 20 体のうち、主に出る敵が一番多い
  expect(top >= 8).toBe(true)
  const theme = floorTheme(17)
  expect(theme.main).not.toBe(theme.sub)
  expect(floorFeature(17)).toContain('の')
  expect(floorFeature(20)).toContain('の間')
})

test('敵・装備・遺物の名前は言語ごとに引き直せる', async () => {
  const orc = populate(1, 1, 0)[0]!
  expect(monsterName(orc, 'ja')).toBe(orc.name)
  expect(monsterName(orc, 'en').startsWith('T1 ')).toBe(true)
  const boss = populate(10, 1, 0).find(one => one.isBoss)!
  expect(monsterName(boss, 'ja')).toBe(boss.name)
  expect(monsterName(boss, 'en')).not.toBe(boss.name)
  const item = makeEquipment('i1', 0, 1, () => 0.3)
  expect(itemName(item, 'ja')).toBe(item.name)
  expect(displayName(item, 'en')).toMatch(/^\[[A-Za-z ]+\] [A-Za-z ]+/)
  const relic = makeRelic('r1', 1, () => 0.3)
  expect(relicName(relic, 'ja')).toBe(relic.name)
  expect(relicName(relic, 'en')).toMatch(/^[A-Za-z' ]+$/)
})

test('memory が足りて取れるノードがあるときだけ、強化できると判定する', async () => {
  const save = newSave()
  expect(canAffordUpgrade(save)).toBe(false)
  expect(canAffordUpgrade({ ...save, memory: nodeCost(1, 0) })).toBe(true)
  expect(canAffordUpgrade({ ...save, memory: nodeCost(1, 0) - 1 })).toBe(false)
})

test('起点の効果: T1 は最大 HP・攻撃力・防御力、T2 以降はそれをページごとに増やした値とトークン倍率 ×2', async () => {
  const start = (tier: number) => [...TREE_NODES.values()].find(node => node.tier === tier && isStart(node.id))!
  expect(nodeText(start(1), 0)).toBe('攻撃力 +5、防御力 +5、最大 HP +50')
  expect(nodeText(start(2), 0)).toBe('トークン倍率 ×2、攻撃力 +6、防御力 +6、最大 HP +60')
  const save = newSave()
  expect(maxHp(save)).toBe(51)
  expect(tokenMultiplier(save)).toBe(1)
})

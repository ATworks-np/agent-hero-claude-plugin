// ゲームバランスに効く数値 (確率・倍率・上限・費用・伸び方・効果量・待ち時間)。値だけを置き、処理は書かない。
// 名前・説明文・記号・色はバランスに関係しないので config/content.ts に置く。
// シミュレーション (tools/simulate.sh) は --set <名前>=<値> でここの値を書き換えて試せる (例: --set monster.hpGrowth=14)。
// 目標: 作業日 1 日 1,300 万トークン・セッション 6 時間・土日休みで、1 日目に強化の T2、1 か月で地下 100 階

export const BALANCE = {
  // memory の出入り
  economy: {
    // 1 memory になるトークンの数
    tokensPerMemory: 1000,
    // キャッシュ読み込みのトークンは毎回会話全体ぶん数えられて桁違いに大きいので、この数で割って数える
    cacheReadDivisor: 10,
    // 強化のページが 1 つ開くごとに、トークンから得る memory がこの倍率で増える (T1 だけなら ×1)
    tokenMultiplierPerPage: 2,
    // 分解でもらえる memory は、鍛錬の 1 回あたりの基本の費用にこの割合を掛けた量
    salvageRatio: 0.25,
    // 敵を倒したときにもらえる memory = (base + perFloor × 階) × 敵の種類の倍率。トークンから得る量に比べてわずか
    killMemory: { base: 0.2, perFloor: 0.05, miniboss: 5, boss: 20 },
  },

  // 勇者
  hero: {
    // 強化で伸ばす前の最大 HP・攻撃力・防御力。冒険を始めたときの値は、これに T1 の起点の効果 (tree.startMods) を足したもの
    baseHp: 1,
    baseAtk: 1,
    baseDef: 1,
    // 攻撃力・防御力の割合の増減を合計しても、元の値にこの倍率より下げない (キーストーンのマイナスが積み重なっても詰まないように)
    minPctScale: 0.25,
    inventoryCap: 20,
    // 最初から持っている武器の性能
    starterWeaponPower: 1,
  },

  // 強化の効果を積み重ねたときの上限 (確率や軽減が 100% に近づいて、敵の攻撃を一切受けなくなるのを防ぐ)
  caps: {
    crit: 0.75,
    double: 0.5,
    execute: 0.4,
    parry: 0.5,
    will: 0.8,
    counter: 0.6,
    bulwark: 0.6,
    firstaid: 0.3,
    luckChance: 1,
  },

  // ダンジョン
  dungeon: {
    // 1 部屋の長さ (マス)
    corridor: 28,
    roomsPerFloor: 5,
    // ボスの階の部屋の数
    bossFloorRooms: 1,
    // 各部屋で敵が立つ位置。ボスの部屋は最後の位置にボスが立つ
    spawnPoints: [6, 11, 16, 21],
    // 何階ごとに Tier (敵の名前の T 番号・装備の段階) が上がるか。ボスはこの倍数の階に出る
    floorsPerTier: 10,
    // 各 Tier の 1 階目に出る敵の種類の数。階を下りるごとに 1 種ずつ増える
    firstFloorKinds: 4,
    // 敵の顔ぶれは階ごとに固定で、主に出る敵と次に多い敵が決まっている。それぞれが出る割合 (残りはその階に出うる他の敵)
    mainKindShare: 0.6,
    subKindShare: 0.25,
    // 勇者が 1 歩進む間隔 (ミリ秒)
    stepMs: 500,
    // 扉・階段・倒されたあとに止まる歩数
    doorWait: 2,
    stairsWait: 4,
    deathWait: 8,
  },

  // 敵。HP = (hpBase + 階 × hpPerFloor) × 種類の倍率 × (1 + ((階 − 1) / hpGrowth)^3)
  //     攻撃力 = (atkBase + 階 × atkPerFloor) × 種類の倍率 × (1 + (階 − 1) / atkGrowth)
  //     防御力 = (defBase + 階 × defPerFloor) × (1 + (階 − 1) / atkGrowth)
  monster: {
    hpBase: 8,
    hpPerFloor: 6,
    atkBase: 3,
    atkPerFloor: 1.2,
    defBase: 1,
    defPerFloor: 0.8,
    // HP は 3 乗で、浅い階ではほとんど増えず深い階で急に増える。小さいほど敵が硬い
    hpGrowth: 7,
    atkGrowth: 60,
    bossDefMult: 1.5,
    // 種類ごとの HP・攻撃力の倍率 (ID は config/content.ts の monsters と同じ)
    kinds: {
      slime: { hp: 0.7, atk: 0.7 },
      bat: { hp: 0.6, atk: 0.9 },
      rat: { hp: 0.7, atk: 0.8 },
      goblin: { hp: 0.9, atk: 1.0 },
      wolf: { hp: 0.9, atk: 1.2 },
      skeleton: { hp: 1.0, atk: 1.0 },
      zombie: { hp: 1.3, atk: 0.9 },
      orc: { hp: 1.2, atk: 1.2 },
      gargoyle: { hp: 1.1, atk: 1.3 },
      golem: { hp: 1.6, atk: 1.0 },
    },
    // ボスの HP・攻撃力の倍率と特性。regen: 受けたダメージの一部を取り戻す / drain: 与えたダメージの一部を回復する /
    // double: 何回かに 1 回の攻撃が 2 倍 / armor: 受けるダメージが減る
    bosses: {
      kingslime: { hp: 4, atk: 1.2, trait: 'regen' },
      vampire: { hp: 3.5, atk: 1.3, trait: 'drain' },
      minotaur: { hp: 4, atk: 1.5, trait: 'double' },
      lich: { hp: 3.5, atk: 1.4, trait: 'drain' },
      cerberus: { hp: 4, atk: 1.6, trait: 'double' },
      kraken: { hp: 5, atk: 1.3, trait: 'regen' },
      behemoth: { hp: 5.5, atk: 1.4, trait: 'armor' },
      fallen: { hp: 4.5, atk: 1.7, trait: 'double' },
      elderdragon: { hp: 6, atk: 1.6, trait: 'armor' },
      demonking: { hp: 7, atk: 1.8, trait: 'regen' },
    },
    // ミニボスの HP・攻撃力・防御力の倍率
    miniboss: { hp: 2.5, atk: 1.2, def: 1.2 },
    traits: {
      // 受けたダメージのうち取り戻す割合
      regen: 0.2,
      // 与えたダメージのうち回復する割合
      drain: 0.5,
      // 何回目の攻撃ごとに 2 倍になるか (勇者と敵の攻撃を合わせた回数で数える)
      doubleEvery: 6,
      // 受けるダメージに掛ける倍率
      armor: 0.6,
    },
  },

  // 戦闘
  combat: {
    // ダメージの揺れ (±この割合)
    spread: 0.1,
    critMult: 2,
    // HP がこの割合未満のときに「鉄の意志」が、この割合以下のときに「背水」が効く
    willBelow: 0.3,
    desperateBelow: 0.5,
    // 「強打」は何回目の攻撃ごとに効くか
    powerHitEvery: 3,
    // 「反撃」で返すのは攻撃力のこの割合
    counterRatio: 0.5,
  },

  // 装備
  equipment: {
    // 装備を落とすのはミニボスとボスだけ。ミニボスが落とす確率 (ボスは必ず落とす)
    minibossDropRate: 0.5,
    // 性能 = (Tier × perTier + base + 階の深さの分 + 0〜roll−1) × 品質の倍率
    weapon: { perTier: 15, base: 2, depthDivisor: 2, roll: 5 },
    armor: { perTier: 10, base: 1, depthDivisor: 3, roll: 3 },
    // 品質 1 段ごとに性能に足す割合
    qualityStep: 0.15,
    // 品質ごとの出やすさの比 (コモン〜アルティメット)。鍛錬の費用もこの比から決まる
    qualityWeights: [400, 250, 150, 90, 50, 28, 16, 9, 5, 2],
    // ボスが落とす装備の品質の下限 (0 がコモン)
    bossMinQuality: 2,
    // この品質以上を拾ったらトーストで知らせる
    notableQuality: 4,
    // 鍛錬の 1 回あたりの基本の費用 = forgeBase × 品質を除いた元の性能 × forgeGrowth ^ 今の品質。
    // 実際の費用は、それを上げた先の品質の出る確率で割った値
    forgeBase: 20,
    forgeGrowth: 1.4,
  },

  // 遺物
  relic: {
    // ボスが落とす確率
    dropRate: 0.15,
    cap: 20,
    // 付与の数 = affixesAtTier1 + (Tier − 1)
    affixesAtTier1: 2,
    // 割合の付与効果は Tier が 1 上がるごとにこの割合で大きくなる。固定値の付与効果は Tier 倍
    pctPerTier: 0.25,
    // 値の幅の抽選。基準値に掛ける倍率の下限を low、上限を high の範囲から選び、その間で値を引く
    factorLow: [0.3, 1.0],
    factorHigh: [1.0, 2.5],
    // 付与効果の候補と Tier 1 での基準値。flat は固定値 (Tier 倍)、integer は整数に丸める
    affixes: {
      atkFlat: { base: 4, flat: true, integer: true },
      defFlat: { base: 3, flat: true, integer: true },
      hpFlat: { base: 15, flat: true, integer: true },
      atkPct: { base: 0.06 },
      defPct: { base: 0.06 },
      hpPct: { base: 0.06 },
      crit: { base: 0.02 },
      lifesteal: { base: 0.01 },
      regen: { base: 0.005 },
      dropRate: { base: 0.01 },
      qualityUp: { base: 0.02 },
      bossDmg: { base: 0.06 },
      powerHit: { base: 0.1 },
      double: { base: 0.02 },
      execute: { base: 0.02 },
      bleed: { base: 0.003 },
      parry: { base: 0.015 },
      will: { base: 0.05 },
      counter: { base: 0.02 },
      thorns: { base: 0.03 },
      bulwark: { base: 0.03 },
      firstaid: { base: 0.01 },
      desperate: { base: 0.05 },
      smith: { base: 0.03 },
      salvager: { base: 0.05 },
      luckChance: { base: 0.02 },
      tokenMult: { base: 0.2 },
      spBonus: { base: 1, flat: true, integer: true },
    } as Record<string, { base: number; flat?: boolean; integer?: boolean }>,
  },

  // 強化 (強化ツリー)
  tree: {
    pages: 10,
    // T1 の起点の効果。ページが開いていれば、取得の操作なしで効く。
    // T2 以降の起点は、これに加えてトークン倍率を economy.tokenMultiplierPerPage 倍にする効果を持つ (tree.ts の startMods)
    startMods: { hpFlat: 50, atkFlat: 5, defFlat: 5 } as Record<string, number>,
    // T(n) の起点の効果 = startMods × startGrowth ^ (n − 1)。0 にすると T2 以降の起点はトークン倍率だけになる
    startGrowth: 1.2,
    // 費用 = baseCost × pageCostMult ^ (T − 1) × (そのページでの購入回数 + 1) ^ costExponent
    baseCost: 340,
    pageCostMult: 2,
    costExponent: 1.0,
    // 小ノードの最大 Lv (Lv 上げも購入 1 回と数える)
    maxNodeLevel: 5,
    // ノードの効果は、固定値はページの T 倍、割合は T が 1 上がるごとにこの割合ずつ大きくなる。キーストーンは同じ
    pctPerTier: 0.25,
    // 1 系統の幹の長さ = trunkBase + T。枝のノード数 = 幹の長さ × min(1, branchPerTier × T) (T1 は枝なし)
    trunkBase: 4,
    branchPerTier: 0.1,
    // 1 系統あたりの SP ノードの最大数。ノードが少ない系統では 3 つに 1 つの割合まで減らす
    spNodesPerArm: 3,
    // ノードの効果 (ノードの文字は config/content.ts の treeNodes と同じ)
    nodes: {
      a: { atkFlat: 3 },
      A: { atkPct: 0.12 },
      c: { crit: 0.03 },
      C: { crit: 0.08, atkPct: 0.05 },
      Q: { atkPct: 0.2, defPct: -0.1 },
      d: { defFlat: 2 },
      D: { defPct: 0.15 },
      W: { defPct: 0.25, atkPct: -0.08 },
      h: { hpFlat: 15 },
      H: { regen: 0.02 },
      v: { lifesteal: 0.02 },
      V: { lifesteal: 0.06, hpPct: -0.1 },
      l: { dropRate: 0.02 },
      L: { qualityUp: 0.1 },
      F: { luck: true },
      b: { bossDmg: 0.05 },
      B: { bossDmg: 0.2 },
      P: { powerHit: 0.5 },
      R: { double: 0.05 },
      E: { execute: 0.05 },
      G: { bleed: 0.01 },
      U: { parry: 0.04 },
      I: { will: 0.15 },
      K: { counter: 0.08 },
      T: { thorns: 0.08 },
      N: { bulwark: 0.06 },
      M: { firstaid: 0.03 },
      Y: { hpPct: 0.06 },
      Z: { desperate: 0.08 },
      J: { undying: true },
      q: { dropRate: 0.04 },
      m: { smith: 0.1 },
      n: { salvager: 0.15 },
      p: { luckChance: 0.05 },
    } as Record<string, Record<string, number | boolean>>,
  },

  // スキル (スキルツリー)
  skills: {
    slots: 3,
    maxLevel: 5,
    // 習得の費用 (SP) = 1 + floor(習得済みの数 / learnCostStep)
    learnCostStep: 6,
    // 強化の費用 (SP)。Lv によらず一律
    upgradeCost: 1,
    // 効果量 = base + perLevel × Lv + floor(Lv / every)。待ち時間 = cooldown + cooldownPerLevel × Lv (勇者の攻撃の回数)。
    // 残りの名前は効果ごとの値 (turns: 続く攻撃の回数、below / above: 使う HP の割合など)
    list: {
      slash: { base: 2.5, perLevel: 0.5, cooldown: 4 },
      flurry: { base: 0.6, perLevel: 0.1, cooldown: 5, hits: 3 },
      behead: { base: 0.2, perLevel: 0.05, cooldown: 8, bossBase: 3, bossPerLevel: 1 },
      berserk: { base: 1.5, perLevel: 0.25, cooldown: 10, turns: 3 },
      thunder: { base: 0.08, perLevel: 0.03, cooldown: 6, bossRatio: 0.5 },
      dragonslayer: { base: 4, perLevel: 1, cooldown: 10 },
      ironwall: { base: 2, every: 2, cooldown: 10 },
      endure: { base: 3, cooldown: 16, cooldownPerLevel: -1, below: 0.4 },
      riposte: { base: 1.5, perLevel: 0.5, cooldown: 6 },
      shieldbash: { base: 1, every: 3, cooldown: 8 },
      mirror: { base: 0.3, perLevel: 0.1, cooldown: 12, turns: 4 },
      intimidate: { base: 0.2, perLevel: 0.05, cooldown: 9, turns: 4 },
      heal: { base: 0.2, perLevel: 0.05, cooldown: 6, below: 0.6 },
      revive: { base: 1, cooldown: 40, cooldownPerLevel: -5, below: 0.25 },
      regen: { base: 0.04, perLevel: 0.01, cooldown: 12, turns: 5, below: 0.8 },
      drain: { base: 1.2, perLevel: 0.2, cooldown: 5, heal: 0.5 },
      sanctuary: { base: 0.1, perLevel: 0.05, cooldown: 14, turns: 2, below: 0.5 },
      sacrifice: { base: 3, perLevel: 1, cooldown: 7, above: 0.5, hpCost: 0.15 },
      plunder: { base: 1, cooldown: 12, cooldownPerLevel: -1 },
      soulhunt: { base: 2, perLevel: 1, cooldown: 8 },
      appraise: { base: 1, cooldown: 11, cooldownPerLevel: -1 },
      goldenhand: { base: 1, every: 4, cooldown: 15 },
      scent: { base: 0.3, perLevel: 0.1, cooldown: 10, kills: 3 },
      windfall: { base: 5, perLevel: 5, cooldown: 20 },
    } as Record<string, { base: number; perLevel?: number; every?: number; cooldown: number; cooldownPerLevel?: number } & Record<string, number>>,
  },
}

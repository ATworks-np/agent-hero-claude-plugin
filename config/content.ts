// バランスに関係しないもの (名前・説明文・記号・色・盤面の文字の割り当て)。値だけを置き、処理は書かない。
// 数値 (確率・倍率・効果量など) は config/balance.ts に置く。同じ ID・文字で両方を対応づける。

export const CONTENT = {
  // トークンから得る強化資源の名前
  memoryName: 'memory',

  // ダンジョン。今は 1 つだけで、セーブに入るダンジョンの ID が無ければ先頭のダンジョンにいる扱い
  dungeons: [{ id: 'beginning', name: 'はじまりのダンジョン' }],

  // 敵の種類。ch は廊下に描く 1 文字、lair はその敵が主に出る階の呼び名。HP・攻撃力の倍率は balance.monster.kinds
  monsters: [
    { id: 'slime', name: 'スライム', ch: 's', color: '#5fd75f', lair: 'スライムの沼' },
    { id: 'bat', name: 'コウモリ', ch: 'b', color: '#af87ff', lair: 'コウモリの巣' },
    { id: 'rat', name: '大ネズミ', ch: 'r', color: '#af875f', lair: '大ネズミの穴蔵' },
    { id: 'goblin', name: 'ゴブリン', ch: 'g', color: '#87af5f', lair: 'ゴブリンの砦' },
    { id: 'wolf', name: 'ウルフ', ch: 'w', color: '#bcbcbc', lair: 'ウルフの狩場' },
    { id: 'skeleton', name: 'スケルトン', ch: 'k', color: '#eeeeee', lair: 'スケルトンの墓所' },
    { id: 'zombie', name: 'ゾンビ', ch: 'z', color: '#5f875f', lair: 'ゾンビの腐海' },
    { id: 'orc', name: 'オーク', ch: 'o', color: '#d75f5f', lair: 'オークの野営地' },
    { id: 'gargoyle', name: 'ガーゴイル', ch: 'X', color: '#8787af', lair: 'ガーゴイルの回廊' },
    { id: 'golem', name: 'ゴーレム', ch: 'G', color: '#a8a8a8', lair: 'ゴーレムの石室' },
  ],

  // ボスの階に出る順。一巡したら名前の前に bossRepeatPrefix を付けて繰り返す。倍率と特性は balance.monster.bosses
  bosses: [
    { id: 'kingslime', name: 'キングスライム', ch: 'S', color: '#00ff87', title: '傷がふさがっていく' },
    { id: 'vampire', name: 'ヴァンパイアロード', ch: 'V', color: '#d70000', title: '血を吸って回復する' },
    { id: 'minotaur', name: 'ミノタウロス', ch: 'M', color: '#d78700', title: '斧を振り回す' },
    { id: 'lich', name: 'リッチ', ch: 'L', color: '#af5fff', title: '生命を吸い取る' },
    { id: 'cerberus', name: 'ケルベロス', ch: 'C', color: '#ff5f00', title: '三つの首で噛みつく' },
    { id: 'kraken', name: 'クラーケン', ch: 'K', color: '#00afaf', title: '触手が再生する' },
    { id: 'behemoth', name: 'ベヒーモス', ch: 'B', color: '#870000', title: '分厚い皮膚で刃を弾く' },
    { id: 'fallen', name: '堕天使', ch: 'A', color: '#ffffff', title: '光の槍を放つ' },
    { id: 'elderdragon', name: '古龍', ch: 'D', color: '#ff0000', title: '鱗が刃を通さない' },
    { id: 'demonking', name: '魔王', ch: 'W', color: '#ff00ff', title: '闇の力で傷を癒やす' },
  ],
  bossRepeatPrefix: '真・',

  // 装備の名前。Tier ごとに 1 つ。足りない Tier は最後の名前に +1, +2 … を付ける
  weapons: ['木の短剣', '銅の剣', '鉄の剣', '鋼の剣', '銀の剣', 'ミスリルの剣', 'オリハルコンの剣', '竜殺しの剣', '聖剣', '神剣'],
  armors: ['布の服', '革の鎧', '鎖かたびら', '鉄の鎧', '銀の鎧', 'ミスリルの鎧', 'オリハルコンの鎧', '竜鱗の鎧', '聖鎧', '神鎧'],
  starterWeapon: '木の棒',

  // 装備の品質 (コモン〜アルティメット)。出やすさは balance.equipment.qualityWeights
  qualities: [
    { name: 'コモン', color: '#bcbcbc' },
    { name: 'アンコモン', color: '#5fd75f' },
    { name: 'レア', color: '#5f87ff' },
    { name: 'エリート', color: '#5fd7ff' },
    { name: 'エピック', color: '#af5fff' },
    { name: 'レジェンダリー', color: '#ff8700' },
    { name: 'ミシック', color: '#ff5f5f' },
    { name: 'アーティファクト', color: '#ffd700' },
    { name: 'ディヴァイン', color: '#ffffff' },
    { name: 'アルティメット', color: '#ff5fd7' },
  ],

  // 強化 (強化ツリー) のノード。文字は盤面の 1 マスで、効果は balance.tree.nodes
  treeNodes: {
    S: { name: '起点', branch: 'start', size: 'start' },
    '1': { name: '閃き', branch: 'atk', size: 'point' },
    '2': { name: '閃き', branch: 'def', size: 'point' },
    '3': { name: '閃き', branch: 'hp', size: 'point' },
    '4': { name: '閃き', branch: 'loot', size: 'point' },
    a: { name: '剛力', branch: 'atk', size: 'small' },
    A: { name: '猛攻', branch: 'atk', size: 'notable' },
    c: { name: '急所', branch: 'atk', size: 'small' },
    C: { name: '必殺', branch: 'atk', size: 'notable' },
    Q: { name: '狂戦士', branch: 'atk', size: 'keystone' },
    d: { name: '堅守', branch: 'def', size: 'small' },
    D: { name: '鉄壁', branch: 'def', size: 'notable' },
    W: { name: '城塞', branch: 'def', size: 'keystone' },
    h: { name: '頑健', branch: 'hp', size: 'small' },
    H: { name: '再生', branch: 'hp', size: 'notable' },
    v: { name: '吸収', branch: 'hp', size: 'small' },
    V: { name: '吸血鬼', branch: 'hp', size: 'keystone' },
    l: { name: '探索', branch: 'loot', size: 'small' },
    L: { name: '目利き', branch: 'loot', size: 'notable' },
    F: { name: '幸運', branch: 'loot', size: 'keystone' },
    b: { name: '狩人', branch: 'loot', size: 'small' },
    B: { name: '竜殺し', branch: 'loot', size: 'notable' },
    P: { name: '強打', branch: 'atk', size: 'notable' },
    R: { name: '連撃', branch: 'atk', size: 'notable' },
    E: { name: '処刑', branch: 'atk', size: 'notable' },
    G: { name: '出血', branch: 'atk', size: 'notable' },
    U: { name: '受け流し', branch: 'def', size: 'notable' },
    I: { name: '鉄の意志', branch: 'def', size: 'notable' },
    K: { name: '反撃', branch: 'def', size: 'notable' },
    T: { name: '棘の鎧', branch: 'def', size: 'notable' },
    N: { name: '不動', branch: 'def', size: 'notable' },
    M: { name: '応急手当', branch: 'hp', size: 'notable' },
    Y: { name: '生命力', branch: 'hp', size: 'notable' },
    Z: { name: '背水', branch: 'hp', size: 'notable' },
    J: { name: '不死身', branch: 'hp', size: 'notable' },
    q: { name: '宝探し', branch: 'loot', size: 'notable' },
    m: { name: '鍛冶の心得', branch: 'loot', size: 'notable' },
    n: { name: '分解の達人', branch: 'loot', size: 'notable' },
    p: { name: '幸運の星', branch: 'loot', size: 'notable' },
  } as Record<string, { name: string; branch: string; size: string }>,
  // 系統ごとに、盤面を作るときに使うノードの文字 (小ノード・主要ノード・キーストーン・SP ノード)
  treeArms: {
    atk: { small: ['a', 'a', 'c'], notable: ['A', 'C', 'P', 'R', 'E', 'G'], keystone: 'Q', point: '1' },
    def: { small: ['d'], notable: ['D', 'U', 'I', 'K', 'T', 'N'], keystone: 'W', point: '2' },
    hp: { small: ['h', 'h', 'v'], notable: ['H', 'M', 'Y', 'Z', 'J'], keystone: 'V', point: '3' },
    loot: { small: ['l', 'l', 'b'], notable: ['L', 'B', 'q', 'm', 'n', 'p'], keystone: 'F', point: '4' },
  } as Record<string, { small: string[]; notable: string[]; keystone: string; point: string }>,

  // スキルツリーの盤面。文字 1 つが 1 スキル、`-` `|` がつながり、S が起点
  skillBoard: `
          e-x
            |
            d-f-g
            |
            p
            |
    w-c-i-r-S-h-u-z-q
        |   |   |
      t-k   n   v-y
            |
          s-m-l
            |
            a
            |
            j
`,
  // スキル。text の {v} は効果量、{v%} はその百分率、{cd} は待ち時間、ほかの {名前} は balance.skills.list の同じ名前の値
  skills: {
    p: { id: 'slash', name: '渾身斬り', branch: 'atk', kind: 'attack', text: '攻撃力の {v} 倍で斬る' },
    d: { id: 'flurry', name: '乱れ斬り', branch: 'atk', kind: 'attack', text: '攻撃力の {v} 倍で {hits} 回斬る' },
    x: { id: 'behead', name: '断頭', branch: 'atk', kind: 'attack', text: 'HP {v%} 以下の敵を倒す。ボスには攻撃力の {boss} 倍' },
    f: { id: 'berserk', name: '鬼神化', branch: 'atk', kind: 'support', text: '{turns} 回の攻撃のあいだ攻撃力 ×{v}' },
    e: { id: 'thunder', name: '雷撃', branch: 'atk', kind: 'attack', text: '敵の最大 HP の {v%} のダメージ (ボスには {bossV%})' },
    g: { id: 'dragonslayer', name: '竜殺し', branch: 'atk', kind: 'attack', text: 'ボスにだけ使う。攻撃力の {v} 倍' },
    r: { id: 'ironwall', name: '鉄壁', branch: 'def', kind: 'support', text: '敵の攻撃を {v} 回防ぐ' },
    i: { id: 'endure', name: '不屈', branch: 'def', kind: 'support', text: 'HP {below%} 未満で使う。{v} 回の攻撃のあいだ HP が 1 より減らない (待ち {cd})' },
    c: { id: 'riposte', name: '迎撃', branch: 'def', kind: 'support', text: '次に受けた攻撃のダメージの {v} 倍を返す' },
    k: { id: 'shieldbash', name: '盾打ち', branch: 'def', kind: 'attack', text: '攻撃し、敵を {v} 回動けなくする' },
    t: { id: 'mirror', name: '反射結界', branch: 'def', kind: 'support', text: '{turns} 回の攻撃のあいだ、受けたダメージの {v%} を返す' },
    w: { id: 'intimidate', name: '威圧', branch: 'def', kind: 'support', text: '{turns} 回の攻撃のあいだ敵の攻撃力 -{v%}' },
    h: { id: 'heal', name: 'ヒール', branch: 'hp', kind: 'support', text: 'HP {below%} 未満で使う。最大 HP の {v%} 回復' },
    u: { id: 'revive', name: '起死回生', branch: 'hp', kind: 'support', text: 'HP {below%} 未満で使う。HP 全回復 (待ち {cd})' },
    z: { id: 'regen', name: 'リジェネ', branch: 'hp', kind: 'support', text: 'HP {below%} 未満で使う。{turns} 回の攻撃のあいだ毎回最大 HP の {v%} 回復' },
    v: { id: 'drain', name: '吸血斬り', branch: 'hp', kind: 'attack', text: '攻撃力の {v} 倍で斬り、与えたダメージの {heal%} を回復' },
    y: { id: 'sanctuary', name: '聖域', branch: 'hp', kind: 'support', text: 'HP {below%} 未満で使う。{turns} 回の攻撃のあいだ無敵、最大 HP の {v%} 回復' },
    q: { id: 'sacrifice', name: '命の炎', branch: 'hp', kind: 'attack', text: 'HP {above%} より多いときに使う。今の HP の {hpCost%} を払い、攻撃力の {v} 倍' },
    n: { id: 'plunder', name: '強奪', branch: 'loot', kind: 'support', text: '次に倒した敵が装備を必ず落とす (待ち {cd})' },
    m: { id: 'soulhunt', name: '魂狩り', branch: 'loot', kind: 'support', text: '次の分解でもらえる memory が {v} 倍' },
    a: { id: 'appraise', name: '鑑定', branch: 'loot', kind: 'support', text: '次に落ちる装備の品質を 2 回抽選して良い方を取る (待ち {cd})' },
    s: { id: 'goldenhand', name: '黄金の手', branch: 'loot', kind: 'support', text: '次に落ちる装備の品質が {v} 段上がる' },
    l: { id: 'scent', name: '宝の匂い', branch: 'loot', kind: 'support', text: '次の {kills} 体のあいだ装備ドロップ率 +{v%}' },
    j: { id: 'windfall', name: '一攫千金', branch: 'loot', kind: 'support', text: '今いる階 × {v} の memory を手に入れる' },
  } as Record<string, { id: string; name: string; branch: string; kind: string; text: string }>,

  // 遺物の名前の組み合わせ
  relicAdjectives: ['古の', '呪われた', '輝く', '欠けた', '竜の', '星降る', '沈黙の', '血塗られた', '忘れられた', '永遠の'],
  relicNouns: ['指輪', '護符', '王冠', '聖杯', '骨片', '宝珠', '仮面', '羅針盤', '砂時計', '鍵', '羽根', '牙'],
}

// 英語版。形 (ID・文字・色・盤面) は日本語版と同じで、名前と説明文だけを差し替える
export const CONTENT_EN: typeof CONTENT = {
  ...CONTENT,
  dungeons: [{ id: 'beginning', name: 'Dungeon of Beginnings' }],
  monsters: [
    { id: 'slime', name: 'Slime', ch: 's', color: '#5fd75f', lair: 'Slime Bog' },
    { id: 'bat', name: 'Bat', ch: 'b', color: '#af87ff', lair: 'Bat Roost' },
    { id: 'rat', name: 'Giant Rat', ch: 'r', color: '#af875f', lair: 'Rat Burrow' },
    { id: 'goblin', name: 'Goblin', ch: 'g', color: '#87af5f', lair: 'Goblin Fort' },
    { id: 'wolf', name: 'Wolf', ch: 'w', color: '#bcbcbc', lair: 'Wolf Hunting Grounds' },
    { id: 'skeleton', name: 'Skeleton', ch: 'k', color: '#eeeeee', lair: 'Skeleton Crypt' },
    { id: 'zombie', name: 'Zombie', ch: 'z', color: '#5f875f', lair: 'Rotting Sea' },
    { id: 'orc', name: 'Orc', ch: 'o', color: '#d75f5f', lair: 'Orc Camp' },
    { id: 'gargoyle', name: 'Gargoyle', ch: 'X', color: '#8787af', lair: 'Gargoyle Gallery' },
    { id: 'golem', name: 'Golem', ch: 'G', color: '#a8a8a8', lair: 'Golem Vault' },
  ],
  bosses: [
    { id: 'kingslime', name: 'King Slime', ch: 'S', color: '#00ff87', title: 'Its wounds are closing' },
    { id: 'vampire', name: 'Vampire Lord', ch: 'V', color: '#d70000', title: 'It heals by drinking blood' },
    { id: 'minotaur', name: 'Minotaur', ch: 'M', color: '#d78700', title: 'It swings a great axe' },
    { id: 'lich', name: 'Lich', ch: 'L', color: '#af5fff', title: 'It drains your life' },
    { id: 'cerberus', name: 'Cerberus', ch: 'C', color: '#ff5f00', title: 'Three heads bite at once' },
    { id: 'kraken', name: 'Kraken', ch: 'K', color: '#00afaf', title: 'Its tentacles grow back' },
    { id: 'behemoth', name: 'Behemoth', ch: 'B', color: '#870000', title: 'Its thick hide turns blades' },
    { id: 'fallen', name: 'Fallen Angel', ch: 'A', color: '#ffffff', title: 'It hurls spears of light' },
    { id: 'elderdragon', name: 'Elder Dragon', ch: 'D', color: '#ff0000', title: 'Its scales stop blades' },
    { id: 'demonking', name: 'Demon King', ch: 'W', color: '#ff00ff', title: 'Dark power heals its wounds' },
  ],
  bossRepeatPrefix: 'True ',
  weapons: ['Wooden Dagger', 'Copper Sword', 'Iron Sword', 'Steel Sword', 'Silver Sword', 'Mithril Sword', 'Orichalcum Sword', 'Dragonslayer', 'Holy Sword', 'Divine Sword'],
  armors: ['Cloth Tunic', 'Leather Armor', 'Chain Mail', 'Iron Armor', 'Silver Armor', 'Mithril Armor', 'Orichalcum Armor', 'Dragonscale Armor', 'Holy Armor', 'Divine Armor'],
  starterWeapon: 'Wooden Stick',
  qualities: [
    { name: 'Common', color: '#bcbcbc' },
    { name: 'Uncommon', color: '#5fd75f' },
    { name: 'Rare', color: '#5f87ff' },
    { name: 'Elite', color: '#5fd7ff' },
    { name: 'Epic', color: '#af5fff' },
    { name: 'Legendary', color: '#ff8700' },
    { name: 'Mythic', color: '#ff5f5f' },
    { name: 'Artifact', color: '#ffd700' },
    { name: 'Divine', color: '#ffffff' },
    { name: 'Ultimate', color: '#ff5fd7' },
  ],
  treeNodes: Object.fromEntries(
    Object.entries(CONTENT.treeNodes).map(([ch, one]) => [
      ch,
      {
        ...one,
        name: ({
          S: 'Origin', '1': 'Insight', '2': 'Insight', '3': 'Insight', '4': 'Insight',
          a: 'Might', A: 'Onslaught', c: 'Weak Spot', C: 'Deadly Blow', Q: 'Berserker',
          d: 'Guard', D: 'Iron Wall', W: 'Fortress',
          h: 'Toughness', H: 'Regeneration', v: 'Absorb', V: 'Vampire',
          l: 'Exploration', L: 'Keen Eye', F: 'Fortune', b: 'Hunter', B: 'Dragonslayer',
          P: 'Power Strike', R: 'Double Strike', E: 'Execute', G: 'Bleed',
          U: 'Parry', I: 'Iron Will', K: 'Counter', T: 'Thorns', N: 'Unshakable',
          M: 'First Aid', Y: 'Vitality', Z: 'Last Stand', J: 'Undying',
          q: 'Treasure Hunt', m: 'Smithing', n: 'Salvager', p: 'Lucky Star',
        } as Record<string, string>)[ch] ?? one.name,
      },
    ]),
  ),
  skills: {
    p: { id: 'slash', name: 'Mighty Slash', branch: 'atk', kind: 'attack', text: 'Slash for {v}x attack' },
    d: { id: 'flurry', name: 'Flurry', branch: 'atk', kind: 'attack', text: 'Slash {hits} times for {v}x attack each' },
    x: { id: 'behead', name: 'Behead', branch: 'atk', kind: 'attack', text: 'Kill an enemy at {v%} HP or less. {boss}x attack against bosses' },
    f: { id: 'berserk', name: 'Berserk', branch: 'atk', kind: 'support', text: 'Attack x{v} for {turns} attacks' },
    e: { id: 'thunder', name: 'Thunder', branch: 'atk', kind: 'attack', text: "Deal {v%} of the enemy's max HP ({bossV%} against bosses)" },
    g: { id: 'dragonslayer', name: 'Dragon Slayer', branch: 'atk', kind: 'attack', text: 'Bosses only. {v}x attack' },
    r: { id: 'ironwall', name: 'Iron Wall', branch: 'def', kind: 'support', text: 'Block {v} enemy attacks' },
    i: { id: 'endure', name: 'Endure', branch: 'def', kind: 'support', text: 'Below {below%} HP: HP cannot drop below 1 for {v} attacks (cooldown {cd})' },
    c: { id: 'riposte', name: 'Riposte', branch: 'def', kind: 'support', text: 'Return {v}x the damage of the next hit taken' },
    k: { id: 'shieldbash', name: 'Shield Bash', branch: 'def', kind: 'attack', text: 'Attack and stun the enemy for {v} turns' },
    t: { id: 'mirror', name: 'Mirror Ward', branch: 'def', kind: 'support', text: 'Return {v%} of damage taken for {turns} attacks' },
    w: { id: 'intimidate', name: 'Intimidate', branch: 'def', kind: 'support', text: 'Enemy attack -{v%} for {turns} attacks' },
    h: { id: 'heal', name: 'Heal', branch: 'hp', kind: 'support', text: 'Below {below%} HP: restore {v%} of max HP' },
    u: { id: 'revive', name: 'Second Wind', branch: 'hp', kind: 'support', text: 'Below {below%} HP: fully restore HP (cooldown {cd})' },
    z: { id: 'regen', name: 'Regen', branch: 'hp', kind: 'support', text: 'Below {below%} HP: restore {v%} of max HP each attack for {turns} attacks' },
    v: { id: 'drain', name: 'Drain Slash', branch: 'hp', kind: 'attack', text: 'Slash for {v}x attack and heal {heal%} of the damage dealt' },
    y: { id: 'sanctuary', name: 'Sanctuary', branch: 'hp', kind: 'support', text: 'Below {below%} HP: invincible for {turns} attacks and restore {v%} of max HP' },
    q: { id: 'sacrifice', name: 'Life Flame', branch: 'hp', kind: 'attack', text: 'Above {above%} HP: pay {hpCost%} of current HP for {v}x attack' },
    n: { id: 'plunder', name: 'Plunder', branch: 'loot', kind: 'support', text: 'The next enemy killed always drops equipment (cooldown {cd})' },
    m: { id: 'soulhunt', name: 'Soul Hunt', branch: 'loot', kind: 'support', text: 'The next salvage gives {v}x memory' },
    a: { id: 'appraise', name: 'Appraise', branch: 'loot', kind: 'support', text: 'Roll the next drop quality twice and keep the better (cooldown {cd})' },
    s: { id: 'goldenhand', name: 'Golden Hand', branch: 'loot', kind: 'support', text: 'The next drop is {v} quality grades higher' },
    l: { id: 'scent', name: 'Treasure Scent', branch: 'loot', kind: 'support', text: 'Equipment drop rate +{v%} for the next {kills} kills' },
    j: { id: 'windfall', name: 'Windfall', branch: 'loot', kind: 'support', text: 'Gain current floor x {v} memory' },
  },
  relicAdjectives: ['Ancient ', 'Cursed ', 'Shining ', 'Broken ', "Dragon's ", 'Starfall ', 'Silent ', 'Bloodstained ', 'Forgotten ', 'Eternal '],
  relicNouns: ['Ring', 'Amulet', 'Crown', 'Grail', 'Bone Shard', 'Orb', 'Mask', 'Compass', 'Hourglass', 'Key', 'Feather', 'Fang'],
}

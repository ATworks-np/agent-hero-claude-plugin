export type ItemKind = 'weapon' | 'armor'

// quality は装備の品質 (0 = コモン 〜 9 = アルティメット)。初期装備の木の棒には無い。
// tier は名前を言語ごとに引き直すための装備の Tier (0 始まり)。初期装備には無く、starter が立つ。
// どちらも無い旧形式の装備は name をそのまま出す
export type Item = { id: string; name: string; kind: ItemKind; power: number; quality?: number; tier?: number; starter?: boolean }

// 遺物の 1 つの付与効果。key は強化ツリーの効果 (tree.ts の Mods) の名前
export type RelicAffix = { key: string; value: number }

// nameParts は名前の形容詞と名詞の番号 (config/content.ts の relicAdjectives / relicNouns)。言語ごとに名前を引き直すのに使う
export type Relic = { id: string; name: string; tier: number; affixes: RelicAffix[]; nameParts?: [number, number] }

export type Save = {
  // 使ったトークン (キャッシュ読み込みを割り引いた値) の累計
  tokens: number
  // 強化に使える memory の残高。トークンを割った端数も持つため小数になる
  memory: number
  // 強化ツリーに使った memory の累計。旧形式のセーブには無いので 0 とみなす
  spent?: number
  // 強化ツリーで取得したノードの ID (盤面上の "x,y")。起点は含めない
  allocated: string[]
  // 強化ツリーの小ノードの Lv (2〜5)。書かれていない取得済みノードは Lv1
  nodeLevels?: Record<string, number>
  hp: number
  floor: number
  maxFloor: number
  kills: number
  deaths: number
  inventory: Item[]
  weapon: string | null
  armor: string | null
  log: string[]
  nextId: number
  // 画面・記録・名前の言語。無ければ日本語
  lang?: 'ja' | 'en'
  // いるダンジョンの ID (config/content.ts の dungeons)。無ければ先頭のダンジョン
  dungeon?: string
  // 周回する階。無ければ自動攻略 (階段を降りるたびに次の階へ進む)
  farmFloor?: number
  // 持っている遺物と、そのうちスロットに付けているものの ID
  relics?: Relic[]
  equippedRelics?: string[]
  // スキルツリーで習得したスキルと、そのうち戦闘で使うようにセットしたもの。旧形式のセーブには無いので空とみなす
  skills?: string[]
  equippedSkills?: string[]
  // スキルの習得と強化に使った SP の累計
  spUsed?: number
  // 習得したスキルの Lv。書かれていないスキルは Lv1
  skillLevels?: Record<string, number>
  // 発動型スキルの残りの待ち時間 (勇者の攻撃の回数) と、スキルでかかっている効果
  cooldowns?: Record<string, number>
  buffs?: Buffs
  // 強化ツリーの「不死身」を最後に使った階
  undyingFloor?: number
}

// スキルでかかる効果。turns の付くものは、勇者の攻撃の回数で数えた残り
export type Buffs = {
  berserk?: { turns: number; mult: number }
  shield?: number
  riposte?: number
  weaken?: { turns: number; pct: number }
  endure?: number
  mirror?: { turns: number; pct: number }
  regen?: { turns: number; pct: number }
  invuln?: number
  plunder?: boolean
  soulhunt?: number
  goldenhand?: number
  scent?: { kills: number; pct: number }
  appraise?: boolean
}

export type Monster = {
  name: string
  // 名前を言語ごとに引き直すための番号。kind は雑魚の種類 (config/content.ts の monsters)、boss はボスの何周目か
  // (bosses を一巡するごとに名前に接頭辞が付く)、tier は雑魚の Tier (0 始まり)
  kind?: number
  boss?: number
  tier?: number
  ch: string
  color: string
  x: number
  hp: number
  maxHp: number
  atk: number
  // 防御力。旧形式のセーブの敵には無いので、階から計算した値を使う (game.ts の monsterDef)
  def?: number
  isBoss: boolean
  trait?: BossTrait
  // スキル「盾打ち」で動けない残り回数
  stun?: number
}

export type BossTrait = 'regen' | 'drain' | 'double' | 'armor'

export type Phase = 'walk' | 'fight' | 'door' | 'stairs' | 'dead'

export type Scene = {
  // 階の中の何部屋目か (1〜ROOMS_PER_FLOOR)。旧形式のセーブには無いので 1 とみなす
  room?: number
  x: number
  phase: Phase
  monster: Monster | null
  wait: number
  frame: number
  hit: 'hero' | 'monster' | null
  // その部屋でまだ戦っていない敵。部屋に入った時点で決まった位置に並べる
  queue?: Monster[]
  isPopulated?: boolean
  // 今の敵に勇者が攻撃した回数 (強化ツリーの「強打」が 3 回に 1 回効く)
  heroHits?: number
  // この回に発動したスキルの名前。帯に一瞬だけ出す
  flash?: string
}

export type Command = { seq: number; equip?: string; allocate?: string; refund?: string; forge?: ItemKind; salvageAll?: true; learnSkill?: string; equipSkill?: string; unequipSkill?: string; upgradeSkill?: string; refundSkill?: string; equipRelic?: string; unequipRelic?: string; discardRelic?: string; farm?: number; auto?: true; lang?: 'ja' | 'en' }

export type Inbox = {
  tokens: number
  cmds: Command[]
  workingAt: number
}

export type World = {
  save: Save
  scene: Scene
  driver: { id: string; at: number } | null
  applied: Record<string, { tokens: number; cmd: number }>
  isWorking: boolean
  events: { seq: number; text: string }[]
  eventSeq: number
}

export type Tab = 'status' | 'tree' | 'skill' | 'relic' | 'equipment' | 'inventory' | 'log' | 'map' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    'agent-hero': {
      save: Save | null
      scene: Scene | null
      tab: Tab
      isWorking: boolean
      treePage: number
      // 新しい版が出ていれば、動いている版と最新の版
      update: { current: string; latest: string } | null
    }
  }
}

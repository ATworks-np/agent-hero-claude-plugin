import type { Save } from '../types'
import { CONTENT, CONTENT_EN } from '../config/content'
import { TEXT } from '../config/text'
import type { TextKey } from '../config/text'

// 言語の切り替え。言語は共有のセーブに持ち、全セッションで同じ言語にする (記録の文は勇者を動かしているセッションが作るため)

export type Lang = 'ja' | 'en'

export const langOf = (save: Pick<Save, 'lang'> | null | undefined): Lang => (save?.lang === 'en' ? 'en' : 'ja')

// 文言を引き、{名前} を埋める
export const t = (lang: Lang, key: TextKey, vars: Record<string, string | number> = {}): string =>
  TEXT[lang][key].replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))

// 名前・説明文
export const contentOf = (lang: Lang): typeof CONTENT => (lang === 'en' ? CONTENT_EN : CONTENT)

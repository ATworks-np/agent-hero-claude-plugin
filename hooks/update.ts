// 新しい版が出ているかどうかの判定。公開しているリポジトリの plugin.json の version と、
// 動いている版の version を比べる。通信と保存は register.tsx が行い、ここは計算だけを持つ

export type UpdateInfo = { current: string; latest: string }

// "1.2.3" を数の並びにする。数でない部分 (-beta など) は無視する
const parts = (version: string): number[] => version.split('-')[0]!.split('.').map(one => Number.parseInt(one, 10) || 0)

export const isNewer = (latest: string, current: string): boolean => {
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

// plugin.json の repository (https://github.com/<owner>/<repo>) から、main の plugin.json を読む URL を作る。
// GitHub 以外のリポジトリは確かめない
export const manifestUrl = (repository: string | undefined): string | null => {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/.]+)/.exec(repository ?? '')
  return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/.claude-plugin/plugin.json` : null
}

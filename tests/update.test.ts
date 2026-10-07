import { expect, test } from 'claude-code/testing'

import { isNewer, manifestUrl } from '../hooks/update'

test('版の比較は数として行う', async () => {
  expect(isNewer('0.2.0', '0.1.0')).toBe(true)
  expect(isNewer('0.10.0', '0.9.0')).toBe(true)
  expect(isNewer('0.1.0', '0.1.0')).toBe(false)
  expect(isNewer('0.1.0', '0.2.0')).toBe(false)
  expect(isNewer('1.0', '0.9.9')).toBe(true)
})

test('GitHub のリポジトリから plugin.json を読む URL を作る', async () => {
  expect(manifestUrl('https://github.com/ATworks-np/agent-hero-claude-plugin')).toBe(
    'https://raw.githubusercontent.com/ATworks-np/agent-hero-claude-plugin/main/.claude-plugin/plugin.json',
  )
  expect(manifestUrl('https://example.com/x')).toBe(null)
  expect(manifestUrl(undefined)).toBe(null)
})

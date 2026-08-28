import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'

// ── Mocked VS Code + SDK surface ───────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const statusBar = {
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
  }
  const moodStatusBar = {
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
  }
  const secrets = {
    store: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    delete: vi.fn(async () => {}),
  }
  const configGet = vi.fn()
  const withProgress = vi.fn(async (_opts: unknown, task: (...a: unknown[]) => unknown) => task())
  const showInputBox = vi.fn(async () => undefined)
  const showQuickPick = vi.fn(async () => undefined)
  const showInformationMessage = vi.fn()
  const showErrorMessage = vi.fn()
  const executeCommand = vi.fn(async () => undefined)
  const activeTextEditor = {
    document: { languageId: 'typescript' },
    insertSnippet: vi.fn(),
  }
  const webview = {
    html: '',
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn(),
  }
  const createWebviewPanel = vi.fn(() => ({
    webview,
    onDidDispose: vi.fn(),
  }))
  const onDidChangeConfiguration = vi.fn()
  class SnippetString {
    value: string
    constructor(value: string) {
      this.value = value
    }
  }
  return {
    statusBar,
    moodStatusBar,
    secrets,
    configGet,
    withProgress,
    showInputBox,
    showQuickPick,
    showInformationMessage,
    showErrorMessage,
    executeCommand,
    activeTextEditor,
    webview,
    createWebviewPanel,
    onDidChangeConfiguration,
    SnippetString,
  }
})

vi.mock('vscode', () => {
  let statusBarCalls = 0
  return {
    window: {
      createStatusBarItem: vi.fn(() => (statusBarCalls++ === 0 ? mocks.statusBar : mocks.moodStatusBar)),
      showInputBox: mocks.showInputBox,
      showQuickPick: mocks.showQuickPick,
      showInformationMessage: mocks.showInformationMessage,
      showErrorMessage: mocks.showErrorMessage,
      createWebviewPanel: mocks.createWebviewPanel,
      activeTextEditor: mocks.activeTextEditor,
      withProgress: mocks.withProgress,
    },
    workspace: {
      getConfiguration: vi.fn(() => ({ get: mocks.configGet })),
      onDidChangeConfiguration: mocks.onDidChangeConfiguration,
    },
    commands: {
      registerCommand: vi.fn(),
      executeCommand: mocks.executeCommand,
    },
    StatusBarAlignment: { Right: 1 },
    ProgressLocation: { Notification: 1 },
    ViewColumn: { Beside: 1 },
    SnippetString: mocks.SnippetString,
  }
})

vi.mock('@echomirror/core', () => ({
  EchoMirrorClient: class {
    constructor(public opts: unknown) {}
  },
}))

vi.mock('@echomirror/mood', () => ({
  logMood: vi.fn(async () => ({ id: 'x' })),
  getMoodStreak: vi.fn(async () => ({ current: 4, longest: 12 })),
  MoodScore: class {},
  MoodTag: class {},
}))

import * as ext from '../extension'

// ── Test helpers ───────────────────────────────────────────────────────────────
function setConfig(cfg: Record<string, unknown>) {
  mocks.configGet.mockImplementation((key: string) => cfg[key])
}

function makeContext(): any {
  return { secrets: mocks.secrets, subscriptions: [] as unknown[] }
}

beforeEach(() => {
  vi.clearAllMocks()
  setConfig({ network: 'testnet', statusBarPublicKey: '', showStatusBar: false })
  mocks.secrets.get.mockResolvedValue(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ balances: [] }),
  }))
})

describe('validateAddressCommand', () => {
  it('reports a valid G-address', async () => {
    mocks.showInputBox.mockResolvedValue('G'.padEnd(56, 'A'))
    await ext.validateAddressCommand()
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Valid'),
    )
  })

  it('reports an invalid address', async () => {
    mocks.showInputBox.mockResolvedValue('not-a-real-address')
    await ext.validateAddressCommand()
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Invalid'),
    )
  })

  it('does nothing when cancelled', async () => {
    mocks.showInputBox.mockResolvedValue(undefined)
    await ext.validateAddressCommand()
    expect(mocks.showInformationMessage).not.toHaveBeenCalled()
  })
})

describe('fundTestnetCommand', () => {
  it('errors when not on testnet', async () => {
    setConfig({ network: 'mainnet' })
    await ext.fundTestnetCommand()
    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('only available on testnet'),
    )
  })

  it('funds a testnet account via Friendbot', async () => {
    setConfig({ network: 'testnet' })
    mocks.showInputBox.mockResolvedValue('G'.padEnd(56, 'A'))
    await ext.fundTestnetCommand()
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Funded'),
    )
  })

  it('reports a Friendbot error status', async () => {
    setConfig({ network: 'testnet' })
    mocks.showInputBox.mockResolvedValue('G'.padEnd(56, 'A'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    await ext.fundTestnetCommand()
    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Friendbot error'),
    )
  })
})

describe('checkBalanceCommand', () => {
  it('prompts for a key when none is configured, then shows balance', async () => {
    setConfig({ statusBarPublicKey: '' })
    mocks.showInputBox.mockResolvedValue('G'.padEnd(56, 'A'))
    await ext.checkBalanceCommand()
    expect(mocks.showInputBox).toHaveBeenCalled()
    expect(mocks.statusBar.text).toContain('ECHO')
  })

  it('uses the configured key directly', async () => {
    setConfig({ statusBarPublicKey: 'G'.padEnd(56, 'B'), network: 'testnet' })
    await ext.checkBalanceCommand()
    expect(mocks.showInputBox).not.toHaveBeenCalled()
    expect(mocks.statusBar.text).toContain('ECHO')
  })
})

describe('insertMoodLogSnippetCommand', () => {
  it('inserts a TS snippet for non-Dart editors', async () => {
    mocks.activeTextEditor.document.languageId = 'typescript'
    await ext.insertMoodLogSnippetCommand()
    expect(mocks.activeTextEditor.insertSnippet).toHaveBeenCalledWith(
      expect.any(mocks.SnippetString),
    )
    const snippet = (mocks.activeTextEditor.insertSnippet.mock.calls[0][0] as any).value
    expect(snippet).toContain('logMood(client')
  })

  it('inserts a Dart snippet for Dart editors', async () => {
    mocks.activeTextEditor.document.languageId = 'dart'
    await ext.insertMoodLogSnippetCommand()
    const snippet = (mocks.activeTextEditor.insertSnippet.mock.calls[0][0] as any).value
    expect(snippet).toContain('EchoMirror.instance.mood.log')
  })

  it('does nothing without an active editor', async () => {
    const original = mocks.activeTextEditor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vscode.window as any).activeTextEditor = undefined
    await ext.insertMoodLogSnippetCommand()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vscode.window as any).activeTextEditor = original
    expect(mocks.activeTextEditor.insertSnippet).not.toHaveBeenCalled()
  })
})

describe('signIn / signOut', () => {
  it('signIn stores the api key in secrets', async () => {
    const ctx = makeContext()
    mocks.showInputBox.mockResolvedValue('em_live_secret123')
    await ext.signInCommand(ctx)
    expect(mocks.secrets.store).toHaveBeenCalledWith('echomirror.apiKey', 'em_live_secret123')
  })

  it('signOut deletes the api key and resets the mood status bar', async () => {
    const ctx = makeContext()
    ext.activate(ctx)
    ext.moodStatusBarItem!.text = '🟢 Mood: 9/10'
    await ext.signOutCommand(ctx)
    expect(mocks.secrets.delete).toHaveBeenCalledWith('echomirror.apiKey')
    expect(ext.moodStatusBarItem!.text).toBe('$(pulse) Log Mood')
  })
})

describe('getClient', () => {
  it('returns undefined and prompts sign-in when no api key is stored', async () => {
    const ctx = makeContext()
    mocks.secrets.get.mockResolvedValue(undefined)
    const client = await ext.getClient(ctx)
    expect(client).toBeUndefined()
    expect(mocks.executeCommand).toHaveBeenCalledWith('echomirror.signIn')
  })

  it('constructs a client when an api key is stored', async () => {
    const ctx = makeContext()
    mocks.secrets.get.mockResolvedValue('em_live_abc')
    setConfig({ network: 'mainnet' })
    const client = await ext.getClient(ctx)
    expect(client).toBeDefined()
  })
})

describe('logMoodCommand', () => {
  it('logs the mood and updates the status bar on success', async () => {
    const ctx = makeContext()
    mocks.secrets.get.mockResolvedValue('em_live_abc')
    mocks.showQuickPick
      .mockResolvedValueOnce('9') // score
      .mockResolvedValueOnce([{ label: 'work' }]) // tags
    mocks.showInputBox.mockResolvedValue('feeling great')
    await ext.logMoodCommand(ctx)
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Mood logged successfully'),
    )
    expect(ext.moodStatusBarItem!.text).toBe('🟢 Mood: 9/10')
  })

  it('aborts when score is cancelled', async () => {
    const ctx = makeContext()
    mocks.secrets.get.mockResolvedValue('em_live_abc')
    mocks.showQuickPick.mockResolvedValue(undefined)
    await ext.logMoodCommand(ctx)
    expect(mocks.showInformationMessage).not.toHaveBeenCalled()
  })
})

describe('viewStreakCommand', () => {
  it('shows the current streak', async () => {
    const ctx = makeContext()
    mocks.secrets.get.mockResolvedValue('em_live_abc')
    await ext.viewStreakCommand(ctx)
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Current Streak: 4 days'),
    )
  })
})

describe('openSyncExplorerCommand', () => {
  it('creates a webview panel and rejects invalid addresses', () => {
    setConfig({ network: 'testnet', statusBarPublicKey: '' })
    ext.openSyncExplorerCommand()
    expect(mocks.createWebviewPanel).toHaveBeenCalled()
    const handler = mocks.webview.onDidReceiveMessage.mock.calls[0][0]
    handler({ type: 'start-watch', publicKey: 'bad' })
    expect(mocks.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sync-status', watching: false }),
    )
  })

  it('polls Horizon for a valid address and posts events', async () => {
    setConfig({ network: 'testnet', statusBarPublicKey: '' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          records: [
            {
              hash: 'abc',
              ledger: 10,
              paging_token: 'tok1',
              created_at: '2026-01-01T00:00:00Z',
              memo: 'hi',
            },
          ],
        },
      }),
    }))
    ext.openSyncExplorerCommand()
    const handler = mocks.webview.onDidReceiveMessage.mock.calls[0][0]
    handler({ type: 'start-watch', publicKey: 'G'.padEnd(56, 'A') })
    // allow the async poll to resolve
    await new Promise((r) => setTimeout(r, 10))
    handler({ type: 'stop-watch' })
    expect(mocks.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sync-event', kind: 'tx' }),
    )
  })
})

describe('activate status bar visibility', () => {
  it('hides the balance bar when unconfigured', () => {
    setConfig({ showStatusBar: false, statusBarPublicKey: '' })
    ext.activate(makeContext())
    expect(ext.statusBarItem!.show).not.toHaveBeenCalled()
  })

  it('shows the balance bar when configured', () => {
    setConfig({ showStatusBar: true, statusBarPublicKey: 'G'.padEnd(56, 'A') })
    ext.activate(makeContext())
    expect(ext.statusBarItem!.show).toHaveBeenCalled()
  })
})

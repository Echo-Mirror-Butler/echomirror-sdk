import type { Meta, StoryObj } from '@storybook/react'
import type { EchoMirrorClient, MoodEntry } from '@echomirror/core'
import { MoodWidget } from './MoodWidget'

/**
 * Demo client: `logMood` resolves with a server-shaped entry after a short
 * delay so the widget's optimistic → confirmed transition is visible.
 */
const demoClient = {
  request: <T,>(_method: string, _path: string, _body?: unknown): Promise<T> =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            id: 'demo-1',
            userId: 'demo',
            score: 7,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: [],
          } as unknown as T),
        400,
      ),
    ),
  emit: () => {},
  on: () => () => {},
  off: () => {},
  setAuthToken: () => {},
  config: { apiKey: 'demo', network: 'testnet' as const },
} satisfies EchoMirrorClient

const meta: Meta<typeof MoodWidget> = {
  title: 'Widget/MoodWidget',
  component: MoodWidget,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { client: demoClient as EchoMirrorClient },
}
export default meta

type Story = StoryObj<typeof MoodWidget>

export const Light: Story = {}

export const Dark: Story = {
  args: { appearance: 'dark' },
  parameters: { backgrounds: { default: 'dark' } },
}

export const WithoutTags: Story = {
  args: { hideTags: true },
}

export const Preselected: Story = {
  args: { initialScore: 8, initialNote: 'Feeling focused after a good walk.' },
}

export const RequiresScore: Story = {
  args: { requireScore: true },
}

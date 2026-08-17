/**
 * Action popup — a two-click mood check-in submitted through the JS SDK
 * (@echomirror/core + @echomirror/mood), bundled into the extension package.
 */
import type { MoodScore, MoodTag } from '@echomirror/core'
import { describeError, fetchStreak, submitMood } from './lib/api'
import { scoreFace, streakLabel } from './lib/format'
import { localDateKey } from './lib/reminder'
import { SUGGESTED_TAGS } from './lib/settings'
import { settingsStore, stateStore } from './lib/storage'

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

const selectedTags = new Set<MoodTag>()

function renderTags(container: HTMLElement): void {
  for (const tag of SUGGESTED_TAGS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag'
    button.textContent = tag
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => {
      const active = selectedTags.has(tag)
      if (active) selectedTags.delete(tag)
      else selectedTags.add(tag)
      button.setAttribute('aria-pressed', String(!active))
    })
    container.appendChild(button)
  }
}

function setStatus(node: HTMLElement, message: string, kind: 'error' | 'success' | ''): void {
  node.textContent = message
  node.className = kind ? `status ${kind}` : 'status'
}

async function main(): Promise<void> {
  const setup = el('setup')
  const form = el<HTMLFormElement>('checkin')
  const score = el<HTMLInputElement>('score')
  const scoreValue = el('score-value')
  const scoreEmoji = el('score-emoji')
  const note = el<HTMLTextAreaElement>('note')
  const submit = el<HTMLButtonElement>('submit')
  const status = el('status')
  const streak = el('streak')

  const openOptions = () => chrome.runtime.openOptionsPage()
  el('open-options').addEventListener('click', openOptions)
  el('setup-open-options').addEventListener('click', openOptions)

  const settings = await settingsStore.read()
  if (!settings.apiKey) {
    setup.classList.remove('hidden')
    return
  }
  form.classList.remove('hidden')

  const state = await stateStore.read()
  streak.textContent = streakLabel(state.currentStreak)

  // Refresh the streak in the background — the cached value is shown first so
  // the popup never waits on the network to become usable.
  void fetchStreak(settings)
    .then(async (current) => {
      streak.textContent = streakLabel(current.current)
      await stateStore.write({
        currentStreak: current.current,
        ...(current.isActiveToday ? { lastLoggedDate: localDateKey(new Date()) } : {}),
      })
    })
    .catch(() => {
      // Offline: the cached streak stays on screen and logging still works.
    })

  renderTags(el('tags'))

  const syncScore = () => {
    const value = Number(score.value)
    scoreValue.textContent = `${value} / 10`
    scoreEmoji.textContent = scoreFace(value)
  }
  score.addEventListener('input', syncScore)
  syncScore()

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    submit.disabled = true
    submit.textContent = 'Logging…'
    setStatus(status, '', '')

    try {
      const trimmedNote = note.value.trim()
      await submitMood(settings, {
        score: Number(score.value) as MoodScore,
        note: trimmedNote || undefined,
        tags: selectedTags.size ? [...selectedTags] : undefined,
      })

      const today = localDateKey(new Date())
      await stateStore.write({ lastLoggedDate: today, lastScore: Number(score.value) })
      setStatus(status, 'Logged. See you tomorrow.', 'success')

      // Best effort: refresh the streak so the badge and next popup are current.
      try {
        const updated = await fetchStreak(settings)
        await stateStore.write({ currentStreak: updated.current })
        streak.textContent = streakLabel(updated.current)
      } catch {
        // The entry is already saved; a stale streak is not worth an error.
      }

      setTimeout(() => window.close(), 1200)
    } catch (error) {
      setStatus(status, describeError(error), 'error')
      submit.disabled = false
      submit.textContent = 'Log mood'
    }
  })
}

void main()

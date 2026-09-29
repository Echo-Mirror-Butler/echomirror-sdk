import { EchoMirrorClient } from '@echomirror/core'
import { logMood } from '@echomirror/mood'
import type { MoodScore } from '@echomirror/mood'

const scoreInput = document.querySelector<HTMLInputElement>('#score')!
const scoreValue = document.querySelector<HTMLSpanElement>('#score-value')!
const noteInput = document.querySelector<HTMLTextAreaElement>('#note')!
const logButton = document.querySelector<HTMLButtonElement>('#log-btn')!
const result = document.querySelector<HTMLDivElement>('#result')!

const apiKey = import.meta.env.VITE_ECHOMIRROR_API_KEY
const client = apiKey
  ? new EchoMirrorClient({
      apiKey,
      baseUrl: import.meta.env.VITE_ECHOMIRROR_BASE_URL || undefined,
      network: 'testnet',
    })
  : null

scoreInput.addEventListener('input', () => {
  scoreValue.textContent = scoreInput.value
})

logButton.addEventListener('click', async () => {
  logButton.disabled = true
  logButton.textContent = 'Logging...'
  result.style.display = 'block'
  result.classList.remove('error')

  try {
    if (!client) throw new Error('Set VITE_ECHOMIRROR_API_KEY in .env.local first.')

    const entry = await logMood(client, {
      score: Number(scoreInput.value) as MoodScore,
      note: noteInput.value || undefined,
    })
    result.textContent = `Mood logged: ${entry.score}/10`
    noteInput.value = ''
  } catch (error) {
    result.classList.add('error')
    result.textContent = error instanceof Error ? error.message : String(error)
  } finally {
    logButton.disabled = false
    logButton.textContent = 'Log Mood'
  }
})
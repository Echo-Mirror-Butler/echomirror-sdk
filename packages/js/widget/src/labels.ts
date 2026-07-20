export interface MoodWidgetLabels {
  title: string
  pickerLabel: string
  noteLabel: string
  notePlaceholder: string
  tagsLabel: string
  submit: string
  submitting: string
  successTitle: string
  successBody: string
  syncing: string
  errorTitle: string
  retry: string
  logAnother: string
  requiredHint: string
}

export const defaultLabels: MoodWidgetLabels = {
  title: 'How are you feeling?',
  pickerLabel: 'Choose your mood',
  noteLabel: 'Add a note (optional)',
  notePlaceholder: 'What’s on your mind?',
  tagsLabel: 'Tags',
  submit: 'Log mood',
  submitting: 'Saving your mood…',
  successTitle: 'Mood logged',
  successBody: 'Thanks for checking in. Your streak is safe.',
  syncing: 'Saved — syncing with the server…',
  errorTitle: 'Couldn’t save your mood',
  retry: 'Try again',
  logAnother: 'Log another mood',
  requiredHint: 'Pick a mood to continue.',
}

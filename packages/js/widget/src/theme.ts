export type ThemeAppearance = 'light' | 'dark'

/**
 * A complete theme definition. Every value is exposed as a CSS custom property
 * (`--emw-*`) on the widget root, so consumers can override any token from their
 * own CSS without ejecting or forking the component styles.
 */
export interface Theme {
  appearance: ThemeAppearance
  colorPrimary: string
  colorPrimaryContrast: string
  colorBg: string
  colorSurface: string
  colorText: string
  colorTextMuted: string
  colorBorder: string
  colorSuccess: string
  colorSuccessBg: string
  colorError: string
  colorErrorBg: string
  /** Focus ring color. */
  colorRing: string
  /** Base border radius, e.g. "12px". */
  radius: string
  /** Base spacing unit, e.g. "8px". */
  spacing: string
  fontFamily: string
  fontSize: string
  fontWeightMedium: number
  fontWeightBold: number
}

export const lightTheme: Theme = {
  appearance: 'light',
  colorPrimary: '#6366f1',
  colorPrimaryContrast: '#ffffff',
  colorBg: '#ffffff',
  colorSurface: '#f8fafc',
  colorText: '#0c1a2e',
  colorTextMuted: '#64748b',
  colorBorder: '#e2e8f0',
  colorSuccess: '#16a34a',
  colorSuccessBg: '#f0fdf4',
  colorError: '#dc2626',
  colorErrorBg: '#fef2f2',
  colorRing: '#6366f1',
  radius: '12px',
  spacing: '8px',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: '15px',
  fontWeightMedium: 500,
  fontWeightBold: 700,
}

export const darkTheme: Theme = {
  ...lightTheme,
  appearance: 'dark',
  colorPrimary: '#818cf8',
  colorPrimaryContrast: '#0c1a2e',
  colorBg: '#0c1a2e',
  colorSurface: '#16233a',
  colorText: '#e2e8f0',
  colorTextMuted: '#94a3b8',
  colorBorder: '#27364f',
  colorSuccess: '#4ade80',
  colorSuccessBg: '#0f2918',
  colorError: '#f87171',
  colorErrorBg: '#2a1414',
  colorRing: '#818cf8',
}

export const defaultThemes: Record<ThemeAppearance, Theme> = {
  light: lightTheme,
  dark: darkTheme,
}

/** Merge a partial theme over a base appearance theme. */
export function createTheme(
  appearance: ThemeAppearance = 'light',
  overrides?: Partial<Theme>,
): Theme {
  return { ...defaultThemes[appearance], ...overrides, appearance }
}

const VAR_MAP: Record<keyof Theme, string> = {
  appearance: '--emw-appearance',
  colorPrimary: '--emw-color-primary',
  colorPrimaryContrast: '--emw-color-primary-contrast',
  colorBg: '--emw-color-bg',
  colorSurface: '--emw-color-surface',
  colorText: '--emw-color-text',
  colorTextMuted: '--emw-color-text-muted',
  colorBorder: '--emw-color-border',
  colorSuccess: '--emw-color-success',
  colorSuccessBg: '--emw-color-success-bg',
  colorError: '--emw-color-error',
  colorErrorBg: '--emw-color-error-bg',
  colorRing: '--emw-color-ring',
  radius: '--emw-radius',
  spacing: '--emw-spacing',
  fontFamily: '--emw-font-family',
  fontSize: '--emw-font-size',
  fontWeightMedium: '--emw-font-weight-medium',
  fontWeightBold: '--emw-font-weight-bold',
}

/** Convert a resolved theme into a flat map of CSS custom properties. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}
  ;(Object.keys(VAR_MAP) as (keyof Theme)[]).forEach((key) => {
    vars[VAR_MAP[key]] = String(theme[key])
  })
  return vars
}

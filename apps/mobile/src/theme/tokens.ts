/**
 * MUSO design tokens — "Contemporary Music Editorial".
 * Every color, size and font in the app comes from here. Never hardcode hex values in screens.
 */

export const palette = {
  ink: '#171715',
  ivory: '#F4F0E8',
  lime: '#D9FF55',
  coral: '#F16B55',
  violet: '#9A62F7',
  // Derived neutrals (tuned for AA contrast on ink/ivory)
  ink80: '#2A2A27',
  ink60: '#3D3D39',
  stone: '#8A867D',
  stoneDark: '#5E5B54',
  sand: '#E6E0D4',
  white: '#FFFFFF',
} as const;

export interface ColorScheme {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  inverseBackground: string;
  inverseText: string;
}

export const colors: Record<'light' | 'dark', ColorScheme> = {
  light: {
    background: palette.ivory,
    surface: palette.white,
    surfaceMuted: palette.sand,
    text: palette.ink,
    textMuted: palette.stoneDark,
    border: '#D8D1C2',
    accent: palette.lime,
    onAccent: palette.ink,
    danger: '#C9442F', // darker coral for text contrast on ivory
    onDanger: palette.white,
    inverseBackground: palette.ink,
    inverseText: palette.ivory,
  },
  dark: {
    background: palette.ink,
    surface: palette.ink80,
    surfaceMuted: palette.ink60,
    text: palette.ivory,
    textMuted: palette.stone,
    border: '#34342F',
    accent: palette.lime,
    onAccent: palette.ink,
    danger: palette.coral,
    onDanger: palette.ink,
    inverseBackground: palette.ivory,
    inverseText: palette.ink,
  },
};

/** 4pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  /** Condensed poster face — welcome/marketing moments only. */
  poster: 'Anton_400Regular',
} as const;

/** Type scale. Display styles use the editorial serif; UI styles use Inter. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 52, lineHeight: 54, letterSpacing: -1 },
  display: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.5 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  heading: { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;

export type TypeVariant = keyof typeof type;

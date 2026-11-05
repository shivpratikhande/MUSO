import { useColorScheme } from 'react-native';
import { colors, fonts, palette, radius, space, type, type ColorScheme } from './tokens';

export * from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  c: ColorScheme;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  fonts: typeof fonts;
  palette: typeof palette;
}

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: colors[scheme], space, radius, type, fonts, palette };
}

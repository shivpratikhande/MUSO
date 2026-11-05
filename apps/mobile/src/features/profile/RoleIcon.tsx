import { SELF_ASSIGNABLE_ROLES } from '@muso/shared';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

type SelfRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

/** Chunky line icons for the role cards (drawn, so they match on iOS and Android). */
export function RoleIcon({ role, size = 40 }: { role: SelfRole; size?: number }) {
  const t = useTheme();
  const stroke = {
    stroke: t.palette.ink,
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {role === 'ARTIST' ? (
        <>
          <Path d="M21.5 18.5 L7 33" {...stroke} strokeWidth={4.5} />
          <Circle cx={26.5} cy={13.5} r={8} {...stroke} />
          <Path d="M22 9 L31 18 M24.5 7 L33 15.5" {...stroke} strokeWidth={2} />
        </>
      ) : role === 'SUPPORTER' ? (
        <>
          <Circle cx={20} cy={11} r={5} {...stroke} />
          <Circle cx={8.5} cy={14} r={4} {...stroke} />
          <Circle cx={31.5} cy={14} r={4} {...stroke} />
          <Path d="M11 32 C11 21 29 21 29 32 Z" {...stroke} />
          <Path d="M2 30 C2 23 6 20.5 11.5 21.5 M38 30 C38 23 34 20.5 28.5 21.5" {...stroke} />
        </>
      ) : role === 'CREATOR' ? (
        <>
          <Path d="M12 12 L15.5 7 H24.5 L28 12" {...stroke} />
          <Rect x={4} y={12} width={32} height={21} rx={3.5} {...stroke} />
          <Circle cx={20} cy={22.5} r={6} {...stroke} />
        </>
      ) : (
        <>
          <Path d="M14.5 12 V8.5 H25.5 V12" {...stroke} />
          <Rect x={4} y={12} width={32} height={21} rx={3.5} {...stroke} />
          <Path d="M4 21 H36" {...stroke} />
        </>
      )}
    </Svg>
  );
}

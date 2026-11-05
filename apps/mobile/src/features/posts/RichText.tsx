import { router } from 'expo-router';
import { Fragment } from 'react';
import { AppText, type AppTextProps } from '@/components/ui';
import { useTheme } from '@/theme';

const HASHTAG = /^#([A-Za-z0-9_À-ɏऀ-ॿ]{1,30})([^A-Za-z0-9_]*)$/;
const MENTION = /^@([a-z0-9_.]{3,30})([^a-z0-9_.]*)$/i;

/**
 * Caption/comment text where #hashtags and @mentions are tappable.
 * Tokenises on whitespace (no lookbehind / Unicode property escapes, for Hermes compatibility).
 */
export function RichText({ text, ...rest }: { text: string } & AppTextProps) {
  const t = useTheme();
  const strong = { fontFamily: t.fonts.bodySemiBold };
  const tokens = text.split(/(\s+)/);

  return (
    <AppText {...rest}>
      {tokens.map((tok, i) => {
        const tag = HASHTAG.exec(tok);
        if (tag) {
          const value = tag[1]!.toLowerCase();
          return (
            <Fragment key={i}>
              <AppText
                variant={rest.variant}
                style={strong}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/hashtags/[tag]', params: { tag: value } })}
              >
                #{tag[1]}
              </AppText>
              {tag[2]}
            </Fragment>
          );
        }
        const mention = MENTION.exec(tok);
        if (mention) {
          const handle = mention[1]!.toLowerCase().replace(/\.+$/, '');
          return (
            <Fragment key={i}>
              <AppText
                variant={rest.variant}
                style={strong}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/users/[id]', params: { id: handle } })}
              >
                @{mention[1]}
              </AppText>
              {mention[2]}
            </Fragment>
          );
        }
        return <Fragment key={i}>{tok}</Fragment>;
      })}
    </AppText>
  );
}

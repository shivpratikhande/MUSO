import type { ArcLink } from '@muso/shared';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Platform, Share } from 'react-native';

type Target = 'metamask' | 'coinbase' | 'browser' | 'share';

const open = async (target: Target, url: string, returnUrl: string) => {
  if (target === 'metamask')
    return Linking.openURL(`https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`);
  if (target === 'coinbase')
    return Linking.openURL(`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`);
  if (target === 'share') return Share.share({ message: url });
  return WebBrowser.openAuthSessionAsync(url, returnUrl);
};

function choose(): Promise<Target | null> {
  const targets: Target[] = ['metamask', 'coinbase', 'browser', 'share'];
  const labels = ['MetaMask', 'Coinbase Wallet', 'Browser', 'Share link (open on a computer)'];
  const title = 'Where is your wallet?';
  const message = 'MUSO opens a secure page there. Your keys never leave your wallet.';
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, message, options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
        (i) => resolve(targets[i] ?? null),
      );
      return;
    }
    // Android dialogs show at most three buttons.
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Share link', onPress: () => resolve('share') },
      { text: 'Browser', onPress: () => resolve('browser') },
    ]);
  });
}

/**
 * Opens MUSO's wallet page (signed, short-lived link) where the user's wallet lives: a wallet
 * app's built-in browser, the system browser, or another device. Returns false if cancelled.
 */
export async function openWalletPage(
  getLink: (returnUrl: string) => Promise<ArcLink>,
): Promise<boolean> {
  const target = await choose();
  if (!target) return false;
  const returnUrl = Linking.createURL('wallet/return');
  const { url, code } = await getLink(returnUrl);
  if (target !== 'browser') {
    // Wallet apps sometimes open only MUSO's home page; the page then asks for this code.
    await new Promise<void>((resolve) =>
      Alert.alert(
        `Your code: ${code}`,
        'We’ll copy it for you. If the page asks for a code, tap Paste (or long-press the box and paste). It works for 30 minutes.',
        [
          {
            text: 'Copy code & open',
            onPress: () => {
              void Clipboard.setStringAsync(code).finally(resolve);
            },
          },
        ],
      ),
    );
  }
  await open(target, url, returnUrl);
  return true;
}

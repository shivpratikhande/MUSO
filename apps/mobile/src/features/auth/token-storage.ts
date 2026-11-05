import * as SecureStore from 'expo-secure-store';

/**
 * Only the refresh token is persisted, in the iOS Keychain / Android Keystore.
 * The access token lives in memory and is never written to disk.
 */
const KEY = 'muso.refreshToken';

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

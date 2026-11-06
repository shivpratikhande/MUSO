import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { WalletStep } from '@/features/arc/WalletStep';

export default function OnboardingWallet() {
  return (
    <OnboardingStepScreen
      step="wallet"
      title="Get paid in USDC"
      body="Some reward pools are funded on Arc and pay creators in USDC, straight to your wallet. MUSO pays the network fees. You can do this later in Earnings."
    >
      {(p) => <WalletStep {...p} />}
    </OnboardingStepScreen>
  );
}

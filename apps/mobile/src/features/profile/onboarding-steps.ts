import type { UserRole } from '@muso/shared';

export type OnboardingStep = 'roles' | 'basics' | 'artist' | 'creator' | 'organizer';

const ROUTE: Record<
  OnboardingStep,
  | '/onboarding'
  | '/onboarding/basics'
  | '/onboarding/artist'
  | '/onboarding/creator'
  | '/onboarding/organizer'
> = {
  roles: '/onboarding',
  basics: '/onboarding/basics',
  artist: '/onboarding/artist',
  creator: '/onboarding/creator',
  organizer: '/onboarding/organizer',
};

/** Ordered steps for the chosen roles. Role-specific steps only appear when relevant. */
export function stepsFor(roles: readonly UserRole[]): OnboardingStep[] {
  const steps: OnboardingStep[] = ['roles', 'basics'];
  if (roles.includes('ARTIST')) steps.push('artist');
  if (roles.includes('CREATOR')) steps.push('creator');
  if (roles.includes('ORGANIZER')) steps.push('organizer');
  return steps;
}

/** Route of the step after `current`, or null when onboarding is complete. */
export function nextStepRoute(current: OnboardingStep, roles: readonly UserRole[]) {
  const steps = stepsFor(roles);
  const next = steps[steps.indexOf(current) + 1];
  return next ? ROUTE[next] : null;
}

export function stepProgress(
  current: OnboardingStep,
  roles: readonly UserRole[],
): { index: number; total: number } {
  const steps = stepsFor(roles);
  return { index: steps.indexOf(current) + 1, total: steps.length };
}

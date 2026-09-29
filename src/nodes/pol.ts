// The polarization menu of Compute TMM / Compute RCWA: TM, TE, circular (helicity ±1: ψ = 45°, δ = ±90°) or a Jones state.
import type { Polarization } from '../physics/tmm.ts';

type Mix = { psi: number; delta: number } | undefined;
const isCirc = (m: Mix, sign: number) => !!m && m.psi === 45 && m.delta === 90 * sign;

export const polChoice = (mix: Mix, pol: Polarization): string => (!mix ? pol : isCirc(mix, 1) ? 'cp' : isCirc(mix, -1) ? 'cm' : 'jones');

export function polPatch(choice: string, mix: Mix): { polarization?: Polarization; polMix: Mix } {
  if (choice === 'cp') return { polMix: { psi: 45, delta: 90 } };
  if (choice === 'cm') return { polMix: { psi: 45, delta: -90 } };
  if (choice === 'jones') return { polMix: mix && !isCirc(mix, 1) && !isCirc(mix, -1) ? mix : { psi: 45, delta: 0 } };
  return { polarization: choice as Polarization, polMix: undefined };
}

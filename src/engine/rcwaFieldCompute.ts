// The RCWA field map of a job (the worker and the scripts): planar (φ = 0) or conical incidence.
import { rcwaSolve } from '../physics/rcwa.ts';
import { fieldMap, type FieldMap } from '../physics/rcwaField.ts';
import { conicalSolve } from '../physics/rcwaConical.ts';
import { conicalFieldMap } from '../physics/rcwaFieldConical.ts';
import type { FieldJob } from './rcwaFieldRun.ts';
import { rcwaLayersAt } from './runRcwa.ts';

export function fieldMapOfJob(j: FieldJob, grid?: { nx: number; nz: number }): { map: FieldMap; period: number } {
  const st = rcwaLayersAt(j.spec, j.idx, j.lam);
  const N = st.hasGrating ? j.spec.rcwa!.orders : 0;
  const fact = j.spec.rcwa!.fact ?? 'li';
  const opts = { quantity: j.quantity, part: j.part, periods: j.periods, nx: grid?.nx ?? j.nx, nz: grid?.nz ?? j.nz, zIn: j.zIn, zOut: j.zOut };
  const phi = j.phi ?? 0;
  const map =
    phi !== 0 || j.jones
      ? conicalFieldMap(conicalSolve(st.layers, st.period, j.lam, j.theta, phi, j.jones ?? j.pol, N, fact), st.layers, st.period, j.pol, opts)
      : fieldMap(rcwaSolve(st.layers, st.period, j.lam, j.theta, j.pol, N, fact), st.layers, st.period, j.pol, opts);
  return { map, period: st.period };
}

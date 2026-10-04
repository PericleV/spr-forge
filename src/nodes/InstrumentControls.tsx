// The instrument controls (Tolerance, Sensorgram): angular spread of the beam, source bandwidth, detector noise
// (engine/instrument.ts).
import { INSTRUMENT_DEFAULTS } from '../engine/instrument.ts';
import type { InstrumentFields } from '../types.ts';
import { NumInput } from './ui.tsx';

export function InstrumentControls({ data, set }: { data: InstrumentFields; set: (patch: Partial<InstrumentFields>) => void }) {
  return (
    <>
      <label className="radio" title="The beam is not collimated: the curves are averaged over the angles of the beam (a convolution along θ, in the plane of incidence). Needs a computed range of θ, finer than the spread.">
        <input className="nodrag" type="checkbox" checked={!!data.spreadOn} onChange={(e) => set({ spreadOn: e.target.checked })} />
        beam angular spread
        {data.spreadOn && (
          <>
            <select className="nodrag" value={data.spreadShape ?? 'gauss'} onChange={(e) => set({ spreadShape: e.target.value as InstrumentFields['spreadShape'] })}>
              <option value="gauss">Gaussian, σ (°)</option>
              <option value="uniform">uniform, ± (°)</option>
              <option value="na">NA (uniform, ± asin NA)</option>
            </select>
            <NumInput className="tiny" value={data.spread ?? INSTRUMENT_DEFAULTS.spread} step={0.01} onChange={(spread) => set({ spread })} />
          </>
        )}
      </label>
      <label className="radio" title="The source is not monochromatic: the curves are averaged over its spectrum (a Gaussian convolution along λ). Needs a computed range of λ, finer than the bandwidth.">
        <input className="nodrag" type="checkbox" checked={!!data.bandOn} onChange={(e) => set({ bandOn: e.target.checked })} />
        source bandwidth
        {data.bandOn && (
          <>
            {' '}FWHM <NumInput className="tiny" value={data.band ?? INSTRUMENT_DEFAULTS.band} step={0.1} onChange={(band) => set({ band })} /> nm
          </>
        )}
      </label>
      <label className="radio" title="Detector noise on R and T (A = 1 − R − T), its own for every sample; the model of Piliarik & Homola, Opt. Express 17, 16505 (2009)">
        <input className="nodrag" type="checkbox" checked={!!data.noise} onChange={(e) => set({ noise: e.target.checked })} />
        detector noise
      </label>
      {data.noise && (
        <div className="row wrap indent">
          <label className="radio" title="Additive noise: thermal, read-out and dark noise of the detector, σ in units of R (full scale = 1)">
            thermal / read σ <NumInput className="short" value={data.noiseAdd ?? INSTRUMENT_DEFAULTS.add} step={0.0005} onChange={(noiseAdd) => set({ noiseAdd })} />
          </label>
          <label className="radio" title="Shot noise of the light: photoelectrons detected per point at R = 1 (σ = √(R/N)); 0 = none. A CCD pixel holds ~10⁴–10⁵.">
            shot: e⁻ at R = 1 <NumInput className="short" value={data.noiseShot ?? 0} placeholder={String(INSTRUMENT_DEFAULTS.shot)} step={1000} onChange={(noiseShot) => set({ noiseShot })} />
          </label>
          <label className="radio" title="Fluctuation of the source intensity: one factor (1 + ε) for a whole scan (curve), σ in %">
            source σ <NumInput className="tiny" value={data.noiseSource ?? 0} placeholder={String(INSTRUMENT_DEFAULTS.source)} step={0.05} onChange={(noiseSource) => set({ noiseSource })} /> %
          </label>
          <label className="radio" title="Scans averaged: every random part / √K">
            average of <NumInput className="tiny" value={data.noiseAvg ?? 1} step={1} onChange={(noiseAvg) => set({ noiseAvg })} /> scans
          </label>
          <label className="radio" title="ADC resolution over the full scale R = 1 (0 = not quantized); with several scans each one is quantized before averaging">
            ADC <NumInput className="tiny" value={data.noiseBits ?? 0} placeholder={String(INSTRUMENT_DEFAULTS.bits)} step={1} onChange={(noiseBits) => set({ noiseBits })} /> bits
          </label>
        </div>
      )}
    </>
  );
}

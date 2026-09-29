// The SPR Forge logo (src/assets/logo.svg; the favicon, public/favicon.svg, is its central node).
import logoUrl from './assets/logo.svg';

export function Logo({ height = 26 }: { height?: number }) {
  return <img className="logo" src={logoUrl} height={height} alt="" aria-hidden="true" draggable={false} />;
}

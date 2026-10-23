/** High tier only: bloom on real highlights, optional ambient occlusion and depth of field, vignette and film grain. */
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

export default function HighEffects({
  ao,
  bloom,
  dof,
}: {
  ao: boolean;
  bloom: { threshold: number; intensity: number };
  dof?: { focusDistance: number; focalLength: number; bokehScale: number };
}) {
  return (
    <EffectComposer multisampling={4}>
      {ao ? <N8AO halfRes aoRadius={0.4} intensity={1.6} distanceFalloff={0.6} /> : <></>}
      <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={0.15} mipmapBlur />
      {dof ? <DepthOfField focusDistance={dof.focusDistance} focalLength={dof.focalLength} bokehScale={dof.bokehScale} /> : <></>}
      <Vignette offset={0.3} darkness={0.35} />
      {/* Subtle film grain: breaks gradient banding and adds a photographic texture. */}
      <Noise premultiply opacity={0.035} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

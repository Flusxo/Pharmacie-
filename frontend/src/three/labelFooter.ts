/** Small print at the bottom of every 3D label, in the UI language. Kept apart from textures.ts so the
 * i18n provider can set it without pulling three.js into the main bundle. */
let footer = 'counter.';
export const labelFooter = () => footer;
export function setLabelFooter(text: string): void {
  footer = text;
}

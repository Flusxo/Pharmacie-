/**
 * Which step of a scroll story is being read. Written by the page (IntersectionObserver, no React state), read every
 * frame by the persistent 3D stage: the object tied to that step flies in and turns while the others fly out.
 * -1 = no story on screen.
 */
export const storyState = { active: -1 };

export const setStoryStep = (i: number) => {
  storyState.active = i;
};

// Shared motion presets. MotionConfig reducedMotion="user" at the root turns transforms off for people who
// ask for reduced motion; opacity fades remain.
import type { Transition } from "motion/react";

export const spring: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 };
export const softSpring: Transition = { type: "spring", stiffness: 260, damping: 32 };
export const easeOut: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };
export const quick: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] };

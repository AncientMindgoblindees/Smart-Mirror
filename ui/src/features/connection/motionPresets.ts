import type { Transition } from 'motion/react';

export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 120, damping: 18, mass: 1 };
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 300, damping: 24, mass: 0.8 };

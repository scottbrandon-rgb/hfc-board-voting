import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The board's text sizes (globals.css @theme). Without this, tailwind-merge
// reads `text-body` as a color and drops a real color such as `text-white`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'small', 'body', 'title', 'heading', 'display'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

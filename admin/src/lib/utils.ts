import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, letting later Tailwind utilities win. Used by the shadcn/ReUI components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

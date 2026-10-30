import type { Sharp as SharpInstance } from "sharp";

/** sharp 0.35 exports ESM types by name. Retain the earlier namespace type
 * spelling for existing consumers while upgrading the native decoder fixes.
 * This is a type alias only; runtime imports use the patched sharp package.
 */
declare global {
  namespace sharp {
    type Sharp = SharpInstance;
  }
}

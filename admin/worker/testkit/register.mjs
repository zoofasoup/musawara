// Lets node --test load worker modules that import without a file extension (as the bundler allows).
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (e.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(specifier)) return nextResolve(specifier + ".ts", context);
      throw e;
    }
  },
});

/** esbuild inlines imported .css files as text (loader in scripts/build.mjs). */
declare module "*.css" {
  const css: string;
  export default css;
}

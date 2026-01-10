declare module "madge" {
  interface MadgeResult {
    obj(): Record<string, string[]>;
    circular(): string[][];
    orphans(): string[];
    warnings(): Record<string, string[]>;
  }

  interface MadgeOptions {
    fileExtensions?: string[];
    excludeRegExp?: RegExp[];
    tsConfig?: string;
  }

  function madge(path: string, options?: MadgeOptions): Promise<MadgeResult>;
  export default madge;
}

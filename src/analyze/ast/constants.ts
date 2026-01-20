import type { NextjsFileType } from "../../types.js";

export const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useContext",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useImperativeHandle",
  "useLayoutEffect",
  "useDebugValue",
  "useDeferredValue",
  "useTransition",
  "useId",
];

export const NEXTJS_FILE_CONVENTIONS: Record<string, NextjsFileType> = {
  page: "page",
  layout: "layout",
  loading: "loading",
  error: "error",
  "not-found": "not-found",
  template: "template",
  route: "route",
  default: "default",
};

export const NEXTJS_SPECIAL_EXPORTS = [
  "generateMetadata",
  "generateStaticParams",
  "revalidate",
  "dynamic",
  "dynamicParams",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
];

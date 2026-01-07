import { useEffect, useLayoutEffect } from "react";

const isClient = typeof window !== "undefined";

export const useSafeLayout = isClient ? useLayoutEffect : useEffect;

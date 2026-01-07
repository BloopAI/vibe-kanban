export declare const initMetric: <MetricName extends "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB">(name: MetricName, value?: number) => {
    name: MetricName;
    value: number;
    rating: "good";
    delta: number;
    entries: (Extract<import("../types").CLSMetric, {
        name: MetricName;
    }> | Extract<import("../types").FCPMetric, {
        name: MetricName;
    }> | Extract<import("../types").FIDMetric, {
        name: MetricName;
    }> | Extract<import("../types").INPMetric, {
        name: MetricName;
    }> | Extract<import("../types").LCPMetric, {
        name: MetricName;
    }> | Extract<import("../types").TTFBMetric, {
        name: MetricName;
    }>)["entries"];
    id: string;
    navigationType: "navigate" | "reload" | "back-forward" | "back-forward-cache" | "prerender" | "restore";
};
//# sourceMappingURL=initMetric.d.ts.map
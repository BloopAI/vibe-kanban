/// <reference types="react" />
export interface Props {
    id: string;
    announcement: string;
    ariaLiveType?: "polite" | "assertive" | "off";
}
export declare function LiveRegion({ id, announcement, ariaLiveType }: Props): JSX.Element;

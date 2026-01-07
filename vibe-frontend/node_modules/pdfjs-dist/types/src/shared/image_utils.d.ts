export function applyMaskImageData({ src, srcPos, dest, destPos, width, height, inverseDecode, }: {
    src: any;
    srcPos?: number | undefined;
    dest: any;
    destPos?: number | undefined;
    width: any;
    height: any;
    inverseDecode?: boolean | undefined;
}): {
    srcPos: number;
    destPos: number;
};

// Widths next/image puts in a srcset. next.config.mjs passes them to Next, and
// scripts/build-photos.ts encodes every one, so a width the page asks for is
// always a file on disk.
//
// Next's default tops out at 3840. The photos are 2880 wide, so that size was
// the full photo at 600KB, and the server took 7s to encode it, the limit
// after which Next gives up. 2560 still covers a full-width photo on a retina
// laptop.
export const deviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 2560];
export const imageSizes = [32, 48, 64, 96, 128, 256, 384];

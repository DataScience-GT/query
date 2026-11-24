import type { ImageLoader, ImageProps, StaticImageData } from "next/image";
import { getImageProps } from "next/image";

type PhotoProps = Omit<ImageProps, "src" | "loader" | "quality"> & {
  src: StaticImageData;
};

// The files come from scripts/build-photos.ts, encoded at build. `src` is the
// hashed URL of the imported JPEG, "/_next/static/media/<name>.<hash>.jpg".
// The hash goes on as `?v=` so a replaced photo gets a new URL, which is what
// lets /photos be cached as immutable.
function photoLoader(format: "avif" | "webp"): ImageLoader {
  return ({ src, width }) => {
    const [name, hash] = src.slice(src.lastIndexOf("/") + 1).split(".");
    return `/photos/${name}-${width}.${format}?v=${hash}`;
  };
}

/**
 * A photo from `assets/images/photos`, served as an AVIF encoded at build with
 * a WebP fallback. Takes next/image props, so sizes, fill, placeholder="blur"
 * and lazy loading work as on `<Image>`.
 */
export default function Photo({ src, ...props }: PhotoProps) {
  const avif = getImageProps({ ...props, src, loader: photoLoader("avif") });
  const { props: img } = getImageProps({
    ...props,
    src,
    loader: photoLoader("webp"),
  });

  return (
    // `contents` keeps <picture> out of layout, so the <img> sizes and
    // positions against the same parent it would as a bare next/image.
    <picture className="contents">
      <source
        type="image/avif"
        srcSet={avif.props.srcSet}
        sizes={avif.props.sizes}
      />
      <img {...img} alt={img.alt} />
    </picture>
  );
}

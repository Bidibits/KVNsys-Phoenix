import { useEffect, useRef, useState } from 'react';

/**
 * Thumbnails already fetched, by product, for the list as it was last asked for (generation): the
 * search box hides and shows rows, and a row shown again shouldn't ask again. A new generation (the
 * list asked for again, after a save) starts afresh, so a changed picture shows.
 */
let cached = { generation: -1, pictures: new Map<string, Promise<string | null>>() };

function thumbnailOf(id: string, generation: number): Promise<string | null> {
  if (cached.generation !== generation) cached = { generation, pictures: new Map() };
  let picture = cached.pictures.get(id);
  if (!picture) {
    picture = window.kvnsys
      .productThumbnail(id)
      .then((answer) => (answer.ok ? answer.picture : null))
      .catch(() => null);
    cached.pictures.set(id, picture);
  }
  return picture;
}

/**
 * A product's picture, small, in a list row. It's only asked for once its row is about to come
 * into view, so a list of thousands never fetches thousands of pictures; a product without one
 * asks for nothing.
 */
export function ProductThumbnail({ id, name, hasPicture, generation }: { id: string; name: string; hasPicture: boolean; generation: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState<string | null>(null);

  useEffect(() => {
    setPicture(null);
    const element = box.current;
    if (!hasPicture || !element) return;
    let showing = true;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        void thumbnailOf(id, generation).then((found) => {
          if (showing) setPicture(found);
        });
      },
      { rootMargin: '200px' },
    );
    watch.observe(element);
    return () => {
      showing = false;
      watch.disconnect();
    };
  }, [id, hasPicture, generation]);

  // Without a picture the space is kept, empty, so the codes still line up.
  return (
    <div ref={box} className={hasPicture ? 'flex size-10 items-center justify-center overflow-hidden rounded border border-border/60 bg-white' : 'size-10'}>
      {picture && <img src={`data:image/jpeg;base64,${picture}`} alt={`Picture of ${name}`} className="size-full object-contain" />}
    </div>
  );
}

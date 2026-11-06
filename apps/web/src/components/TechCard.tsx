'use client';

import { useId, useState } from 'react';

/** Expandable "Built on" card: click anywhere (or the + button) to show how that piece works. */
export function TechCard({
  tag,
  color,
  title,
  short,
  more,
}: {
  tag: string;
  color: string;
  title: React.ReactNode;
  short: string;
  more: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    // The whole card is a mouse target; keyboard and screen-reader users get the + button.
    // State lives in data-open, not className, so React never strips the scroll-reveal `in` class.
    <article className="tech reveal" data-open={open} onClick={() => setOpen((o) => !o)}>
      <span className="tech-tag" style={{ '--bg': color } as React.CSSProperties}>
        {tag}
      </span>
      <h3>{title}</h3>
      <p className="tech-short">{short}</p>
      <div className="tech-more" id={id}>
        <p>{more}</p>
      </div>
      <button className="more" aria-expanded={open} aria-controls={id} aria-label={open ? 'Show less' : 'Show more'}>
        +
      </button>
    </article>
  );
}

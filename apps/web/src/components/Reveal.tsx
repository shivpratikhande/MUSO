'use client';

import { useEffect } from 'react';

/**
 * Fades `.reveal` elements in as they scroll into view. Renders nothing.
 * Also picks up `.reveal` elements React adds or re-creates later (state changes, hot
 * reload); otherwise those would stay invisible because nothing ever marked them `in`.
 */
export function Reveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );
    const scan = () => document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}

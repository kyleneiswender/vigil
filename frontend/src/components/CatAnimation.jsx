import { useEffect, useRef } from 'react';

/**
 * CatAnimation — plays a black cat emoji crossing the screen right-to-left.
 *
 * Triggered when a vulnerability is marked Remediated. The cat spawns near
 * the mouse cursor position, crosses the full viewport width, then removes
 * itself from the DOM by calling onComplete.
 *
 * @param {{ x: number, y: number }} triggerPosition - Mouse position at save time
 * @param {() => void} onComplete - Called when the animation finishes
 */
export default function CatAnimation({ triggerPosition, onComplete }) {
  const catRef = useRef(null);

  useEffect(() => {
    if (!catRef.current) return;

    const cat = catRef.current;
    const startX = window.innerWidth + 50;
    const endX = -100;
    const y = Math.max(
      20,
      Math.min((triggerPosition?.y ?? window.innerHeight / 2) - 20, window.innerHeight - 60)
    );

    cat.style.top  = `${y}px`;
    cat.style.left = `${startX}px`;

    const animation = cat.animate(
      [
        { transform: 'translateX(0px)' },
        { transform: `translateX(${endX - startX}px)` },
      ],
      {
        duration: 1800,
        easing:   'linear',
        fill:     'forwards',
      }
    );

    animation.onfinish = onComplete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={catRef}
      style={{
        position:      'fixed',
        fontSize:      '2.5rem',
        pointerEvents: 'none',
        zIndex:        9999,
        userSelect:    'none',
        lineHeight:    1,
      }}
      aria-hidden="true"
    >
      🐈‍⬛
    </div>
  );
}

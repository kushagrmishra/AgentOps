import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from 'motion/react';
import { cx } from '../lib/cx';

export interface DockItem {
  icon: React.ReactNode;
  label: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  separator?: boolean;
  active?: boolean;
}

export interface DockProps {
  items: DockItem[];
  magnification?: number;
  distance?: number;
  iconSize?: number;
  gap?: number;
  borderRadius?: number;
  alwaysShowLabels?: boolean;
  springOptions?: SpringOptions;
  className?: string;
}

const DEFAULT_SPRING: SpringOptions = {
  stiffness: 400,
  damping: 28,
  mass: 0.4,
};

function DockSeparator() {
  return (
    <div className="mx-1 flex items-center self-stretch">
      <div className="h-6 w-px bg-white/15" />
    </div>
  );
}

function DockIcon({
  item,
  mouseX,
  magnification,
  distance,
  iconSize,
  borderRadius,
  alwaysShowLabels,
  springOptions,
  onHover,
  iconRef: externalIconRef,
}: {
  item: DockItem;
  mouseX: ReturnType<typeof useMotionValue<number>>;
  magnification: number;
  distance: number;
  iconSize: number;
  borderRadius: number;
  alwaysShowLabels: boolean;
  springOptions: SpringOptions;
  onHover: (ref: React.RefObject<HTMLDivElement | null> | null) => void;
  iconRef: React.RefObject<HTMLDivElement | null>;
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const distanceFromMouse = useTransform(mouseX, (val) => {
    const el = wrapperRef.current;
    if (!el) return distance * 100;
    const rect = el.getBoundingClientRect();
    return Math.abs(val - (rect.left + rect.width / 2));
  });

  const gaussian = (d: number) =>
    (magnification - 1) * Math.exp(-(d * d) / (2 * distance * distance)) + 1;

  const widthRaw = useTransform(distanceFromMouse, (d) => iconSize * gaussian(d));
  const heightRaw = useTransform(distanceFromMouse, (d) => iconSize * gaussian(d));

  const width = useSpring(widthRaw, springOptions);
  const height = useSpring(heightRaw, springOptions);

  const faceClass = cx(
    'flex h-full w-full items-center justify-center',
    'text-white/75 transition-colors duration-150',
    'hover:bg-white/[0.08] hover:text-white',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
    '[&_svg]:size-[55%]',
    item.active && 'liquid-glass-inset text-white',
  );

  const faceStyle = { borderRadius } as const;

  return (
    <motion.div
      ref={wrapperRef}
      className="relative flex items-end justify-center"
      style={{ width, height: iconSize }}
    >
      {/* absolute, anchored bottom so icon grows upward */}
      <motion.div
        ref={externalIconRef}
        style={{ width, height, bottom: 0 }}
        className="absolute"
      >
        {item.to != null ? (
          <Link
            to={item.to}
            onClick={item.onClick}
            onMouseEnter={() => onHover(externalIconRef)}
            onMouseLeave={() => onHover(null)}
            aria-label={item.label}
            style={faceStyle}
            className={faceClass}
          >
            {item.icon}
          </Link>
        ) : item.href != null ? (
          <a
            href={item.href}
            onClick={item.onClick}
            onMouseEnter={() => onHover(externalIconRef)}
            onMouseLeave={() => onHover(null)}
            aria-label={item.label}
            style={faceStyle}
            className={faceClass}
          >
            {item.icon}
          </a>
        ) : (
          <button
            type="button"
            onClick={item.onClick}
            onMouseEnter={() => onHover(externalIconRef)}
            onMouseLeave={() => onHover(null)}
            aria-label={item.label}
            style={faceStyle}
            className={faceClass}
          >
            {item.icon}
          </button>
        )}
      </motion.div>

      {alwaysShowLabels && (
        <span className="mt-0.5 text-[10px] font-medium tracking-tight text-white/40 whitespace-nowrap pointer-events-none select-none leading-none">
          {item.label}
        </span>
      )}
    </motion.div>
  );
}

export function Dock({
  items,
  magnification = 1.8,
  distance = 120,
  iconSize = 40,
  gap = 6,
  borderRadius = 9999,
  alwaysShowLabels = false,
  springOptions = DEFAULT_SPRING,
  className,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const dockRef = React.useRef<HTMLDivElement>(null);
  const location = useLocation();

  const resolvedItems = React.useMemo(
    () =>
      items.map((item) => ({
        ...item,
        active:
          item.active ??
          Boolean(item.to && location.pathname.startsWith(item.to)),
      })),
    [items, location.pathname],
  );

  const iconRefs = React.useRef(
    resolvedItems.map(() => React.createRef<HTMLDivElement | null>()),
  );

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [tooltipX, setTooltipX] = React.useState(0);
  const [tooltipBottomOffset, setTooltipBottomOffset] = React.useState(0);

  React.useEffect(() => {
    if (hoveredIndex === null) return;
    const iconEl = iconRefs.current[hoveredIndex]?.current;
    const dockEl = dockRef.current;
    if (!iconEl || !dockEl) return;

    const iconRect = iconEl.getBoundingClientRect();
    const dockRect = dockEl.getBoundingClientRect();
    setTooltipX(iconRect.left - dockRect.left + iconRect.width / 2);
    setTooltipBottomOffset(dockRect.bottom - iconRect.top);
  }, [hoveredIndex]);

  const handleHover = React.useCallback(
    (ref: React.RefObject<HTMLDivElement | null> | null) => {
      if (ref === null) {
        setHoveredIndex(null);
        return;
      }
      const idx = iconRefs.current.findIndex((r) => r === ref);
      setHoveredIndex(idx >= 0 ? idx : null);
    },
    [],
  );

  return (
    <motion.div
      ref={dockRef}
      role="navigation"
      aria-label="Primary"
      className={cx(
        'liquid-glass relative flex items-end overflow-visible rounded-full px-3 py-2',
        className,
      )}
      style={{ gap, borderRadius }}
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
    >
      {resolvedItems.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          <DockIcon
            item={item}
            mouseX={mouseX}
            magnification={magnification}
            distance={distance}
            iconSize={iconSize}
            borderRadius={borderRadius}
            alwaysShowLabels={alwaysShowLabels}
            springOptions={springOptions}
            onHover={handleHover}
            iconRef={iconRefs.current[i]}
          />
          {item.separator && <DockSeparator />}
        </React.Fragment>
      ))}

      {!alwaysShowLabels && (
        <AnimatePresence>
          {hoveredIndex !== null && resolvedItems[hoveredIndex] && (
            <motion.div
              key="dock-tooltip"
              layoutId="dock-tooltip"
              className="pointer-events-none absolute z-[100] flex flex-col items-center"
              style={{
                left: tooltipX,
                bottom: tooltipBottomOffset + 8,
                x: '-50%',
              }}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              transition={{ duration: 0.13, ease: 'easeOut' }}
            >
              <span className="liquid-glass whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-white">
                {resolvedItems[hoveredIndex].label}
              </span>
              <svg
                width="8"
                height="4"
                viewBox="0 0 8 4"
                className="-mt-px text-white/20"
                aria-hidden
              >
                <path d="M0 0L4 4L8 0" fill="currentColor" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

export const DashboardNavIcons = {
  runs: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14M5 12h10M5 17h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="18" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  evals: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14l-7-3.5L5 19V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  api: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 8.5 4.5 12 8 15.5M16 8.5 19.5 12 16 15.5M13.2 6.5 10.8 17.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  billing: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
};

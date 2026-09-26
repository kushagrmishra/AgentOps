import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from 'motion/react';
import { cx } from '../lib/cx';

export interface DashboardDockItem {
  icon: React.ReactNode;
  label: string;
  /** internal route — renders as a react-router <Link> */
  to?: string;
  /** external URL — renders as an <a> */
  href?: string;
  onClick?: () => void;
  /** renders a visual separator after this item */
  separator?: boolean;
}

export interface DashboardDockProps {
  items: DashboardDockItem[];
  /** @default 1.8 */
  magnification?: number;
  /** cursor radius (px) within which neighbors are magnified — @default 120 */
  distance?: number;
  /** @default 40 */
  iconSize?: number;
  /** @default 4 */
  gap?: number;
  /** @default 16 */
  borderRadius?: number;
  /** show labels permanently instead of on hover — @default false */
  alwaysShowLabels?: boolean;
  springOptions?: SpringOptions;
  className?: string;
}

const DEFAULT_SPRING: SpringOptions = {
  stiffness: 400,
  damping: 25,
  mass: 0.4,
};

function DockSeparator() {
  return (
    <div className="mx-1 flex items-center self-stretch">
      <div className="h-6 w-px bg-white/10" />
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
  item: DashboardDockItem;
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
    'text-white transition-colors duration-150',
    'hover:bg-white/[0.1] hover:text-white',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spectre-cyan)]/50',
    '[&_svg]:size-[52%]',
  );

  const faceStyle = { borderRadius } as const;

  return (
    <motion.div
      ref={wrapperRef}
      className="relative flex items-end justify-center"
      style={{ width, height: iconSize }}
    >
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
        ) : (
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
        )}
      </motion.div>

      {alwaysShowLabels && (
        <span className="mt-0.5 text-xs font-semibold tracking-tight text-white whitespace-nowrap pointer-events-none select-none leading-none">
          {item.label}
        </span>
      )}
    </motion.div>
  );
}

export function DashboardDock({
  items,
  magnification = 1.3,
  distance = 100,
  iconSize = 38,
  gap = 5,
  borderRadius = 12,
  alwaysShowLabels = false,
  springOptions = DEFAULT_SPRING,
  className,
}: DashboardDockProps) {
  const mouseX = useMotionValue(Infinity);
  const dockRef = React.useRef<HTMLDivElement>(null);

  const iconRefs = React.useRef<React.RefObject<HTMLDivElement | null>[]>(
    items.map(() => React.createRef<HTMLDivElement>()),
  );

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [tooltipX, setTooltipX] = React.useState(0);
  const [tooltipBottomOffset, setTooltipBottomOffset] = React.useState(0);

  React.useEffect(() => {
    if (hoveredIndex === null) return;

    let raf: number;
    const update = () => {
      const iconEl = iconRefs.current[hoveredIndex]?.current;
      const dockEl = dockRef.current;
      if (iconEl && dockEl) {
        const iconRect = iconEl.getBoundingClientRect();
        const dockRect = dockEl.getBoundingClientRect();
        setTooltipX(iconRect.left - dockRect.left + iconRect.width / 2);
        setTooltipBottomOffset(dockRect.bottom - iconRect.top);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
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
      className={cx(
        'relative flex items-end overflow-visible border border-white/15 bg-black/60 px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(94,240,255,0.12)] transition-shadow duration-200 backdrop-blur-2xl',
        className,
      )}
      style={{ gap, borderRadius }}
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
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
          {hoveredIndex !== null && (
            <motion.div
              key="dashboard-dock-tooltip"
              layoutId="dashboard-dock-tooltip"
              className="pointer-events-none absolute flex flex-col items-center z-50"
              style={{
                left: tooltipX,
                bottom: tooltipBottomOffset + 12,
                x: '-50%',
              }}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              transition={{ duration: 0.13, ease: 'easeOut' }}
            >
              <span className="rounded-xl border border-white/15 bg-[#12161f]/95 px-3.5 py-1.5 text-sm font-semibold text-white shadow-xl backdrop-blur-md whitespace-nowrap">
                {items[hoveredIndex].label}
              </span>
              <svg
                width="10"
                height="5"
                viewBox="0 0 10 5"
                className="-mt-px text-[#12161f]"
                aria-hidden
              >
                <path d="M0 0L5 5L10 0" fill="currentColor" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { Sparkles } from "lucide-react";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type LiquidMetalVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "ghost";

export interface LiquidMetalButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  label?: string;
  viewMode?: "text" | "icon";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: React.ReactNode;
  variant?: LiquidMetalVariant;
  loading?: boolean;
}

export const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(
  function LiquidMetalButton(
    {
      label = "Get Started",
      onClick,
      viewMode = "text",
      size = "default",
      icon,
      variant = "default",
      loading = false,
      disabled = false,
      children,
      className = "",
      style,
      title,
      type = "button",
      ...rest
    },
    ref
  ) {
    const [isHovered, setIsHovered] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    const [ripples, setRipples] = useState<
      Array<{ x: number; y: number; id: number }>
    >([]);
    const shaderRef = useRef<HTMLDivElement>(null);
    // biome-ignore lint/suspicious/noExplicitAny: External library without types
    const shaderMount = useRef<any>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rippleId = useRef(0);

    useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);

    const isIconMode = viewMode === "icon" || size === "icon";
    const isSm = size === "sm";
    const isLg = size === "lg";

    useEffect(() => {
      const styleId = "shader-canvas-style-liquid-metal";
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement("style");
        styleEl.id = styleId;
        styleEl.textContent = `
          .shader-container-exploded canvas {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            border-radius: 9999px !important;
            pointer-events: none !important;
            opacity: 1 !important;
          }
          @keyframes ripple-animation {
            0% {
              transform: translate(-50%, -50%) scale(0);
              opacity: 0.5;
            }
            100% {
              transform: translate(-50%, -50%) scale(4);
              opacity: 0;
            }
          }
          @keyframes liquid-shimmer-flow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `;
        document.head.appendChild(styleEl);
      }

      let active = true;

      const loadShader = async () => {
        try {
          if (shaderRef.current && active) {
            if (shaderMount.current) {
              try {
                if (typeof shaderMount.current.dispose === "function") {
                  shaderMount.current.dispose();
                } else if (typeof shaderMount.current.destroy === "function") {
                  shaderMount.current.destroy();
                }
              } catch {
                // ignore
              }
              shaderMount.current = null;
            }

            const shiftRed = variant === "danger" ? 0.6 : 0.3;
            const shiftBlue = variant === "danger" ? 0.2 : 0.3;

            shaderMount.current = new ShaderMount(
              shaderRef.current,
              liquidMetalFragmentShader,
              {
                u_repetition: 4,
                u_softness: 0.5,
                u_shiftRed: shiftRed,
                u_shiftBlue: shiftBlue,
                u_distortion: 0.05,
                u_contour: 0.2,
                u_angle: 45,
                u_scale: 8,
                u_shape: 1,
                u_offsetX: 0.1,
                u_offsetY: -0.1,
              },
              { preserveDrawingBuffer: false, powerPreference: "low-power" },
              0.6
            );
          }
        } catch (error) {
          console.warn("[LiquidMetalButton] Shader initialization fallback:", error);
        }
      };

      loadShader();

      return () => {
        active = false;
        if (shaderMount.current) {
          try {
            if (typeof shaderMount.current.dispose === "function") {
              shaderMount.current.dispose();
            } else if (typeof shaderMount.current.destroy === "function") {
              shaderMount.current.destroy();
            }
          } catch {
            // ignore
          }
          shaderMount.current = null;
        }
      };
    }, [variant]);

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      setIsHovered(true);
      shaderMount.current?.setSpeed?.(1.3);
      rest.onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsHovered(false);
      setIsPressed(false);
      shaderMount.current?.setSpeed?.(0.6);
      rest.onMouseLeave?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;

      if (shaderMount.current?.setSpeed) {
        shaderMount.current.setSpeed(2.4);
        setTimeout(() => {
          if (isHovered) {
            shaderMount.current?.setSpeed?.(1.3);
          } else {
            shaderMount.current?.setSpeed?.(0.6);
          }
        }, 350);
      }

      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const ripple = { x, y, id: rippleId.current++ };

        setRipples((prev) => [...prev, ripple]);
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
        }, 600);
      }

      onClick?.(e);
    };

    const getCoreBackground = () => {
      if (variant === "danger") {
        return isPressed
          ? "linear-gradient(180deg, #140709 0%, #220b0e 100%)"
          : isHovered
          ? "linear-gradient(180deg, #240d11 0%, #150608 100%)"
          : "linear-gradient(180deg, #1c0a0d 0%, #0e0405 100%)";
      }
      if (variant === "primary") {
        return isPressed
          ? "linear-gradient(180deg, #12141a 0%, #212530 100%)"
          : isHovered
          ? "linear-gradient(180deg, #242936 0%, #13161f 100%)"
          : "linear-gradient(180deg, #1c202a 0%, #0e1015 100%)";
      }
      // default / secondary / ghost
      return isPressed
        ? "linear-gradient(180deg, #101114 0%, #1a1c22 100%)"
        : isHovered
        ? "linear-gradient(180deg, #1e2027 0%, #101115 100%)"
        : "linear-gradient(180deg, #16171d 0%, #0b0c0f 100%)";
    };

    return (
      <div
        className={`relative inline-flex items-center justify-center select-none ${
          disabled || loading ? "opacity-55 cursor-not-allowed" : ""
        } ${className}`}
        style={{
          perspective: "1000px",
          perspectiveOrigin: "50% 50%",
          ...style,
        }}
      >
        <div
          className="relative w-full h-full inline-flex items-center justify-center p-[2px] rounded-full overflow-hidden"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease",
            transform: isPressed ? "scale(0.97) translateY(1px)" : "none",
            boxShadow: isPressed
              ? "0 1px 3px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.12)"
              : isHovered
              ? "0 4px 16px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.2)"
              : "0 2px 8px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.12)",
          }}
        >
          {/* 1. Liquid Metal Shader Border Layer (Full button outer boundary) */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden"
            style={{
              zIndex: 10,
              background:
                variant === "danger"
                  ? "linear-gradient(135deg, #4c1d24 0%, #832734 50%, #301015 100%)"
                  : variant === "primary"
                  ? "linear-gradient(135deg, #475569 0%, #94a3b8 50%, #334155 100%)"
                  : "linear-gradient(135deg, #333842 0%, #5a6070 50%, #252830 100%)",
              backgroundSize: "200% 200%",
              animation: "liquid-shimmer-flow 6s ease infinite",
            }}
          >
            <div
              ref={shaderRef}
              className="shader-container-exploded"
              style={{
                borderRadius: "9999px",
                overflow: "hidden",
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* 2. OPAQUE Inner Button Core (Leaves 2px liquid metal border around perimeter) */}
          <div
            className="relative z-20 w-full h-full rounded-full flex items-center justify-center transition-colors duration-200"
            style={{
              background: getCoreBackground(),
              boxShadow: isPressed
                ? "inset 0px 2px 4px rgba(0, 0, 0, 0.8), inset 0px 1px 2px rgba(0, 0, 0, 0.6)"
                : "inset 0px 1px 1px rgba(255, 255, 255, 0.12), inset 0px -1px 2px rgba(0, 0, 0, 0.8)",
              border: "0.5px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* 3. Clean, Non-Neon Content Layer */}
            <div
              className={`flex items-center justify-center pointer-events-none ${
                isIconMode
                  ? isSm
                    ? "w-7 h-7 p-0"
                    : isLg
                    ? "w-11 h-11 p-0"
                    : "w-9 h-9 p-0"
                  : isSm
                  ? "min-h-[30px] px-3.5 py-1 gap-1.5 text-xs font-mono"
                  : isLg
                  ? "min-h-[44px] px-6 py-2.5 gap-2 text-base font-mono"
                  : "min-h-[38px] px-4.5 py-1.5 gap-2 text-sm font-mono"
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-1.5 text-slate-200">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span>{children || label}</span>
                </span>
              ) : children ? (
                <span className="inline-flex items-center gap-2 text-slate-100 font-medium whitespace-nowrap">
                  {icon && <span className="inline-flex items-center text-slate-300">{icon}</span>}
                  {children}
                </span>
              ) : isIconMode ? (
                icon ? (
                  <span className="inline-flex items-center text-slate-200">{icon}</span>
                ) : (
                  <Sparkles size={isSm ? 14 : isLg ? 20 : 16} className="text-slate-300" />
                )
              ) : (
                <>
                  {icon && <span className="inline-flex items-center text-slate-300">{icon}</span>}
                  <span className={`whitespace-nowrap tracking-tight ${
                    variant === "primary" ? "text-white font-semibold" : "text-slate-100 font-medium"
                  }`}>
                    {label}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 4. Interactive Click & Ripple Button Overlay */}
          <button
            ref={buttonRef}
            type={type}
            onClick={handleClick}
            disabled={disabled || loading}
            title={title}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={() => !disabled && !loading && setIsPressed(true)}
            onMouseUp={() => !disabled && !loading && setIsPressed(false)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              cursor: disabled || loading ? "not-allowed" : "pointer",
              outline: "none",
              zIndex: 40,
              overflow: "hidden",
              borderRadius: "9999px",
            }}
            aria-label={typeof label === "string" ? label : title}
            {...rest}
          >
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                style={{
                  position: "absolute",
                  left: `${ripple.x}px`,
                  top: `${ripple.y}px`,
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%)",
                  pointerEvents: "none",
                  animation: "ripple-animation 0.6s ease-out",
                }}
              />
            ))}
          </button>
        </div>
      </div>
    );
  }
);

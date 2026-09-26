'use client';
import { useEffect, useState, type ComponentPropsWithoutRef, type ElementType } from 'react';
import { motion } from 'motion/react';

export type TextScrambleProps<T extends ElementType = 'p'> = {
  children: string;
  duration?: number;
  speed?: number;
  characterSet?: string;
  as?: T;
  className?: string;
  trigger?: boolean;
  onScrambleComplete?: () => void;
  onHoverStart?: () => void;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

const defaultChars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';

export function TextScramble<T extends ElementType = 'p'>({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = defaultChars,
  className,
  as,
  trigger = true,
  onScrambleComplete,
  onHoverStart,
  ...props
}: TextScrambleProps<T>) {
  const Component = as || 'p';
  const MotionComponent = motion.create(Component);
  const [displayText, setDisplayText] = useState(children);
  const [isScrambling, setIsScrambling] = useState(false);

  const scramble = () => {
    if (isScrambling) return;
    setIsScrambling(true);

    const steps = Math.max(1, Math.floor(duration / speed));
    let step = 0;

    const interval = setInterval(() => {
      let scrambled = '';
      const progress = step / steps;

      for (let i = 0; i < children.length; i++) {
        if (children[i] === ' ') {
          scrambled += ' ';
          continue;
        }

        if (progress * children.length > i) {
          scrambled += children[i];
        } else {
          scrambled +=
            characterSet[Math.floor(Math.random() * characterSet.length)];
        }
      }

      setDisplayText(scrambled);
      step++;

      if (step > steps) {
        clearInterval(interval);
        setDisplayText(children);
        setIsScrambling(false);
        onScrambleComplete?.();
      }
    }, speed * 1000);
  };

  useEffect(() => {
    if (!trigger) return;
    scramble();
  }, [trigger, children]);

  return (
    <MotionComponent
      className={className}
      onMouseEnter={onHoverStart}
      {...(props as any)}
    >
      {displayText}
    </MotionComponent>
  );
}

export function TextScrambleBasic() {
  return (
    <TextScramble className="font-mono text-sm uppercase">
      Text Scramble
    </TextScramble>
  );
}

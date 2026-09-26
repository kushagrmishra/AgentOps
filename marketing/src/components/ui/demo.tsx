"use client";

import LiquidMetalHero from '@/components/ui/liquid-metal-hero';

export default function LiquidMetalHeroDemo() {
  return (
    <LiquidMetalHero
      badge="✨ Next Generation UI"
      title="Fluid Design Excellence"
      subtitle="Experience the future of web interfaces with liquid metal aesthetics that adapt, flow, and captivate. Built for modern applications that demand both beauty and performance."
      primaryCtaLabel="Start Building"
      secondaryCtaLabel="View Examples"
      onPrimaryCtaClick={() => alert("Primary CTA clicked!")}
      onSecondaryCtaClick={() => alert("Secondary CTA clicked!")}
      features={[
        "Seamless Animations",
        "Responsive Excellence", 
        "Modern Architecture"
      ]}
    />
  );
}

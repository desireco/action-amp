"use client";

import * as React from "react";
import { Button as ShadcnButton } from "@/components/ui/button";

export interface ButtonShadcnProps extends React.ComponentProps<typeof ShadcnButton> {
  href?: string;
  target?: string;
  rel?: string;
}

export const ButtonShadcn = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonShadcnProps>(
  ({ className, variant, size, href, target, rel, children, ...props }, ref) => {
    if (href) {
      return (
        <ShadcnButton
          asChild
          className={className}
          variant={variant}
          size={size}
          {...props}
        >
          <a href={href} target={target} rel={rel} ref={ref as React.Ref<HTMLAnchorElement>}>
            {children}
          </a>
        </ShadcnButton>
      );
    }

    return (
      <ShadcnButton
        className={className}
        variant={variant}
        size={size}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...props}
      >
        {children}
      </ShadcnButton>
    );
  }
);

ButtonShadcn.displayName = "ButtonShadcn";
import type { CSSProperties } from "react";

export type IconProps = {
  size?: number;              // размер в px
  title?: string;             // доступность (если надо)
  className?: string;
  style?: CSSProperties;
};

export function IconBase({
  size = 18,
  title,
  className,
  style,
  children,
  ...rest
}: IconProps & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{ display: "block", ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
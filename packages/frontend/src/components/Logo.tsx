import iconDark from "../assets/tashi-icon-dark.svg";
import iconLight from "../assets/tashi-icon-light.svg";
import markDark from "../assets/tashi-mark-dark.svg";
import markLight from "../assets/tashi-mark-light.svg";

const VARIANTS = {
  mark: { light: markLight, dark: markDark },
  icon: { light: iconLight, dark: iconDark },
};

export function Logo({
  className,
  variant = "mark",
}: {
  className?: string;
  variant?: keyof typeof VARIANTS;
}) {
  const { light, dark } = VARIANTS[variant];
  return (
    <picture>
      <source srcSet={dark} media="(prefers-color-scheme: dark)" />
      <img className={className} src={light} alt="" />
    </picture>
  );
}

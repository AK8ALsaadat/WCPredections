import Image from "next/image";
import { cn } from "@/lib/utils";

type TeamLogoProps = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: 24, md: 36, lg: 48 };

export function TeamLogo({ name, shortName, logoUrl, size = "md" }: TeamLogoProps) {
  const px = sizes[size];

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={px}
        height={px}
        className="rounded-full object-contain"
        unoptimized
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-card-border font-bold text-foreground",
        size === "sm" && "h-6 w-6 text-xs",
        size === "md" && "h-9 w-9 text-sm",
        size === "lg" && "h-12 w-12 text-base"
      )}
    >
      {shortName.slice(0, 3)}
    </div>
  );
}

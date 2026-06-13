import { cn } from "@/lib/utils";
import { getFlagUrl } from "@/lib/country-flags";
import { OptimizedImage } from "@/components/ui/OptimizedImage";

type TeamLogoProps = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: 24, md: 36, lg: 48 };

export function TeamLogo({ name, shortName, logoUrl, size = "md" }: TeamLogoProps) {
  const px = sizes[size];
  
  // محاولة استخدام العلم الرسمي أولاً
  const flagUrl = getFlagUrl(name) || getFlagUrl(shortName);
  const finalLogoUrl = logoUrl || flagUrl;

  if (finalLogoUrl) {
    return (
      <OptimizedImage
        src={finalLogoUrl}
        alt={name}
        width={px}
        height={px}
        className={cn("rounded-full object-contain", flagUrl ? "border border-card-border/30" : "")}
        fallback={flagUrl || undefined}
        unoptimized={!flagUrl}
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

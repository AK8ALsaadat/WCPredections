import { resolveFootballApiProviderName } from "@/services/football-api/types";

export function SportScoreAttribution() {
  if (resolveFootballApiProviderName() !== "sportscore") return null;

  return (
    <footer className="border-t border-white/10 py-3 text-center text-xs text-muted-foreground">
      <span>البيانات من </span>
      <a
        href="https://sportscore.com/"
        rel="dofollow"
        target="_blank"
        className="font-medium text-foreground/80 underline-offset-2 hover:underline"
      >
        SportScore
      </a>
    </footer>
  );
}

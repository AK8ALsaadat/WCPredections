import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Navbar } from "@/components/layout/Navbar";
import { SportScoreAttribution } from "@/components/layout/SportScoreAttribution";
import { canShowKnockoutFeatures } from "@/lib/tournament-gates";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.hasSeenTutorial === false) redirect("/tutorial");
  if (
    user.hasSeenKnockoutTutorial !== true &&
    (await canShowKnockoutFeatures())
  ) {
    redirect("/knockout-tutorial");
  }

  return (
    <div className="min-h-screen">
      <Navbar user={user} />
      <main className="mx-auto max-w-7xl px-3 py-4 pb-24 md:px-6 md:py-8 md:pb-8">
        {children}
      </main>
      <MobileBottomNav />
      <SportScoreAttribution />
    </div>
  );
}

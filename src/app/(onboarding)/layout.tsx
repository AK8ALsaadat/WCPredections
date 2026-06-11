import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.hasSeenTutorial !== false) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {children}
    </div>
  );
}

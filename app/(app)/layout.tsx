import { redirect } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";
import { getCurrentMember } from "@/lib/family";

/**
 * Wraps the signed-in screens with the tab bar.
 *
 * The membership check lives here so every screen inside gets it, and so a
 * brand-new user always lands on /onboarding rather than an empty Memos board.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

export const metadata = { title: "Offline — Family Hub" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="muted mt-3 text-sm">
        Family Hub needs a connection to show the latest memos, events and
        lists. Reconnect and pull down to refresh.
      </p>
    </main>
  );
}

import { Shell } from "@/components/shell";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </StoreProvider>
  );
}

import { PageLoader } from "@/components/system";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <PageLoader label="Loading" />
    </div>
  );
}

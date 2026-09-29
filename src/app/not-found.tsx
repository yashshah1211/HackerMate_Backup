import { Compass, House, LayoutDashboard } from "lucide-react";
import { ButtonLink } from "@/components/system";

export default function NotFound() {
  return (
    <main
      data-v2
      className="mx-auto flex min-h-[70vh] w-full max-w-[560px] flex-col items-center justify-center px-5 py-16 text-center"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-md bg-selected text-ink-3">
        <Compass className="size-5" aria-hidden />
      </span>
      <p className="mt-5 caps-label text-ink-3">Error 404</p>
      <h1
        data-v2-heading
        className="mt-2 font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink [font-variation-settings:'wdth'_92] md:text-[34px]"
      >
        Page not found
      </h1>
      <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed text-ink-2">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <ButtonLink href="/dashboard" variant="primary" size="lg" icon={<LayoutDashboard aria-hidden />}>
          Return to Dashboard
        </ButtonLink>
        <ButtonLink href="/" variant="secondary" size="lg" icon={<House aria-hidden />}>
          Home
        </ButtonLink>
      </div>
    </main>
  );
}

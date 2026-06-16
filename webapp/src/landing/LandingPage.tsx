import logo from "../assets/logo.svg";

export function LandingPage() {
  return (
    <div className="flex flex-col items-center gap-12 px-8 py-20">
      <section className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <img src={logo} alt="Action Amp" className="size-32" />
        <span className="bg-primary-100 text-primary-800 rounded-full px-3 py-1 text-sm font-semibold">
          ActionAmp
        </span>
        <h1 className="text-6xl font-bold tracking-tight text-neutral-900">
          Hello Jake!
        </h1>
        <p className="text-xl text-neutral-600">
          The list is demoted. <span className="font-semibold">What now?</span>{" "}
          is the home screen.
        </p>
      </section>
    </div>
  );
}

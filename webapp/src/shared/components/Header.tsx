import { logout, useAuth } from "wasp/client/auth";
import { Link } from "wasp/client/router";
import logo from "../../assets/logo.svg";
import { Button } from "./Button";

export function Header() {
  const { data: user } = useAuth();

  return (
    <header className="sticky top-0 z-10 flex justify-center border-b border-neutral-200 bg-white shadow-sm">
      <div className="flex w-full max-w-(--breakpoint-lg) items-center justify-between p-4 px-12">
        <Link to="/" className="flex items-center">
          <img src={logo} alt="" className="mr-3 size-10" />
          <h1 className="text-2xl font-semibold">Action Amp</h1>
        </Link>
        {user && (
          <nav>
            <ul className="flex gap-4 font-semibold">
              <li>
                <Button onClick={logout}>Log out</Button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}

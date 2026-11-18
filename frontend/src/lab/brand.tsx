import logo from "./brand-logo.svg";

export const appName = "HTTP Response Simulator";

/** Both surfaces use the supplied artwork. Only its ink inherits the surface's text color. */
export function Brand() {
  return (
    <svg
      className="brand"
      role="img"
      aria-label={appName}
      viewBox="116 383 1239 295"
    >
      <use href={logo.src + "#lockup"} />
    </svg>
  );
}

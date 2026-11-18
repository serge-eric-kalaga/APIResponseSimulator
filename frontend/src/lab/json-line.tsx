import s from "./trace.module.css";

/** Highlight the stored evidence as text. Raw request and response bodies never enter the DOM as markup. */
export function jsonLine(line: string) {
  const parts = line.split(/("(?:\\.|[^"\\])*")/g);
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : (
      <span key={i} className={parts[i + 1]?.startsWith(":") ? s.key : s.val}>
        {part}
      </span>
    ),
  );
}

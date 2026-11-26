// The ASCII agent on the first screen.
// agentArt gives the HTML of the figure for one pupil position.
// col and row are 0, 1 or 2 (1 is the center). mode is "open", "blink" or "happy".
// The build puts the source of this function inline in the page, so it must not use other names.
export function agentArt(col, row, mode) {
  const eye = (r) => {
    let cells = ["   ", "   ", "   "];
    if (mode === "blink") cells = ["   ", "---", "   "];
    else if (mode === "happy") cells = ["   ", "/ \\", "   "];
    else
      cells[row] = [" ", " ", " "]
        .map((c, i) => (i === col ? "o" : c))
        .join("");
    return '<span class="eye">' + cells[r] + "</span>";
  };
  return [
    "        *",
    "        |",
    "  .-----'-----.",
    " /             \\",
    "|  .---. .---.  |",
    "|  |" + eye(0) + "| |" + eye(0) + "|  |",
    "|  |" + eye(1) + "| |" + eye(1) + "|  |",
    "|  |" + eye(2) + "| |" + eye(2) + "|  |",
    "|  '---' '---'  |",
    " \\     ._.     /",
    "  '-----------'",
  ].join("\n");
}

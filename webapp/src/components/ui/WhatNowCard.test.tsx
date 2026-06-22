import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { WhatNowCard, type WhatNowTask } from "./WhatNowCard";
import { renderInContext } from "wasp/client/test";

// WhatNowCard — the composite task card (the product wedge). Completion circle
// → title → meta → amber "why" → Do this / Not now. Tests render + the three
// callbacks + conditional "why" line.

const BASE_TASK: WhatNowTask = {
  title: "Email Sarah",
  project: "Ship v2",
  due: "due today",
  size: "15 min",
};

describe("WhatNowCard", () => {
  describe("rendering", () => {
    it("shows the task title", () => {
      renderInContext(<WhatNowCard task={BASE_TASK} />);
      expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    });

    it("shows project + due + size in the meta line", () => {
      renderInContext(<WhatNowCard task={BASE_TASK} />);
      expect(screen.getByText("Ship v2")).toBeInTheDocument();
      expect(screen.getByText("due today")).toBeInTheDocument();
      expect(screen.getByText("15 min")).toBeInTheDocument();
    });

    it("shows the context line when provided", () => {
      renderInContext(
        <WhatNowCard task={BASE_TASK} context="Right now · 30 min available" />,
      );
      expect(screen.getByText(/Right now/)).toBeInTheDocument();
    });
  });

  describe("conditional 'why' line", () => {
    it("shows the why text when provided", () => {
      const { container } = renderInContext(
        <WhatNowCard task={{ ...BASE_TASK, why: "Top priority for", whyEmphasis: "Q3" }} />,
      );
      const why = container.querySelector(".aa-wn-card__why");
      expect(why).not.toBeNull();
      expect(why!.textContent).toMatch(/Top priority for.*Q3/);
    });

    it("omits the why line when not provided", () => {
      const { container } = renderInContext(<WhatNowCard task={BASE_TASK} />);
      expect(container.querySelector(".aa-wn-card__why")).toBeNull();
    });
  });

  describe("actions", () => {
    it("'Do this' fires onDo with the task", () => {
      const onDo = vi.fn();
      renderInContext(<WhatNowCard task={BASE_TASK} onDo={onDo} />);

      fireEvent.click(screen.getByRole("button", { name: /do this/i }));
      expect(onDo).toHaveBeenCalledWith(BASE_TASK);
    });

    it("'Not now' fires onNotNow with the task", () => {
      const onNotNow = vi.fn();
      renderInContext(<WhatNowCard task={BASE_TASK} onNotNow={onNotNow} />);

      fireEvent.click(screen.getByRole("button", { name: /not now/i }));
      expect(onNotNow).toHaveBeenCalledWith(BASE_TASK);
    });

    it("completion circle fires onComplete with the task", () => {
      const onComplete = vi.fn();
      const { container } = renderInContext(
        <WhatNowCard task={BASE_TASK} onComplete={onComplete} />,
      );

      const circle = container.querySelector(".aa-wn-card__completion button")!;
      fireEvent.click(circle);

      expect(onComplete).toHaveBeenCalledWith(BASE_TASK);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AttachmentThumbs, AttachmentGallery, AttachmentCover } from "./AttachmentThumbs";
import { renderInContext } from "wasp/client/test";

// AttachmentThumbs — thumbnails open the in-app lightbox (not a new tab).
// Esc/backdrop dismiss, arrows cycle multi-image items, and keydowns are
// stopped at the capture phase so page shortcuts (triage arrows, AppShell's
// Esc) stay quiet while the viewer is open.

function thumbs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-00000000000${i}`,
    filename: `shot-${i + 1}.png`,
  }));
}

describe("AttachmentThumbs", () => {
  it("renders one open-control per attachment", () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(2)} />);
    expect(screen.getByLabelText("Open image shot-1.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Open image shot-2.png")).toBeInTheDocument();
  });

  it("renders nothing without attachments", () => {
    const { container } = renderInContext(<AttachmentThumbs attachments={[]} />);
    expect(container.querySelector(".aa-attach-thumbs")).toBeNull();
  });

  it("clicking a thumbnail opens the lightbox with the full-size image", () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(1)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    const dialog = screen.getByRole("dialog", { name: "Attached image" });
    expect(dialog).toBeInTheDocument();
    const img = dialog.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("/api/attachments/00000000-0000-0000-0000-000000000000");
  });

  it("Esc closes and returns focus to the clicked thumbnail", async () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(1)} />);
    const opener = screen.getByLabelText("Open image shot-1.png");
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The close control receives focus on open (§9.5).
    expect(screen.getByLabelText("Close image")).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it("backdrop click closes; a click on the image itself does not", () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(1)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector(".aa-lightbox__img")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("arrows cycle a multi-image item and show the counter", () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(2)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    const img = screen.getByRole("dialog").querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("shot-2.png");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("alt")).toBe("shot-1.png");
    // Wraps around both ways.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("alt")).toBe("shot-2.png");
  });

  it("single-image items get no nav controls or counter", () => {
    renderInContext(<AttachmentThumbs attachments={thumbs(1)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/\s*1/)).not.toBeInTheDocument();
  });

  it("keydowns do not leak to page-level listeners while open", () => {
    const pageShortcut = vi.fn();
    window.addEventListener("keydown", pageShortcut);
    renderInContext(<AttachmentThumbs attachments={thumbs(1)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pageShortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", pageShortcut);
  });
});

describe("AttachmentGallery (triage media surface)", () => {
  function thumbs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      filename: `shot-${i + 1}.png`,
    }));
  }

  it("renders one large slide per image, first visible", () => {
    const { container } = renderInContext(<AttachmentGallery attachments={thumbs(3)} />);
    const slides = container.querySelectorAll(".aa-attach-gallery__slide");
    expect(slides).toHaveLength(3);
    expect(screen.getByAltText("shot-1.png")).toBeInTheDocument();
  });

  it("single image: no arrows or dots", () => {
    const { container } = renderInContext(<AttachmentGallery attachments={thumbs(1)} />);
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".aa-attach-gallery__dot")).toHaveLength(0);
  });

  it("next/prev arrows and dots move the active slide", () => {
    renderInContext(<AttachmentGallery attachments={thumbs(3)} />);
    const dots = () => document.querySelectorAll(".aa-attach-gallery__dot");
    expect(dots()[0].className).toContain("is-active");

    fireEvent.click(screen.getByLabelText("Next image"));
    expect(dots()[1].className).toContain("is-active");

    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(dots()[0].className).toContain("is-active");

    // Dots jump directly; arrows wrap around.
    fireEvent.click(dots()[2]);
    expect(dots()[2].className).toContain("is-active");
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(dots()[0].className).toContain("is-active");
  });

  it("clicking a slide opens the lightbox for that image", () => {
    renderInContext(<AttachmentGallery attachments={thumbs(2)} />);
    fireEvent.click(screen.getByAltText("shot-2.png"));
    const dialog = screen.getByRole("dialog", { name: "Attached image" });
    expect(dialog.querySelector("img")!.getAttribute("alt")).toBe("shot-2.png");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});

describe("AttachmentCover (inbox row preview)", () => {
  function thumbs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      filename: `shot-${i + 1}.png`,
    }));
  }

  it("shows the first image as the cover; no badge for a single image", () => {
    const { container } = renderInContext(<AttachmentCover attachments={thumbs(1)} />);
    expect(screen.getByAltText("shot-1.png")).toBeInTheDocument();
    expect(container.querySelector(".aa-attach-cover__count")).toBeNull();
  });

  it("badges extra images with +N", () => {
    renderInContext(<AttachmentCover attachments={thumbs(3)} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("click opens the lightbox at the first image", () => {
    renderInContext(<AttachmentCover attachments={thumbs(3)} />);
    fireEvent.click(screen.getByLabelText("Open image shot-1.png"));
    const dialog = screen.getByRole("dialog", { name: "Attached image" });
    expect(dialog.querySelector("img")!.getAttribute("alt")).toBe("shot-1.png");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

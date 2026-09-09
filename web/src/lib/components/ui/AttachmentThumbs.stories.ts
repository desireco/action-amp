import type { Meta, StoryObj } from "@storybook/svelte";
import AttachmentThumbs from "./AttachmentThumbs.svelte";
import AttachmentCover from "./AttachmentCover.svelte";

/**
 * AttachmentThumbs / AttachmentCover — captured-image previews (S12 share
 * target, webapp ui/AttachmentThumbs port). The bytes live behind the
 * owner-gated /api/attachments/:id; stories stub resolveSrc with an inline
 * SVG data URL so the catalog renders without a session.
 */

const STUB_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="oklch(0.5 0.09 220)"/><path d="M20 66l18-22 12 14 10-10 16 18z" fill="oklch(0.85 0.08 210)"/></svg>`,
  );
const stubSrc = () => STUB_SRC;

const attachments = [
  { id: "a1", filename: "Screenshot (9 Sept 2026 4:19:23 pm).png" },
  { id: "a2", filename: "receipt.png" },
  { id: "a3", filename: "whiteboard.jpg" },
];

const meta = {
  title: "ui/AttachmentThumbs",
  component: AttachmentThumbs,
  tags: ["autodocs"],
  parameters: { controls: { exclude: ["attachments"] } },
} satisfies Meta<typeof AttachmentThumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Thumbs: Story = {
  args: { attachments, size: "sm", resolveSrc: stubSrc },
};

export const ThumbsInline: Story = {
  args: { attachments: attachments.slice(0, 1), size: "xs", resolveSrc: stubSrc },
};

export const Cover: Story = {
  args: { attachments },
  render: () => ({
    Component: AttachmentCover,
    props: { attachments, resolveSrc: stubSrc },
  }),
};

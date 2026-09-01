import { q } from "typebase-io/db";

import * as schema from "./schema.ts";

export const relations = q.defineRelations(schema, (r) => ({
  sessions: {
    users: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
  accounts: {
    users: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },
  users: {
    sessions: r.many.sessions({
      from: r.users.id,
      to: r.sessions.userId,
    }),
    accounts: r.many.accounts({
      from: r.users.id,
      to: r.accounts.userId,
    }),
    links: r.many.links({
      from: r.users.id,
      to: r.links.userId,
    }),
  },
  links: {
    user: r.one.users({
      from: r.links.userId,
      to: r.users.id,
    }),
    linkTags: r.many.linkTags({
      from: r.links.id,
      to: r.linkTags.linkId,
    }),
  },
  tags: {
    user: r.one.users({
      from: r.tags.userId,
      to: r.users.id,
    }),
    linkTags: r.many.linkTags({
      from: r.tags.id,
      to: r.linkTags.tagId,
    }),
  },
  linkTags: {
    link: r.one.links({
      from: r.linkTags.linkId,
      to: r.links.id,
    }),
    tag: r.one.tags({
      from: r.linkTags.tagId,
      to: r.tags.id,
    }),
  },
  verifications: {},
}));

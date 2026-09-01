import { p } from "typebase-io/db";

export const linkStatus = p.pgEnum("link_status", ["NEW", "KEPT", "DISMISSED"]);

export const users = p.pgTable("users", {
  id: p.text("id").primaryKey(),
  name: p.text("name").notNull(),
  email: p.text("email").notNull().unique(),
  emailVerified: p.boolean("email_verified").default(false).notNull(),
  image: p.text("image"),
  createdAt: p.timestamp("created_at").defaultNow().notNull(),
  updatedAt: p.timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = p.pgTable(
  "sessions",
  {
    id: p.text("id").primaryKey(),
    expiresAt: p.timestamp("expires_at").notNull(),
    token: p.text("token").notNull().unique(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: p.text("ip_address"),
    userAgent: p.text("user_agent"),
    userId: p.text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [p.index("sessions_userId_idx").on(table.userId)],
);

export const accounts = p.pgTable(
  "accounts",
  {
    id: p.text("id").primaryKey(),
    accountId: p.text("account_id").notNull(),
    providerId: p.text("provider_id").notNull(),
    userId: p.text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: p.text("access_token"),
    refreshToken: p.text("refresh_token"),
    idToken: p.text("id_token"),
    accessTokenExpiresAt: p.timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: p.timestamp("refresh_token_expires_at"),
    scope: p.text("scope"),
    password: p.text("password"),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [p.index("accounts_userId_idx").on(table.userId)],
);

export const verifications = p.pgTable(
  "verifications",
  {
    id: p.text("id").primaryKey(),
    identifier: p.text("identifier").notNull(),
    value: p.text("value").notNull(),
    expiresAt: p.timestamp("expires_at").notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [p.index("verifications_identifier_idx").on(table.identifier)],
);

export const links = p.pgTable(
  "links",
  {
    id: p.uuid().primaryKey().defaultRandom(),
    userId: p
      .text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: p.text().notNull(),
    title: p.text().notNull(),
    status: linkStatus().notNull().default("NEW"),
    createdAt: p.timestamp("created_at").notNull().defaultNow(),
    keptAt: p.timestamp("kept_at"),
  },
  (table) => [
    p.index("links_user_status_created_idx").on(table.userId, table.status, table.createdAt),
  ],
);

export const tags = p.pgTable(
  "tags",
  {
    id: p.uuid().primaryKey().defaultRandom(),
    userId: p
      .text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: p.text().notNull(),
  },
  (table) => [p.unique("tags_user_name_unique").on(table.userId, table.name)],
);

export const linkTags = p.pgTable(
  "link_tags",
  {
    linkId: p
      .uuid("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    tagId: p
      .uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [p.primaryKey({ columns: [table.linkId, table.tagId] })],
);

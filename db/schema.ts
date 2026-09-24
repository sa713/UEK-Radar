import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  username: text("username"),
  role: text("role").notNull().default("reader"),
  language: text("language").notNull().default("ru"),
  topics: text("topics").notNull().default("[]"),
  sources: text("sources").notNull().default("[]"),
  digest: integer("digest").notNull().default(0),
  botStarted: integer("bot_started").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), url: text("url").notNull(),
  kind: text("kind").notNull(), group: text("group_name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  status: text("status").notNull().default("pending"),
  error: text("error"), lastChecked: integer("last_checked"),
  lastSuccess: integer("last_success"), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("sources_url").on(t.url)]);
export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull(),
  scope: text("scope").notNull(), url: text("url").notNull(),
  titleOriginal: text("title_original").notNull(),
  titleRu: text("title_ru"), titleEn: text("title_en"),
  factRu: text("fact_ru"), factEn: text("fact_en"),
  whyRu: text("why_ru"), whyEn: text("why_en"),
  actionRu: text("action_ru"), actionEn: text("action_en"),
  topics: text("topics").notNull().default("[]"),
  statusLabel: text("status_label").notNull().default("Знать"),
  body: text("body"), sourcesJson: text("sources_json").notNull().default("[]"),
  state: text("state").notNull().default("published"),
  important: integer("important").notNull().default(0),
  demo: integer("demo").notNull().default(0),
  uploadId: text("upload_id"),
  publishedAt: integer("published_at").notNull(),
  discoveredAt: integer("discovered_at").notNull(),
}, (t) => [uniqueIndex("stories_url").on(t.url), index("stories_date").on(t.discoveredAt)]);
export const suggestions = sqliteTable("suggestions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(),
  url: text("url").notNull(), status: text("status").notNull().default("pending"),
  reason: text("reason"), createdAt: integer("created_at").notNull(),
});
export const feedback = sqliteTable("feedback", {
  userId: text("user_id").notNull(), storyId: text("story_id").notNull(),
  rating: text("rating"), saved: integer("saved").notNull().default(0),
  viewedAt: integer("viewed_at"),
}, (t) => [uniqueIndex("feedback_key").on(t.userId,t.storyId)]);
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(), filename: text("filename").notNull(),
  mime: text("mime").notNull(), size: integer("size").notNull(),
  status: text("status").notNull(), error: text("error"),
  createdAt: integer("created_at").notNull(),
});
export const weekly = sqliteTable("weekly", {
  id: text("id").primaryKey(), titleRu: text("title_ru").notNull(),
  titleEn: text("title_en").notNull(), bodyRu: text("body_ru").notNull(),
  bodyEn: text("body_en").notNull(), storyIds: text("story_ids").notNull(),
  status: text("status").notNull().default("draft"), createdAt: integer("created_at").notNull(),
});
export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(), weekId: text("week_id").notNull(),
  userId: text("user_id").notNull(), status: text("status").notNull(),
  error: text("error"), sentAt: integer("sent_at"),
}, (t) => [uniqueIndex("delivery_key").on(t.weekId,t.userId)]);
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), type: text("type").notNull(),
  status: text("status").notNull(), detail: text("detail"),
  createdAt: integer("created_at").notNull(),
});
export const collectionSchedule = sqliteTable("collection_schedule", {
  id: integer("id").primaryKey(), mode: text("mode").notNull().default("daily"),
  days: text("days").notNull().default("[1,2,3,4,5,6,7]"),
  timeMsk: text("time_msk").notNull().default("05:00"), updatedAt: integer("updated_at").notNull(),
});
export const collectionRuns = sqliteTable("collection_runs", {
  slot: text("slot").primaryKey(), status: text("status").notNull(),
  total: integer("total").notNull().default(0), checked: integer("checked").notNull().default(0),
  added: integer("added").notNull().default(0), errors: integer("errors").notNull().default(0),
  startedAt: integer("started_at").notNull(), finishedAt: integer("finished_at"),
});
export const collectionRunSources = sqliteTable("collection_run_sources", {
  slot: text("slot").notNull(), sourceId: text("source_id").notNull(),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  claimedAt: integer("claimed_at"), added: integer("added").notNull().default(0), error: text("error"),
}, (t) => [primaryKey({columns:[t.slot,t.sourceId]})]);

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    publisher: text("publisher").notNull().default(""),
    year: text("year").notNull().default(""),
    isbn: text("isbn").notNull().default(""),
    unifiedBookNumber: text("unified_book_number").notNull().default(""),
    callNumber: text("call_number").notNull().default(""),
    edition: text("edition").notNull().default(""),
    language: text("language").notNull().default(""),
    volume: text("volume").notNull().default(""),
    note: text("note").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    coverImage: text("cover_image").notNull().default(""),
    storageLocation: text("storage_location").notNull().default(""),
    boxId: integer("box_id"),
    tags: text("tags").notNull().default(""),
    savedAt: text("saved_at").notNull(),
  },
);

export const boxes = sqliteTable("boxes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  location: text("location").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const tagDefinitions = sqliteTable("tag_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  color: text("color").notNull(),
  createdAt: text("created_at").notNull(),
});

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  instructorName: text("instructor_name").notNull(),
  status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  endedAt: integer("ended_at"),
  deletedAt: integer("deleted_at"),
});

export const courseSlugs = sqliteTable("course_slugs", {
  slug: text("slug").primaryKey(),
  courseId: text("course_id").notNull(),
  isCurrent: integer("is_current").notNull(),
});

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    colorIndex: integer("color_index").notNull(),
  },
  (t) => [index("groups_course").on(t.courseId, t.position)],
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    publicId: text("public_id").notNull().unique(),
    tokenHash: text("token_hash").notNull().unique(),
    nickname: text("nickname").notNull(),
    groupId: text("group_id"),
    avatarColor: integer("avatar_color").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("participants_course").on(t.courseId)],
);

export const lectures = sqliteTable(
  "lectures",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    coverFileId: text("cover_file_id"),
    published: integer("published").notNull().default(0),
    status: text("status", { enum: ["before", "open", "closed"] }).notNull().default("before"),
    openedAt: integer("opened_at"),
    closedAt: integer("closed_at"),
    autoClosed: integer("auto_closed").notNull().default(0),
    noticePostId: text("notice_post_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("lectures_course_date").on(t.courseId, t.date)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    lectureId: text("lecture_id").notNull(),
    sortKey: text("sort_key").notNull(),
    emoji: text("emoji").notNull().default("📌"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    visible: integer("visible").notNull().default(0),
    hasAssignment: integer("has_assignment").notNull().default(1),
    assignmentDueAt: integer("assignment_due_at"),
    assignmentVisibility: text("assignment_visibility", { enum: ["public", "instructor_only"] })
      .notNull()
      .default("public"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("cards_lecture_sort").on(t.lectureId, t.sortKey)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id"),
    lectureId: text("lecture_id").notNull(),
    tab: text("tab", { enum: ["material", "assignment", "notice"] }).notNull(),
    authorType: text("author_type", { enum: ["instructor", "participant"] }).notNull(),
    participantId: text("participant_id"),
    groupId: text("group_id"),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    sortKey: text("sort_key"),
    pinnedAt: integer("pinned_at"),
    isLate: integer("is_late").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    instructorLiked: integer("instructor_liked").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("posts_card_tab_created").on(t.cardId, t.tab, t.createdAt),
    index("posts_card_group").on(t.cardId, t.groupId),
    index("posts_participant_created").on(t.participantId, t.createdAt),
    index("posts_lecture").on(t.lectureId),
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    thumbR2Key: text("thumb_r2_key"),
    thumbSize: integer("thumb_size"),
    category: text("category", { enum: ["material", "student", "screenshot", "cover"] }).notNull(),
    uploaderType: text("uploader_type", { enum: ["instructor", "participant"] }).notNull(),
    uploaderId: text("uploader_id").notNull(),
    status: text("status", { enum: ["pending", "ready"] }).notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("files_course_category").on(t.courseId, t.category),
    index("files_uploader_created").on(t.uploaderId, t.createdAt),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    kind: text("kind", { enum: ["image", "video", "pdf", "file", "link"] }).notNull(),
    fileId: text("file_id"),
    url: text("url"),
    linkTitle: text("link_title"),
    linkDescription: text("link_description"),
    linkImage: text("link_image"),
    linkSite: text("link_site"),
    linkProvider: text("link_provider", { enum: ["youtube", "google_docs", "google_slides", "google_drive", "generic"] }),
    position: integer("position").notNull(),
  },
  (t) => [index("attachments_post").on(t.postId, t.position), index("attachments_file").on(t.fileId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    authorType: text("author_type", { enum: ["instructor", "participant"] }).notNull(),
    participantId: text("participant_id"),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("comments_post_created").on(t.postId, t.createdAt),
    index("comments_participant_created").on(t.participantId, t.createdAt),
  ],
);

export const likes = sqliteTable(
  "likes",
  {
    postId: text("post_id").notNull(),
    likerKey: text("liker_key").notNull(),
    isInstructor: integer("is_instructor").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.likerKey] })],
);

export const helpRequests = sqliteTable(
  "help_requests",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    lectureId: text("lecture_id").notNull(),
    participantId: text("participant_id").notNull(),
    kind: text("kind", { enum: ["screenshot", "live"] }).notNull(),
    message: text("message"),
    fileId: text("file_id"),
    status: text("status", { enum: ["waiting", "viewing", "done"] }).notNull().default("waiting"),
    createdAt: integer("created_at").notNull(),
    handledAt: integer("handled_at"),
  },
  (t) => [
    index("help_course_status_created").on(t.courseId, t.status, t.createdAt),
    index("help_participant_created").on(t.participantId, t.createdAt),
    index("help_file").on(t.fileId),
  ],
);

export const adminState = sqliteTable("admin_state", {
  id: integer("id").primaryKey(),
  sessionVersion: integer("session_version").notNull().default(1),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
});

export const loginAttempts = sqliteTable("login_attempts", {
  ipHash: text("ip_hash").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

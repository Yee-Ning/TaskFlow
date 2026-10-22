/**
 * 数据库表结构定义
 *
 * 表清单：
 * 1. users        - 用户表
 * 2. categories   - 分类表
 * 3. tasks        - 任务表
 * 4. tags         - 标签表
 * 5. task_tags    - 任务-标签关联表（多对多）
 * 6. attachments  - 附件表
 * 7. reminders    - 提醒表
 * 8. operation_logs - 操作日志表
 */

export const CREATE_TABLES_SQL = `

-- ========================
-- 1. 用户表
-- ========================
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,               -- 用户名（登录用）
  password_hash TEXT    NOT NULL,                      -- 加密后的密码
  nickname      TEXT    DEFAULT '',                    -- 昵称
  avatar        TEXT    DEFAULT '',                    -- 头像路径
  theme         TEXT    DEFAULT 'light',               -- 主题风格 light / dark
  security_question TEXT,                              -- 密码找回问题
  security_answer_hash TEXT,                           -- 密码找回答案（加密）
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    DEFAULT (datetime('now','localtime'))
);

-- ========================
-- 2. 分类表
-- ========================
CREATE TABLE IF NOT EXISTS categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,                      -- 所属用户
  name          TEXT    NOT NULL,                      -- 分类名称（如：学习、工作、生活）
  icon          TEXT    DEFAULT '📁',                  -- 分类图标（emoji 或 icon class）
  color         TEXT    DEFAULT '#409EFF',             -- 分类颜色
  sort_order    INTEGER DEFAULT 0,                    -- 排序序号
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========================
-- 3. 任务表
-- ========================
CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,                    -- 所属用户
  category_id     INTEGER DEFAULT NULL,                -- 所属分类（可选）
  name            TEXT    NOT NULL,                    -- 任务名称
  description     TEXT    DEFAULT '',                  -- 详细描述
  priority        TEXT    DEFAULT 'medium'             -- 优先级：high / medium / low
                         CHECK(priority IN ('high','medium','low')),
  status          TEXT    DEFAULT 'todo'               -- 状态：todo / in_progress / done
                         CHECK(status IN ('todo','in_progress','done')),
  progress        INTEGER DEFAULT 0                   -- 进度百分比 0-100
                         CHECK(progress >= 0 AND progress <= 100),
  deadline        TEXT    DEFAULT NULL,                -- 截止日期 YYYY-MM-DD HH:MM:SS
  estimated_time  INTEGER DEFAULT 0,                  -- 预计耗时（分钟）
  actual_time     INTEGER DEFAULT 0,                  -- 实际耗时（分钟）
  completed_at    TEXT    DEFAULT NULL,                -- 完成时间
  created_at      TEXT    DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ========================
-- 4. 标签表
-- ========================
CREATE TABLE IF NOT EXISTS tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,                      -- 所属用户
  name          TEXT    NOT NULL,                      -- 标签名称（如：紧急、长期、协作）
  color         TEXT    DEFAULT '#909399',             -- 标签颜色
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========================
-- 5. 任务-标签 关联表（多对多）
-- ========================
CREATE TABLE IF NOT EXISTS task_tags (
  task_id   INTEGER NOT NULL,
  tag_id    INTEGER NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);

-- ========================
-- 6. 附件表
-- ========================
CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL,                      -- 所属任务
  file_name     TEXT    NOT NULL,                      -- 原始文件名
  file_path     TEXT    NOT NULL,                      -- 存储路径
  file_size     INTEGER DEFAULT 0,                    -- 文件大小（字节）
  mime_type     TEXT    DEFAULT '',                    -- 文件类型
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ========================
-- 7. 提醒表
-- ========================
CREATE TABLE IF NOT EXISTS reminders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL,                      -- 所属任务
  remind_at     TEXT    NOT NULL,                      -- 提醒时间
  type          TEXT    DEFAULT 'once'                 -- 类型：once(单次) / repeat(重复)
                       CHECK(type IN ('once','repeat')),
  repeat_rule   TEXT    DEFAULT NULL,                  -- 重复规则（如 daily / weekly / custom cron）
  is_triggered  INTEGER DEFAULT 0,                    -- 是否已触发 0/1
  is_dismissed  INTEGER DEFAULT 0,                    -- 是否已处理 0/1
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ========================
-- 8. 操作日志表
-- ========================
CREATE TABLE IF NOT EXISTS operation_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,                      -- 操作用户
  action        TEXT    NOT NULL,                      -- 操作类型：create / update / delete / complete / remind
  target_type   TEXT    NOT NULL,                      -- 操作对象类型：task / category / tag / reminder
  target_id     INTEGER DEFAULT NULL,                 -- 操作对象ID
  detail        TEXT    DEFAULT '',                    -- 操作详情描述
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========================
-- 索引
-- ========================
CREATE INDEX IF NOT EXISTS idx_tasks_user_id       ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category_id   ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority      ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline      ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_categories_user_id  ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id        ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id   ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);

`;

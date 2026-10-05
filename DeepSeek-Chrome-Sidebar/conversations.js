// Each conversation has its own storage key; saving one never replaces the others.
const CHAT_PREFIX = "deepseekChat:";
const LAST_PREFIX = "deepseekLastChat:";
const TAB_CHAT_PREFIX = "deepseekTabChat:";
const DRAFT_PREFIX = "deepseekDraftChat:";

function documentKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch { return url || "legacy"; }
}

class ConversationStore {
  constructor(storage, sessionStorage) {
    this.storage = storage;
    this.sessionStorage = sessionStorage;
    this.chats = new Map();
    this.last = new Map();
  }

  async load(legacy) {
    const values = await this.storage.get(null);
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith(CHAT_PREFIX) && value?.id) this.chats.set(value.id, value);
      if (key.startsWith(LAST_PREFIX)) this.last.set(key.slice(LAST_PREFIX.length), value);
    }
    const drafts = await this.sessionStorage?.get(null) || {};
    for (const [key, value] of Object.entries(drafts)) {
      if (key.startsWith(DRAFT_PREFIX) && value?.id) this.chats.set(value.id, value);
    }
    if (!values.deepseekChatMigrationDone) {
      // Preserve old messages by source, including messages whose source is unknown.
      const groups = new Map();
      for (const message of legacy?.messages || []) {
        const source = documentKey(message.source || legacy.selection?.url || "legacy");
        if (!groups.has(source)) groups.set(source, []);
        groups.get(source).push(message);
      }
      for (const [source, messages] of groups) {
        const chat = this.create({ url: source, title: "旧版对话" });
        chat.messages = messages.map(message => ({ ...message,
          content: message.role === "user" ? message.displayContent || message.content : message.content,
          streaming: false
        }));
        chat.title = chat.messages.find(m => m.role === "user")?.displayContent?.slice(0, 40) || "旧版对话";
        chat.selection = documentKey(legacy.selection?.url) === source ? legacy.selection : null;
        await this.save(chat);
      }
      await this.storage.set({ deepseekChatMigrationDone: true });
    }
  }

  create(page) {
    const chat = {
      id: crypto.randomUUID(), source: documentKey(page.url), pageUrl: page.url,
      pageTitle: page.title || "网页", title: "新对话", customTitle: false,
      messages: [], selection: null, draft: "", createdAt: Date.now(), updatedAt: Date.now()
    };
    this.chats.set(chat.id, chat);
    this.last.set(chat.source, chat.id);
    return chat;
  }

  forPage(page) {
    const source = documentKey(page.url);
    const remembered = this.chats.get(this.last.get(source));
    if (remembered) return remembered;
    return this.list().find(chat => chat.source === source) || this.create(page);
  }

  list() {
    return [...this.chats.values()]
      .filter(chat => chat.messages?.some(message => message.role === "user"))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(chat) {
    this.chats.set(chat.id, chat);
    this.last.set(chat.source, chat.id);
    if (!chat.messages?.some(message => message.role === "user")) {
      // Unsent input/selection survives sidebar reload, but is not durable history.
      await this.sessionStorage?.set({ [DRAFT_PREFIX + chat.id]: chat });
      return;
    }
    const currentSource = documentKey(chat.pageUrl);
    this.last.set(currentSource, chat.id);
    await this.storage.set({ [CHAT_PREFIX + chat.id]: chat,
      [LAST_PREFIX + chat.source]: chat.id, [LAST_PREFIX + currentSource]: chat.id });
    await this.sessionStorage?.remove(DRAFT_PREFIX + chat.id);
  }

  async delete(id) {
    const chat = this.chats.get(id);
    if (!chat) return;
    await this.storage.remove(CHAT_PREFIX + id);
    await this.sessionStorage?.remove(DRAFT_PREFIX + id);
    this.chats.delete(id);
    for (const [source, rememberedId] of this.last) {
      if (rememberedId !== id) continue;
      const next = this.list().find(other => other.source === source || documentKey(other.pageUrl) === source);
      if (next) {
        this.last.set(source, next.id);
        await this.storage.set({ [LAST_PREFIX + source]: next.id });
      } else {
        this.last.delete(source);
        await this.storage.remove(LAST_PREFIX + source);
      }
    }
  }
}

import { env } from "./env.js";

export interface GuideSections {
  [section: string]: string[];
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface NotionApiResponse<T = unknown> {
  results?: T[];
  has_more?: boolean;
  next_cursor?: string;
  message?: string;
}

interface RichTextSegment {
  plain_text: string;
  href?: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
  };
}

const API_BASE = "https://api.notion.com";
const API_VERSION = "2022-06-28";
const PAGE_SIZE = 100;

async function notionFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": API_VERSION,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

async function getBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const results: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (cursor) params.set("start_cursor", cursor);

    const data = await notionFetch<NotionApiResponse<NotionBlock>>(
      `/v1/blocks/${blockId}/children?${params}`,
    );

    if (data.results) results.push(...data.results);
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

function extractText(block: NotionBlock): string {
  const content = block[block.type] as { rich_text?: RichTextSegment[] } | undefined;
  if (!content?.rich_text?.length) return "";

  const text = content.rich_text
    .map((seg) => {
      let t = seg.plain_text;

      if (seg.annotations) {
        if (seg.annotations.bold) t = `**${t}**`;
        if (seg.annotations.italic) t = `*${t}*`;
        if (seg.annotations.code) t = `\`${t}\``;
        if (seg.annotations.strikethrough) t = `~~${t}~~`;
      }

      if (seg.href) {
        const url = seg.href.startsWith("/") ? `https://notion.so${seg.href}` : seg.href;
        return seg.plain_text.trim() === url ? url : `[${t.trim()}](${url})`;
      }

      return t;
    })
    .join("");

  if (!text.trim()) return "";

  switch (block.type) {
    case "bulleted_list_item":
      return `• ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do": {
      const td = block.to_do as { checked?: boolean } | undefined;
      return `${td?.checked ? "☑" : "☐"} ${text}`;
    }
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return `**${text}**`;
    case "quote":
    case "callout":
      return `> ${text}`;
    default:
      return text;
  }
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/(\*\*|__)/g, "")
    .replace(/(\*|_)/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

async function traverseBlocks(
  blockId: string,
  sections: GuideSections,
  currentSection: { name: string },
): Promise<void> {
  const children = await getBlockChildren(blockId);

  for (const block of children) {
    const text = extractText(block);

    if (block.type === "heading_1" && text) {
      currentSection.name = cleanMarkdown(text);
      sections[currentSection.name] = [];
    } else if (currentSection.name && text) {
      sections[currentSection.name]?.push(text);
    }

    if (block.has_children) {
      await traverseBlocks(block.id, sections, currentSection);
    }
  }
}

export async function getFullGuide(): Promise<GuideSections> {
  const sections: GuideSections = {};
  const currentSection = { name: "General Info" };
  sections[currentSection.name] = [];

  await traverseBlocks(env.NOTION_GUIDE_PAGE_ID, sections, currentSection);

  // Drop empty sections
  for (const key of Object.keys(sections)) {
    if (sections[key].length === 0) delete sections[key];
  }

  return sections;
}
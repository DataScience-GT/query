import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import Fuse from "fuse.js";
import { getFullGuide } from "../notion.js";

const CACHE_TTL = 1000 * 60 * 15;

interface SearchableSection {
  title: string;
  content: string;
}

interface SearchResult {
  item: SearchableSection;
  score: number;
}

class SynonymExpander {
  private static readonly SYNONYMS: Record<string, string[]> = {
    "food": ["meal", "meals", "eat", "eating", "lunch", "dinner", "breakfast", "snack", "snacks", "restaurant", "restaurants", "hungry"],
    "hungry": ["food", "meal", "meals", "eat", "snack"],
    "sleep": ["sleeping", "nap", "napping", "rest", "resting", "tired", "bag", "bags"],
    "tired": ["sleep", "sleeping", "rest", "nap"],
    "shower": ["showers", "bathroom", "restroom", "wash", "hygiene", "towel"],
    "bathroom": ["shower", "showers", "restroom"],
    "wifi": ["internet", "connection", "network", "online"],
    "internet": ["wifi", "connection", "network"],
    "swag": ["sticker", "stickers", "shirt", "shirts", "hoodie", "hoodies", "merch", "merchandise", "points"],
    "prize": ["prizes", "award", "awards", "win", "winning", "reward"],
    "shirt": ["shirts", "tshirt", "tshirts", "clothing", "clothes", "swag"],
    "hoodie": ["hoodies", "sweatshirt", "clothing", "swag"],
    "schedule": ["time", "times", "when", "timing", "agenda", "calendar", "event", "events"],
    "time": ["schedule", "when", "timing"],
    "when": ["time", "schedule", "timing"],
    "submit": ["submission", "submissions", "devpost", "project", "upload", "turn in", "deadline"],
    "deadline": ["submit", "submission", "due", "time"],
    "parking": ["park", "car", "vehicle", "lot", "deck", "garage"],
    "arrive": ["arriving", "arrival", "get there", "location", "directions"],
    "checkin": ["check in", "check-in", "registration", "register", "badge"],
    "badge": ["lanyard", "id", "checkin", "check in"],
    "travel": ["flying", "flight", "airport", "uber", "lyft", "marta", "reimbursement"],
    "reimbursement": ["refund", "money", "reimburse", "travel"],
    "team": ["teams", "teammate", "teammates", "partner", "partners", "group"],
    "partner": ["team", "teammate", "group"],
    "workshop": ["workshops", "event", "events", "session", "sessions"],
    "activity": ["activities", "event", "events"],
    "track": ["tracks", "category", "categories", "theme"],
    "challenge": ["challenges", "problem", "problems"],
    "judge": ["judging", "judges", "evaluation", "scoring"],
    "bring": ["pack", "packing", "need", "needed", "essentials", "items"]
  };

  private static readonly STOP_WORDS = ["a", "an", "the", "do", "does", "is", "are", "can", "could", "would", "should"];

  static expandQuery(query: string): string {
    const words = this.tokenize(query);
    const allTerms = new Set<string>();
    for (const word of words) this.addWordAndSynonyms(word, allTerms);
    return Array.from(allTerms).map(term => `'${term}`).join(" | ");
  }

  private static tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[?.!,]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 1 && !this.STOP_WORDS.includes(word));
  }

  private static addWordAndSynonyms(word: string, termSet: Set<string>): void {
    termSet.add(word);
    if (this.SYNONYMS[word]) this.SYNONYMS[word].forEach(s => termSet.add(s));
    const singular = word.endsWith('s') ? word.slice(0, -1) : null;
    if (singular && this.SYNONYMS[singular]) {
      termSet.add(singular);
      this.SYNONYMS[singular].forEach(s => termSet.add(s));
    }
    for (const [key, synonymList] of Object.entries(this.SYNONYMS)) {
      if (synonymList.includes(word)) {
        termSet.add(key);
        synonymList.forEach(s => termSet.add(s));
      }
    }
  }
}

class GuideSearchEngine {
  private fuse: Fuse<SearchableSection> | null = null;
  private lastUpdated = 0;

  async search(query: string): Promise<SearchResult[]> {
    await this.ensureIndexReady();
    if (!this.fuse) throw new Error("Search index unavailable");
    const expandedQuery = SynonymExpander.expandQuery(query);
    const results = this.fuse.search(expandedQuery);
    return results.map(r => ({ item: r.item, score: r.score ?? 1 }));
  }

  private async ensureIndexReady(): Promise<void> {
    if (this.fuse && (Date.now() - this.lastUpdated <= CACHE_TTL)) return;
    await this.rebuildIndex();
  }

  private async rebuildIndex(): Promise<void> {
    const rawSections = await getFullGuide();
    const searchData: SearchableSection[] = Object.entries(rawSections).map(([title, lines]) => ({
      title,
      content: lines.join("\n")
    }));
    this.fuse = new Fuse(searchData, {
      keys: [
        { name: "title", weight: 3 },
        { name: "content", weight: 1 }
      ],
      useExtendedSearch: true,
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
      distance: 200,
      findAllMatches: true
    });
    this.lastUpdated = Date.now();
  }
}

class SearchResultFormatter {
  private static readonly EMBED_COLOR = 0xCBA135;

  static formatEmbed(result: SearchResult): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(result.item.title)
      .setDescription(result.item.content || "No content available.")
      .setColor(this.EMBED_COLOR)
      .setFooter({ text: `Match confidence: ${((1 - result.score) * 100).toFixed(0)}%` });
  }

  static getWarningMessage(score: number): string | null {
    return score > 0.5 ? "This might not be exactly what you're looking for, but it's the closest match I found:\n\n" : null;
  }

  static getNoResultsMessage(): string {
    return `I couldn't find anything matching your question.\n\nTips:\n• Try simpler keywords (e.g., "food", "parking", "schedule")\n• Browse all sections with /guide\n• Ask an organizer in #help`;
  }
}

const searchEngine = new GuideSearchEngine();

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask a question about Hacklytics 2026.")
  .addStringOption(option =>
    option.setName("query").setDescription("What's your question?").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const rawQuery = interaction.options.getString("query");
  if (!rawQuery?.trim()) return interaction.editReply("Please provide a question.");

  try {
    const results = await searchEngine.search(rawQuery);
    if (results.length === 0) return interaction.editReply({ content: SearchResultFormatter.getNoResultsMessage() });

    const topResult = results[0];
    const embed = SearchResultFormatter.formatEmbed(topResult);
    const warningMessage = SearchResultFormatter.getWarningMessage(topResult.score);

    await interaction.editReply({
      content: warningMessage || undefined,
      embeds: [embed]
    });
  } catch (error) {
    console.error("Search error:", error);
    await interaction.editReply("Search system temporarily offline. Please try again or use /guide to browse sections.");
  }
}

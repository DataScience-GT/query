# Graph Report - query  (2026-06-13)

## Corpus Check
- 270 files · ~3,724,867 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1510 nodes · 2016 edges · 134 communities (103 shown, 31 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e412bdb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 126|Community 126]]

## God Nodes (most connected - your core abstractions)
1. `LiquidGlass()` - 42 edges
2. `trpc` - 40 edges
3. `compilerOptions` - 19 edges
4. `MockInteraction` - 17 edges
5. `compilerOptions` - 16 edges
6. `compilerOptions` - 16 edges
7. `compilerOptions` - 16 edges
8. `LoadingScreen()` - 15 edges
9. `users` - 14 edges
10. `CacheService` - 13 edges

## Surprising Connections (you probably didn't know these)
- `handler()` --calls--> `createContext()`  [EXTRACTED]
  sites/mainweb/app/(portal)/api/trpc/[trpc]/route.ts → packages/api/src/context.ts
- `POST()` --calls--> `rateLimit()`  [EXTRACTED]
  sites/mainweb/app/(portal)/api/auth/verify-email/route.ts → packages/api/src/middleware/security.ts
- `Guide` --references--> `GuideSections`  [EXTRACTED]
  sites/discordBot/src/commands/guide.ts → sites/discordBot/src/notion.ts

## Import Cycles
- None detected.

## Communities (134 total, 31 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (17): Pie, PieTooltipItem, curriculum, Card(), CardProps, ClassData, MajorData, FooterProps (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (40): dependencies, chart.js, drizzle-orm, geist, lucide-react, @mawtech/glass-ui, minimatch, next (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (23): admins, adminsRelations, accounts, sessions, users, verificationTokens, eventCheckIns, eventCheckInsRelations (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (38): dependencies, drizzle-orm, image-size, minimatch, @query/auth, @query/db, sanitize-html, stripe (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (37): dependencies, @eslint/compat, eslint-config-prettier, @eslint/js, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (37): dependencies, babel-plugin-react-compiler, class-variance-authority, clsx, firebase, next, @radix-ui/react-slot, react (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (38): dependsOn, outputs, cache, cache, dependsOn, persistent, outputLogs, outputs (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (21): data, execute(), GuideSearchEngine, SearchableSection, searchEngine, SearchResult, SearchResultFormatter, SynonymExpander (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (36): default, dependencies, minimatch, react-dom, devDependencies, eslint, @next/eslint-plugin-next, @query/eslint-config (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (29): DIETARY_OPTIONS, GENDERS, LevelOfStudy, LEVELS_OF_STUDY, MAJORS, REGISTRATION_STEPS, SCHOOLS, SHIRT_SIZES (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (8): Background(), BackgroundProps, SidebarProps, LinkStripeAccountProps, LiquidGlass(), LiquidGlassProps, MemberData, MemberStatus

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (28): dependencies, @auth/drizzle-adapter, drizzle-orm, minimatch, next-auth, nodemailer, @query/db, devDependencies (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (19): Assertion, DDOS_CONFIG, ddosProtection(), flushLogs(), flushQueue, hasInjectionPattern(), IPRecord, ipTrackingStore (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (24): mockDelete, mockFindFirst, mockFindMany, mockInsert, mockUpdate, cache, RATE_LIMITS, Context (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (23): JudgeMatrixView(), JudgeMatrixViewProps, Project, Ranking, RankingsData, Vote, Hackathon, JudgingTools() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (9): StatCardProps, HackathonStatus, STATUSES, toInputDate(), CreateHackathonForm(), EditHackathonForm(), HackathonCard(), trpc (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (27): dependencies, drizzle-orm, minimatch, next-auth, pg, postgres, @t3-oss/env-nextjs, zod (+19 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (16): Event, Tab, ScannerTab(), EventFormData, EventFormModal(), EventFormModalProps, maxWidthClasses, ModalWrapper() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (7): formatDate(), formatDateRange(), HackathonStatus, Tab, HackathonData, LoadingScreen(), LoadingScreenProps

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (10): AnalyticsTab(), AttendeesTab(), RegistrationStatus, emptyForm, EVENT_TYPES, EventFormData, EventsTab(), EventType (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (6): __dirname, edgeCases, __filename, MockInteraction, runSuite(), runTest()

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (21): author, dependencies, discord.js, dotenv, fuse.js, zod, description, devDependencies (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (22): devDependencies, autoprefixer, cross-env, eslint, @next/bundle-analyzer, @next/eslint-plugin-next, postcss, @query/eslint-config (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, checkJs, disableSourceOfProjectReferenceRedirect, esModuleInterop, incremental, isolatedModules, lib (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (13): isAdmin, isSuperAdmin, auditRouter, eventRouter, helloRouter, greet, greetPublic, sayHello (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (16): adminRouter, hackathonRouter, teamRouter, hackathonEventAttendees, hackathonEventAttendeesRelations, hackathonEvents, hackathonEventsRelations, hackathonParticipants (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 28 - "Community 28"
Cohesion: 0.10
Nodes (19): dependencies, @ianvs/prettier-plugin-sort-imports, minimatch, prettier, prettier-plugin-tailwindcss, devDependencies, @query/tsconfig, typescript (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (18): compilerOptions, allowSyntheticDefaultImports, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noImplicitAny (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (14): buildCoverageQueues(), shuffleArray(), hackathonMaps, hackathonMapsRelations, judgeAssignments, judgeAssignmentsRelations, judgeQueue, judgeQueueRelations (+6 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (6): ClearCommandExecutor, ClearCommandValidator, ClearResult, data, MessageCleaner, PermissionValidator

### Community 32 - "Community 32"
Cohesion: 0.20
Nodes (13): ProjectsTab(), ScheduleTab(), TeamsTab(), formatDate(), formatDateRange(), HackathonDetailPage(), statusConfig(), TabType (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (17): dependencies, minimatch, next, postcss, react, react-dom, tailwindcss, @tailwindcss/postcss (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (11): CreateHackathonStep(), CreateHackathonStepProps, Hackathon, ImportJudgesStep(), ImportProjectsStep(), ParsedJudge, ParsedProject, ParsedJudge (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (16): outputs, dependsOn, outputs, cache, persistent, cache, persistent, with (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, paths (+6 more)

### Community 37 - "Community 37"
Cohesion: 0.16
Nodes (7): COLORS, DRIFT_CLASSES, FlowerInstance, FlowerRenderer, FlowerVine(), generateFlowers(), seededRandom()

### Community 38 - "Community 38"
Cohesion: 0.19
Nodes (10): CacheEntry, CacheKeys, CacheStats, invalidateEvents(), invalidateHackathons(), invalidateUser(), isJudge, userRouter (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.27
Nodes (3): config, restrictEnvAccess, config

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (7): adapter, { handlers, auth, signIn, signOut }, authConfig, sendAcceptanceEmail(), getCurrentUserId(), getSession(), requireAuth()

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (4): Bot, BotCommand, __dirname, __filename

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (12): compilerOptions, emitDeclarationOnly, jsx, lib, module, outDir, rootDir, skipLibCheck (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (6): robotoMono, spaceGrotesk, Footer(), navItems, ServiceWorkerRegistrar(), metadata

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (11): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+3 more)

### Community 46 - "Community 46"
Cohesion: 0.18
Nodes (10): cache, dependsOn, outputs, cache, persistent, extends, $schema, tasks (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.27
Nodes (10): applySecurityHeaders(), CacheHeaders, getCacheHeaders(), getClientIp(), getRateLimitHeaders(), getRequestFingerprint(), getSecurityHeaders(), RateLimitHeaders (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (7): memberRouter, nameSchema, phoneSchema, urlSchema, membershipHistory, DrizzleDB, globalForDb

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (9): dependencies, next, typescript, engines, node, name, packageManager, private (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, moduleResolution, skipLibCheck, strict, exclude, extends (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, moduleResolution, paths, exclude, extends, include, @/*

### Community 55 - "Community 55"
Cohesion: 0.22
Nodes (8): 1. Prerequisites, 2. Authentication, 3. Syncing Secrets, 4. Running the App, 5. Troubleshooting, GCP Backend Setup Guide, Missing Secrets, Permission Denied

### Community 56 - "Community 56"
Cohesion: 0.42
Nodes (8): config, getCacheControl(), getETag(), getLastModified(), handleETag(), handleLastModified(), proxy(), securityHeaders

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (8): turbo, devDependencies, turbo, vitest, globalEnv, globalPassThroughEnv, $schema, ui

### Community 58 - "Community 58"
Cohesion: 0.42
Nodes (8): config, getCacheControl(), getETag(), getLastModified(), handleETag(), handleLastModified(), proxy(), securityHeaders

### Community 59 - "Community 59"
Cohesion: 0.28
Nodes (3): PortalSidebarProps, PortalWrapper(), Providers()

### Community 60 - "Community 60"
Cohesion: 0.28
Nodes (4): Member, ProfileFormProps, SkillsInterestsInput(), SkillsInterestsInputProps

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, declarationMap, emitDeclarationOnly, noEmit, outDir, extends, $schema

### Community 62 - "Community 62"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 63 - "Community 63"
Cohesion: 0.25
Nodes (7): dependencies, minimatch, exports, files, name, private, version

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, exclude, extends, include

### Community 65 - "Community 65"
Cohesion: 0.43
Nodes (3): data, EventScheduler, execute()

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): exports, main, name, private, types, version

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (7): scripts, build, dev, format, lint, test, typecheck

### Community 69 - "Community 69"
Cohesion: 0.38
Nodes (4): categories, DaySchedule, scheduleData, ScheduleEvent

### Community 70 - "Community 70"
Cohesion: 0.33
Nodes (3): BLOCKED_ROLES, data, roleEmojis

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (5): outputs, extends, $schema, tasks, build

### Community 73 - "Community 73"
Cohesion: 0.40
Nodes (4): cn(), Button, ButtonProps, buttonVariants

### Community 74 - "Community 74"
Cohesion: 0.33
Nodes (6): esbuild, @eslint/plugin-kit, postcss, ws, pnpm, overrides

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (4): actionVariantClasses, StatusScreenProps, StatusVariant, variantConfig

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (4): bronzeSponsors, goldSponsors, miniSponsors, silverSponsors

### Community 80 - "Community 80"
Cohesion: 0.40
Nodes (3): fs, packagesToRestore, path

### Community 81 - "Community 81"
Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, $schema

### Community 84 - "Community 84"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 86 - "Community 86"
Cohesion: 0.50
Nodes (3): __dirname, __filename, nextConfig

### Community 87 - "Community 87"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **743 isolated node(s):** `name`, `private`, `version`, `packageManager`, `node` (+738 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppRouter` connect `Community 13` to `Community 25`, `Community 15`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `CacheService` connect `Community 45` to `Community 38`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _743 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.061979648473635525 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09871794871794871 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
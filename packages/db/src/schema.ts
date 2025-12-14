import { pgTable, serial, text, timestamp, uuid, integer, varchar } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
});

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name'),
	email: text('email').notNull().unique(),
	email_verified: timestamp('email_verified'),
	image: text('image'),
	role_id: integer('role_id'),
	created_at: timestamp('created_at').defaultNow(),
});

export const accounts = pgTable('accounts', {
	id: serial('id').primaryKey(),
	user_id: uuid('user_id').references(() => users.id),
	provider: text('provider').notNull(),
	provider_account_id: text('provider_account_id').notNull(),
	refresh_token: text('refresh_token'),
	access_token: text('access_token'),
	token_type: text('token_type'),
	scope: text('scope'),
	id_token: text('id_token'),
	session_state: text('session_state'),
});

export const sessions = pgTable('sessions', {
	id: uuid('id').defaultRandom().primaryKey(),
	session_token: text('session_token').notNull().unique(),
	user_id: uuid('user_id').references(() => users.id),
	expires: timestamp('expires'),
});

export const verification_tokens = pgTable('verification_tokens', {
	identifier: text('identifier').notNull(),
	token: text('token').notNull().primaryKey(),
	expires: timestamp('expires').notNull(),
});

export default { roles, users, accounts, sessions, verification_tokens };

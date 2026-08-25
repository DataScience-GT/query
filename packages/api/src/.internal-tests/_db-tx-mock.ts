import { vi } from "vitest";

/**
 * Transaction semantics for the file-level `@query/db` mocks.
 *
 * Not a test file — no `.test.` in the name, so vitest does not collect it.
 *
 * A plain `transaction: (cb) => cb(db)` runs two racing callers with no
 * ordering and no rollback, which is an interleaving no database produces: both
 * write before either reads back. Correct claim-then-verify and
 * compare-and-set code then looks broken here, and the tempting "fix" is an
 * in-process JS lock — which does nothing across the instances apphosting
 * actually runs. This module models the two things that make those patterns
 * work, so a test that passes here is testing the guarantee production relies
 * on.
 *
 * Lives in one place because both halves are subtle and were about to be
 * copied into a second test file.
 */

/**
 * Rollback, modelled the only way a mock can: a stand-in write says how to undo
 * itself, and a transaction that throws replays those undos in reverse.
 */
let undoStack: Array<() => void> | null = null;

/** Registers an undo for the write currently executing. No-op outside a tx. */
export const __onRollback = (undo: () => void) => undoStack?.push(undo);

/**
 * Row locking, modelled per table.
 *
 * An UPDATE — or a SELECT ... FOR UPDATE — inside a transaction takes the row's
 * exclusive lock and holds it until that transaction ends; a second transaction
 * touching the same row blocks there and only then re-reads. Keyed by table
 * rather than by row, so this over-serializes unrelated rows; that direction is
 * safe (it can only make a test stricter than production), while the reverse
 * would let real races pass.
 *
 * Module-scoped so locks outlive a single transaction, which is the point.
 */
const tableLocks = new Map<unknown, Promise<void>>();

type Mock = (...args: any[]) => any;

export interface TxMockHooks {
  /**
   * The db stand-in whose non-transactional builders the tx inherits.
   * A getter, not the object: the mock factory is hoisted above the import it
   * would read, so this can only be resolved once a transaction actually runs.
   */
  base: () => unknown;
  insert?: Mock;
  update?: Mock;
  delete?: Mock;
  /**
   * Backs `tx.select(...).from(...).where(...)`. Only wired when supplied, so
   * files that do not exercise a locking read keep their existing select stub.
   */
  select?: Mock;
}

export const createTransactionMock = ({
  base,
  insert,
  update,
  delete: del,
  select,
}: TxMockHooks) =>
  vi.fn().mockImplementation(async (callback: (tx: any) => unknown) => {
    const heldTables = new Set<unknown>();
    const held: Array<() => void> = [];
    const undos: Array<() => void> = [];

    const acquire = (table: unknown) => {
      // A transaction already holding a lock keeps it: touching the same table
      // twice must not queue behind itself.
      if (heldTables.has(table)) return Promise.resolve();
      heldTables.add(table);
      const prior = tableLocks.get(table) ?? Promise.resolve();
      let release!: () => void;
      tableLocks.set(
        table,
        new Promise<void>((resolve) => (release = resolve)),
      );
      held.push(release);
      return prior;
    };

    // Scoped tightly around each synchronous stand-in so interleaved
    // transactions cannot collect each other's undos.
    const withUndos = <T>(run: () => T): T => {
      const outer = undoStack;
      undoStack = undos;
      try {
        return run();
      } finally {
        undoStack = outer;
      }
    };

    // The db stand-in is typed nullable at the import site; spreading null is
    // an empty object, which is the right answer for a mock that never ran.
    const tx: any = { ...(base() as object) };

    if (update) {
      tx.update = (...updateArgs: any[]) => ({
        set: (...setArgs: any[]) => ({
          where: (...wArgs: any[]) => {
            const ran = acquire(updateArgs[0]).then(() =>
              withUndos(() => update("update", updateArgs, setArgs, wArgs)),
            );
            return Object.assign(ran, { returning: () => ran });
          },
        }),
      });
    }

    if (insert) {
      // No lock: concurrent INSERTs do not block each other in Postgres, they
      // collide on a unique index if at all. The undo is what matters — a row
      // inserted by a transaction that later throws never existed.
      tx.insert = (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = withUndos(() => insert("insert", insertArgs, valArgs));
          const ran = Promise.resolve(val);
          return Object.assign(ran, {
            returning: () => ran,
            onConflictDoUpdate: () => ({ returning: () => ran }),
          });
        },
      });
    }

    if (del) {
      tx.delete = (...deleteArgs: any[]) => ({
        where: (...wArgs: any[]) => {
          const ran = acquire(deleteArgs[0]).then(() =>
            withUndos(() => del("delete", deleteArgs, wArgs)),
          );
          return Object.assign(ran, { returning: () => ran });
        },
      });
    }


    if (select) {
      tx.select = (...selectArgs: any[]) => ({
        from: (...fromArgs: any[]) => ({
          // Lazy: `.for("update")` must be the thing that takes the lock, and
          // eagerly building the unlocked promise would run the query twice.
          where: (...wArgs: any[]) => {
            const exec = (locking: boolean) =>
              (locking ? acquire(fromArgs[0]) : Promise.resolve()).then(() =>
                select("select", selectArgs, fromArgs, wArgs),
              );
            return {
              then: (ok: any, err: any) => exec(false).then(ok, err),
              for: () => exec(true),
            };
          },
        }),
      });
    }

    try {
      return await callback(tx);
    } catch (error) {
      for (const undo of undos.reverse()) undo();
      throw error;
    } finally {
      for (const release of held) release();
    }
  });

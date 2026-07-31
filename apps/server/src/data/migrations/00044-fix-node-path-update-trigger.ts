import { Migration, sql } from 'kysely';

/**
 * Fixes two defects in the node_paths maintenance introduced by migration 00010.
 *
 * 1. `trg_update_node_path` was created without FOR EACH ROW, so it was a STATEMENT-level
 *    trigger where OLD and NEW do not exist. Moving a node therefore never updated node_paths
 *    at all: the node kept the ancestor rows of its old location, with their old levels.
 *
 * 2. `fn_update_node_path` only rebuilt the paths of the moved node itself. Every descendant
 *    of a moved subtree kept pointing at the old ancestors, so an entire subtree could be
 *    orphaned from its new parent while still looking attached in `nodes.parent_id`.
 *
 * The rewritten function moves the whole subtree: it drops every link coming from outside the
 * subtree, then re-links every new ancestor to every node of the subtree with the summed depth.
 * The `up` also repairs any rows the old trigger left behind.
 */
export const fixNodePathUpdateTrigger: Migration = {
  up: async (db) => {
    await sql`
      CREATE OR REPLACE FUNCTION fn_update_node_path() RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
          -- Drop every link coming from OUTSIDE the moved subtree, for the whole subtree.
          DELETE FROM node_paths
          WHERE descendant_id IN (SELECT descendant_id FROM node_paths WHERE ancestor_id = NEW.id)
            AND ancestor_id NOT IN (SELECT descendant_id FROM node_paths WHERE ancestor_id = NEW.id);

          -- Re-link every new ancestor to every node of the subtree, with summed depth.
          INSERT INTO node_paths (ancestor_id, descendant_id, workspace_id, level)
          SELECT sup.ancestor_id, sub.descendant_id, NEW.workspace_id, sup.level + sub.level + 1
          FROM node_paths sup
          CROSS JOIN node_paths sub
          WHERE sup.descendant_id = NEW.parent_id
            AND sub.ancestor_id = NEW.id
          ON CONFLICT (ancestor_id, descendant_id) DO UPDATE SET level = EXCLUDED.level;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_update_node_path ON nodes;

      CREATE TRIGGER trg_update_node_path
      AFTER UPDATE ON nodes
      FOR EACH ROW
      EXECUTE FUNCTION fn_update_node_path();
    `.execute(db);

    // Repair whatever the broken trigger left behind.
    await sql`
      CREATE TEMP TABLE correct_node_paths ON COMMIT DROP AS
      WITH RECURSIVE correct AS (
        SELECT id AS ancestor_id, id AS descendant_id, workspace_id, 0 AS level FROM nodes
        UNION ALL
        SELECT c.ancestor_id, n.id, n.workspace_id, c.level + 1
        FROM correct c JOIN nodes n ON n.parent_id = c.descendant_id
      )
      SELECT * FROM correct;

      DELETE FROM node_paths p
      WHERE NOT EXISTS (SELECT 1 FROM correct_node_paths c
                        WHERE c.ancestor_id = p.ancestor_id AND c.descendant_id = p.descendant_id);

      UPDATE node_paths p SET level = c.level, workspace_id = c.workspace_id
      FROM correct_node_paths c
      WHERE p.ancestor_id = c.ancestor_id AND p.descendant_id = c.descendant_id
        AND (p.level <> c.level OR p.workspace_id <> c.workspace_id);

      INSERT INTO node_paths (ancestor_id, descendant_id, workspace_id, level)
      SELECT c.ancestor_id, c.descendant_id, c.workspace_id, c.level
      FROM correct_node_paths c
      WHERE NOT EXISTS (SELECT 1 FROM node_paths p
                        WHERE p.ancestor_id = c.ancestor_id AND p.descendant_id = c.descendant_id);
    `.execute(db);
  },
  down: async (db) => {
    await sql`
      CREATE OR REPLACE FUNCTION fn_update_node_path() RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
          DELETE FROM node_paths
          WHERE descendant_id = NEW.id AND ancestor_id <> NEW.id;

          INSERT INTO node_paths (ancestor_id, descendant_id, workspace_id, level)
          SELECT ancestor_id, NEW.id, NEW.workspace_id, level + 1
          FROM node_paths
          WHERE descendant_id = NEW.parent_id AND ancestor_id <> NEW.id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_update_node_path ON nodes;

      CREATE TRIGGER trg_update_node_path
      AFTER UPDATE ON nodes
      EXECUTE FUNCTION fn_update_node_path();
    `.execute(db);
  },
};

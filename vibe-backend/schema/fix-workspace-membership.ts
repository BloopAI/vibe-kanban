/**
 * Fix script: Add user to iKanban workspace
 *
 * This script finds the iKanban workspace and adds the specified user as an owner.
 * Run with: npx tsx fix-workspace-membership.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { pgTable, text, uuid, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

// Load environment variables from vibe-backend directory
dotenv.config({ path: '/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-backend/.env' });

// Define tables inline to avoid import issues
const tenantWorkspaces = pgTable("tenant_workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    icon: text("icon"),
    color: text("color"),
    settings: jsonb("settings").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const tenantWorkspaceMembers = pgTable("tenant_workspace_members", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantWorkspaceId: uuid("tenant_workspace_id").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTenantWorkspaceMembersWorkspaceId: index("idx_tenant_workspace_members_workspace_id").on(table.tenantWorkspaceId),
    idxTenantWorkspaceMembersUserId: index("idx_tenant_workspace_members_user_id").on(table.userId),
    uniqTenantWorkspaceMemberUser: uniqueIndex("uniq_tenant_workspace_member_user").on(table.tenantWorkspaceId, table.userId),
}));

// User details to fix
const USER_EMAIL = 'rupeshpanwar43@gmail.com';

async function main() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('ERROR: DATABASE_URL not set in .env');
        process.exit(1);
    }

    console.log('Connecting to database...');

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    const db = drizzle(pool);

    try {
        // Step 1: Find all tenant workspaces
        console.log('\n=== All Tenant Workspaces ===');
        const allWorkspaces = await db.select().from(tenantWorkspaces);

        if (allWorkspaces.length === 0) {
            console.log('No workspaces found in database!');
        } else {
            for (const ws of allWorkspaces) {
                console.log(`  - ${ws.name} (slug: ${ws.slug}, id: ${ws.id})`);
            }
        }

        // Step 2: Find iKanban workspace specifically
        console.log('\n=== Looking for iKanban workspace ===');
        const ikanbanWorkspace = await db.select()
            .from(tenantWorkspaces)
            .where(eq(tenantWorkspaces.slug, 'ikanban'));

        if (ikanbanWorkspace.length === 0) {
            console.log('iKanban workspace NOT FOUND! Looking for similar...');

            // Try to find any workspace with "ikanban" in the name
            const allWs = await db.select().from(tenantWorkspaces);
            const similar = allWs.filter(w =>
                w.name.toLowerCase().includes('ikanban') ||
                w.slug.toLowerCase().includes('ikanban')
            );

            if (similar.length > 0) {
                console.log('Found similar workspaces:');
                for (const ws of similar) {
                    console.log(`  - ${ws.name} (slug: ${ws.slug})`);
                }
            }
        } else {
            console.log(`Found iKanban workspace: ${ikanbanWorkspace[0].id}`);
        }

        // Step 3: Find all memberships for the user email
        console.log(`\n=== Memberships for ${USER_EMAIL} ===`);
        const userMemberships = await db.select({
            membership: tenantWorkspaceMembers,
            workspace: tenantWorkspaces,
        })
        .from(tenantWorkspaceMembers)
        .leftJoin(tenantWorkspaces, eq(tenantWorkspaceMembers.tenantWorkspaceId, tenantWorkspaces.id))
        .where(eq(tenantWorkspaceMembers.email, USER_EMAIL));

        if (userMemberships.length === 0) {
            console.log('No memberships found for this email!');
        } else {
            for (const m of userMemberships) {
                console.log(`  - Workspace: ${m.workspace?.name || 'Unknown'} (${m.workspace?.slug})`);
                console.log(`    Role: ${m.membership.role}`);
                console.log(`    User ID: ${m.membership.userId}`);
            }
        }

        // Step 4: Find any user IDs associated with this email
        console.log(`\n=== All user_ids for ${USER_EMAIL} ===`);
        const allUserIds = await db.selectDistinct({ userId: tenantWorkspaceMembers.userId })
            .from(tenantWorkspaceMembers)
            .where(eq(tenantWorkspaceMembers.email, USER_EMAIL));

        for (const u of allUserIds) {
            console.log(`  - ${u.userId}`);
        }

        // Step 5: If iKanban exists and user is not a member, add them
        if (ikanbanWorkspace.length > 0) {
            const workspaceId = ikanbanWorkspace[0].id;

            // Check if user already has membership (by email)
            const existingByEmail = await db.select()
                .from(tenantWorkspaceMembers)
                .where(and(
                    eq(tenantWorkspaceMembers.tenantWorkspaceId, workspaceId),
                    eq(tenantWorkspaceMembers.email, USER_EMAIL)
                ));

            if (existingByEmail.length > 0) {
                console.log(`\n=== User already member of iKanban workspace ===`);
                console.log(`  User ID in membership: ${existingByEmail[0].userId}`);
                console.log(`  Role: ${existingByEmail[0].role}`);

                // Get the user's current Clerk ID from their most recent membership
                const recentMembership = userMemberships[0];
                if (recentMembership && recentMembership.membership.userId !== existingByEmail[0].userId) {
                    console.log(`\n!!! User ID MISMATCH detected !!!`);
                    console.log(`  iKanban membership has: ${existingByEmail[0].userId}`);
                    console.log(`  Current membership has: ${recentMembership.membership.userId}`);
                    console.log(`\nUpdating iKanban membership with correct user_id...`);

                    await db.update(tenantWorkspaceMembers)
                        .set({ userId: recentMembership.membership.userId })
                        .where(eq(tenantWorkspaceMembers.id, existingByEmail[0].id));

                    console.log('Updated successfully!');
                }
            } else {
                console.log('\n=== Adding user to iKanban workspace ===');

                // Get user ID from their existing membership if available
                let userId = 'unknown';
                if (allUserIds.length > 0) {
                    userId = allUserIds[0].userId;
                }

                await db.insert(tenantWorkspaceMembers).values({
                    tenantWorkspaceId: workspaceId,
                    userId: userId,
                    email: USER_EMAIL,
                    role: 'owner',
                });

                console.log(`Added ${USER_EMAIL} as owner to iKanban workspace`);
            }
        }

        // Final verification
        console.log('\n=== Final Verification ===');
        const finalMemberships = await db.select({
            membership: tenantWorkspaceMembers,
            workspace: tenantWorkspaces,
        })
        .from(tenantWorkspaceMembers)
        .leftJoin(tenantWorkspaces, eq(tenantWorkspaceMembers.tenantWorkspaceId, tenantWorkspaces.id))
        .where(eq(tenantWorkspaceMembers.email, USER_EMAIL));

        console.log(`User ${USER_EMAIL} is now member of:`);
        for (const m of finalMemberships) {
            console.log(`  - ${m.workspace?.name} (${m.workspace?.slug}) as ${m.membership.role}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
        console.log('\nDone.');
    }
}

main();

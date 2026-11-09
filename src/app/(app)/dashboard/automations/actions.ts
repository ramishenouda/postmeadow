"use server";

import { and, asc, count, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { automations, automationSteps, posts } from "@/db/schema";
import { isTrigger, MAX_AUTOMATIONS, MAX_STEPS, type Trigger } from "@/lib/automations";
import { requirePublication } from "@/lib/dal";
import { findOrCreateTags, TagError } from "@/lib/tags";
import { randomToken } from "@/lib/tokens";

export type AutomationResult = { ok: true; message: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_DELAY_HOURS = 24 * 365;

async function ownedAutomation(id: string) {
  const { publication } = await requirePublication("editor");
  if (!UUID.test(id)) return null;
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.publicationId, publication.id)));
  return automation ? { publication, automation } : null;
}

const autoSlug = () =>
  `auto-${randomToken()
    .slice(0, 10)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x")}`;

async function tagIdFor(publicationId: string, trigger: Trigger, tag: string) {
  if (trigger !== "tag_added") return null;
  const [found] = await findOrCreateTags(publicationId, [tag]);
  if (!found) throw new TagError("Pick the tag that starts this automation.");
  return found.id;
}

export async function createAutomation(
  name: string,
  trigger: string,
  tag: string,
): Promise<AutomationResult> {
  const { publication } = await requirePublication("editor");
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) return { ok: false, error: "Name the automation." };
  if (!isTrigger(trigger)) return { ok: false, error: "Pick what starts it." };
  const [{ n }] = await db
    .select({ n: count() })
    .from(automations)
    .where(eq(automations.publicationId, publication.id));
  if (n >= MAX_AUTOMATIONS) return { ok: false, error: `Up to ${MAX_AUTOMATIONS} automations.` };
  let triggerTagId: string | null;
  try {
    triggerTagId = await tagIdFor(publication.id, trigger, tag);
  } catch (error) {
    if (error instanceof TagError) return { ok: false, error: error.message };
    throw error;
  }
  const [automation] = await db
    .insert(automations)
    .values({ publicationId: publication.id, name: cleanName, trigger, triggerTagId })
    .returning({ id: automations.id });
  await insertStep(publication.id, automation.id, 0, 0, `Welcome to ${publication.name}`);
  redirect(`/dashboard/automations/${automation.id}`);
}

async function insertStep(
  publicationId: string,
  automationId: string,
  position: number,
  delayHours: number,
  title: string,
) {
  const [post] = await db
    .insert(posts)
    .values({
      publicationId,
      kind: "automation",
      title,
      slug: autoSlug(),
      content: "Write this email here.",
    })
    .returning({ id: posts.id });
  await db.insert(automationSteps).values({ automationId, position, delayHours, postId: post.id });
  return post.id;
}

export async function updateAutomation(
  id: string,
  input: { name: string; trigger: string; tag: string },
): Promise<AutomationResult> {
  const owned = await ownedAutomation(id);
  if (!owned) return { ok: false, error: "Automation not found." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name the automation." };
  if (!isTrigger(input.trigger)) return { ok: false, error: "Pick what starts it." };
  let triggerTagId: string | null;
  try {
    triggerTagId = await tagIdFor(owned.publication.id, input.trigger, input.tag);
  } catch (error) {
    if (error instanceof TagError) return { ok: false, error: error.message };
    throw error;
  }
  await db
    .update(automations)
    .set({ name, trigger: input.trigger, triggerTagId })
    .where(eq(automations.id, id));
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setAutomationActive(id: string, active: boolean): Promise<AutomationResult> {
  const owned = await ownedAutomation(id);
  if (!owned) return { ok: false, error: "Automation not found." };
  if (active) {
    if (owned.automation.trigger === "tag_added" && !owned.automation.triggerTagId) {
      return { ok: false, error: "Pick the tag that starts this automation first." };
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(automationSteps)
      .where(eq(automationSteps.automationId, id));
    if (n === 0) return { ok: false, error: "Add an email first." };
    if (!owned.publication.postalAddress?.trim()) {
      return { ok: false, error: "Add your postal address in Settings first." };
    }
  }
  await db.update(automations).set({ active }).where(eq(automations.id, id));
  refresh();
  return {
    ok: true,
    message: active
      ? "Automation on. It starts for people from now on (not for existing subscribers)."
      : "Automation paused. People in it wait where they are.",
  };
}

export async function deleteAutomation(id: string) {
  const owned = await ownedAutomation(id);
  if (owned) {
    const steps = await db
      .select({ postId: automationSteps.postId })
      .from(automationSteps)
      .where(eq(automationSteps.automationId, id));
    await db.delete(automations).where(eq(automations.id, id));
    if (steps.length) {
      await db.delete(posts).where(
        inArray(
          posts.id,
          steps.map((s) => s.postId),
        ),
      );
    }
  }
  redirect("/dashboard/automations");
}

async function steps(automationId: string) {
  return db
    .select()
    .from(automationSteps)
    .where(eq(automationSteps.automationId, automationId))
    .orderBy(asc(automationSteps.position));
}

/** Rewrites positions 0..n-1 in the given order. */
async function renumber(ids: string[]) {
  for (const [position, id] of ids.entries()) {
    await db.update(automationSteps).set({ position }).where(eq(automationSteps.id, id));
  }
}

export async function addStep(automationId: string): Promise<AutomationResult> {
  const owned = await ownedAutomation(automationId);
  if (!owned) return { ok: false, error: "Automation not found." };
  const list = await steps(automationId);
  if (list.length >= MAX_STEPS) return { ok: false, error: `Up to ${MAX_STEPS} emails.` };
  await insertStep(
    owned.publication.id,
    automationId,
    list.length,
    list.length ? 72 : 0,
    `Email ${list.length + 1}`,
  );
  refresh();
  return { ok: true, message: "Email added." };
}

async function ownedStep(stepId: string) {
  if (!UUID.test(stepId)) return null;
  const [step] = await db.select().from(automationSteps).where(eq(automationSteps.id, stepId));
  if (!step) return null;
  const owned = await ownedAutomation(step.automationId);
  return owned ? { ...owned, step } : null;
}

export async function setStepDelay(stepId: string, hours: number): Promise<AutomationResult> {
  const owned = await ownedStep(stepId);
  if (!owned) return { ok: false, error: "Not found." };
  const delay = Math.round(Number(hours));
  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_DELAY_HOURS) {
    return { ok: false, error: "Wait between 0 hours and a year." };
  }
  await db.update(automationSteps).set({ delayHours: delay }).where(eq(automationSteps.id, stepId));
  refresh();
  return { ok: true, message: "Saved." };
}

export async function moveStep(
  stepId: string,
  direction: "up" | "down",
): Promise<AutomationResult> {
  const owned = await ownedStep(stepId);
  if (!owned) return { ok: false, error: "Not found." };
  const ids = (await steps(owned.step.automationId)).map((s) => s.id);
  const i = ids.indexOf(stepId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: false, error: "Can't move it further." };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumber(ids);
  refresh();
  return { ok: true, message: "Moved." };
}

export async function deleteStep(stepId: string): Promise<AutomationResult> {
  const owned = await ownedStep(stepId);
  if (!owned) return { ok: false, error: "Not found." };
  // Deleting the email deletes the step (cascade).
  await db.delete(posts).where(eq(posts.id, owned.step.postId));
  await renumber((await steps(owned.step.automationId)).map((s) => s.id));
  refresh();
  return { ok: true, message: "Email removed." };
}

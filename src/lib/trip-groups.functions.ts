// Live group trips: everyone converging on one place sees each other on a
// single map with real (Google-Routes-derived) transit ETAs. Anon-friendly:
// group creation and joining work without an account.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateGroupCode, memberEtaMinutes } from "./trip-groups.server";

const Point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const CreateInput = z.object({
  destinationLabel: z.string().min(1).max(200),
  destination: Point,
  hostName: z.string().min(1).max(40),
  originLabel: z.string().max(200).optional(),
  origin: Point.optional(),
  /** Trip window in hours before the group auto-expires. */
  expiresInHours: z.number().min(1).max(24).default(6),
});

/** Create a new group + auto-join the host as the first member. Anonymous:
 *  no auth required. Returns the shareable code and the host's private
 *  member_token so the host can start pinging their position immediately. */
export const createTripGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expiresAt = new Date(Date.now() + data.expiresInHours * 3600 * 1000).toISOString();

    // Retry a handful of times on the (extremely unlikely) code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateGroupCode();
      const { data: group, error } = await supabaseAdmin
        .from("trip_groups")
        .insert({
          code,
          destination_label: data.destinationLabel,
          destination_lat: data.destination.lat,
          destination_lng: data.destination.lng,
          created_by_name: data.hostName,
          expires_at: expiresAt,
        })
        .select("id, code")
        .single();
      if (error) {
        // Unique-violation → try a new code
        if ((error as { code?: string }).code === "23505") continue;
        throw new Error(`group create failed: ${error.message}`);
      }

      const memberToken = crypto.randomUUID();
      // Pre-compute host ETA if we have their origin.
      let etaMinutes: number | null = null;
      if (data.origin) {
        etaMinutes = await memberEtaMinutes(data.origin, data.destination);
      }
      const { error: memErr } = await supabaseAdmin.from("trip_group_members").insert({
        group_id: group.id,
        member_token: memberToken,
        display_name: data.hostName.slice(0, 40),
        origin_label: data.originLabel ?? null,
        last_lat: data.origin?.lat ?? null,
        last_lng: data.origin?.lng ?? null,
        last_updated: data.origin ? new Date().toISOString() : null,
        eta_minutes: etaMinutes,
        status: "active",
        is_creator: true,
      });
      if (memErr) throw new Error(`group host join failed: ${memErr.message}`);

      return { code: group.code, memberToken };
    }
    throw new Error("group create failed: could not generate unique code");
  });

const PingInput = z.object({
  memberToken: z.string().uuid(),
  position: Point,
});

/** Update a member's live position AND compute their transit ETA to the
 *  group destination. Runs on every rider heartbeat (~25 s) so the map and
 *  arrival-together countdown stay real. Anonymous-safe: the member_token
 *  is the auth. */
export const pingGroupMember = createServerFn({ method: "POST" })
  .inputValidator((input) => PingInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Resolve the member + their group's destination in one query.
    const { data: member, error: mErr } = await supabaseAdmin
      .from("trip_group_members")
      .select("id, group_id, status, trip_groups!inner(destination_lat, destination_lng, expires_at)")
      .eq("member_token", data.memberToken)
      .maybeSingle();
    if (mErr) throw new Error(`member lookup failed: ${mErr.message}`);
    if (!member) throw new Error("member not found");
    const group = (member as unknown as {
      trip_groups: { destination_lat: number; destination_lng: number; expires_at: string };
    }).trip_groups;
    if (!group) throw new Error("group not found");
    if (new Date(group.expires_at).getTime() < Date.now()) {
      // Group ended — reject the ping so the client stops pinging.
      return { ok: false as const, reason: "expired" as const };
    }

    const eta = await memberEtaMinutes(
      { lat: data.position.lat, lng: data.position.lng },
      { lat: group.destination_lat, lng: group.destination_lng },
    );

    const { error: uErr } = await supabaseAdmin
      .from("trip_group_members")
      .update({
        last_lat: data.position.lat,
        last_lng: data.position.lng,
        last_updated: new Date().toISOString(),
        eta_minutes: eta,
        status: "active",
      })
      .eq("id", member.id);
    if (uErr) throw new Error(`member update failed: ${uErr.message}`);
    return { ok: true as const, etaMinutes: eta };
  });

const LeaveInput = z.object({ memberToken: z.string().uuid() });

export const leaveTripGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => LeaveInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("trip_group_members")
      .update({ status: "left", last_updated: new Date().toISOString() })
      .eq("member_token", data.memberToken);
    if (error) throw new Error(`leave failed: ${error.message}`);
    return { ok: true as const };
  });

const JoinInput = z.object({
  code: z.string().min(4).max(12),
  displayName: z.string().min(1).max(40),
  origin: Point.optional(),
});

export const joinTripGroup = createServerFn({ method: "POST" })
  .inputValidator((input) => JoinInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: group, error: gErr } = await supabaseAdmin
      .from("trip_groups")
      .select("id, destination_lat, destination_lng, expires_at")
      .eq("code", data.code.toUpperCase())
      .maybeSingle();
    if (gErr) throw new Error(`group lookup failed: ${gErr.message}`);
    if (!group) throw new Error("group not found");
    if (new Date(group.expires_at).getTime() < Date.now()) {
      throw new Error("group has ended");
    }

    const memberToken = crypto.randomUUID();
    let etaMinutes: number | null = null;
    if (data.origin) {
      etaMinutes = await memberEtaMinutes(data.origin, {
        lat: group.destination_lat,
        lng: group.destination_lng,
      });
    }
    const { error: iErr } = await supabaseAdmin.from("trip_group_members").insert({
      group_id: group.id,
      member_token: memberToken,
      display_name: data.displayName.slice(0, 40),
      last_lat: data.origin?.lat ?? null,
      last_lng: data.origin?.lng ?? null,
      last_updated: data.origin ? new Date().toISOString() : null,
      eta_minutes: etaMinutes,
      status: "active",
      is_creator: false,
    });
    if (iErr) throw new Error(`join failed: ${iErr.message}`);
    return { memberToken, etaMinutes };
  });
